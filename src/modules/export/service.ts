import { and, eq, isNull } from "drizzle-orm";

import type { CrudCode, ErrorCode } from "#/contract/shared/errors";
import type { Db } from "#/modules/db/client";
import { connections, exports, missions, playbooks } from "#/modules/db/schema";
import type { RemoteTree, Violation } from "#/modules/export/blast/types";
import { checkDeliverable } from "#/modules/export/delivery/guards";
import {
	assertTransition,
	type ExportStatus,
	type ExportTargetKind,
	terminalStatusFor,
} from "#/modules/export/delivery/lifecycle";
import type {
	DeliveryContext,
	DeliveryTarget,
	PreviewFacts,
} from "#/modules/export/delivery/types";
import { GatewayError } from "#/modules/export/gateway/types";
import { packageSha256, sha256Hex } from "#/modules/export/render/manifest";
import {
	evaluateGates,
	type GateOverride,
	type Verification,
} from "#/modules/export/verify/gates";

/**
 * Export orchestration: the state machine between a mission and a delivery.
 *
 * This is the layer that DECIDES. The guards are pure and the targets are
 * thin, so every ordering rule — render before hashing, hash before comparing,
 * compare before writing, advance status only along a legal edge — lives here
 * and in one place.
 *
 * Everything external is injected. Not for test ergonomics: the render input
 * assembler does not exist yet (see `RenderPackage`), and a service that
 * imported a concrete renderer could not be written at all until it did.
 */

/* ── what the service needs from the outside ─────────────────────────────── */

/**
 * Mission -> rendered package.
 *
 * INJECTED BECAUSE IT IS NOT BUILT. `render()` takes a RenderMission — roster,
 * playbook, per-agent skills — and nothing assembles one from Neon yet. That
 * assembler is a real module and its absence is the reason delivery cannot yet
 * run for a live mission. Injecting it means this service is complete and
 * exercisable now, against the golden fixture, rather than blocked behind it.
 */
export type RenderPackage = (mission: {
	id: string;
	type: string;
	sprintN: number;
	brief: Record<string, unknown>;
}) => Promise<ReadonlyMap<string, Uint8Array>>;

export type ExportDeps = {
	db: Db;
	renderPackage: RenderPackage;
	targetFor: (kind: ExportTargetKind) => DeliveryTarget;
	/** Only reached for a GitHub target. A zip has no remote to read. */
	readRemote?: (t: {
		owner: string;
		repo: string;
		ref: string;
	}) => Promise<RemoteTree>;
	/** Blast radius over the rendered package against the remote tree. */
	computeRadius?: (
		files: ReadonlyMap<string, Uint8Array>,
		remote: RemoteTree,
	) => { violations: Violation[]; radius: Record<string, unknown> };
};

/* ── results ─────────────────────────────────────────────────────────────── */

export type ExportFailure = {
	/**
	 * BOTH VOCABULARIES, declared rather than cast through.
	 *
	 * This module genuinely emits two: the export codes for everything about a
	 * repository or a package, and CRUD_CODES' PRECONDITION_FAILED for a blocked
	 * gate, which ERROR_CODES cannot express. Typing this as ErrorCode alone and
	 * casting at the one call site would have hidden a real property of the
	 * module behind an `as unknown as`, which is the shape of lie this codebase
	 * keeps finding in its own comments.
	 *
	 * The route maps whichever arrives; a screen switching on the code can tell
	 * them apart because the two sets are disjoint by design.
	 */
	code: ErrorCode | CrudCode;
	detail: string;
	/** The status the contract declares for this code on this route. */
	status: 403 | 404 | 409 | 422 | 502;
	/** Structured payload. Carries the original export id on a replay. */
	details?: Record<string, unknown>;
};

export type ExportResult =
	| { ok: true; export: ExportRow; meta?: Record<string, unknown> }
	| { ok: false; failure: ExportFailure };

export type ExportRow = typeof exports.$inferSelect;

const fail = (
	code: ErrorCode,
	status: ExportFailure["status"],
	detail: string,
	details?: Record<string, unknown>,
): ExportResult => ({ ok: false, failure: { code, status, detail, details } });

/* ── helpers ─────────────────────────────────────────────────────────────── */

/**
 * Advances an Export along a LEGAL edge or throws.
 *
 * Every status write in this file goes through here. A bare `.set({ status })`
 * would let the dry-run and delivery paths drift apart, which is the drift
 * `previewing` being shared exists to prevent.
 */
async function advance(
	db: Db,
	row: ExportRow,
	to: ExportStatus,
	extra: Partial<typeof exports.$inferInsert> = {},
): Promise<ExportRow> {
	assertTransition(row.status, to);
	const [next] = await db
		.update(exports)
		.set({ ...extra, status: to })
		.where(eq(exports.id, row.id))
		.returning();
	/**
	 * An UPDATE that matched nothing means the row is gone underneath us. Casting
	 * `undefined` through as an ExportRow defers the failure to the NEXT advance,
	 * which dereferences `row.status` and throws a TypeError from inside
	 * assertTransition — mid-delivery, with a message about nothing.
	 */
	if (!next) {
		throw new Error(
			`Export ${row.id} disappeared while advancing ${row.status} -> ${to}.`,
		);
	}
	return next;
}

/**
 * Marks an export failed and rethrows nothing.
 *
 * A delivery that threw leaves a row mid-flight, and a row stuck at
 * `delivering` is indistinguishable from one still running. Recording the
 * terminal state is what makes the difference visible.
 */
async function markFailed(db: Db, row: ExportRow): Promise<void> {
	if (row.status === "failed" || terminal(row.status)) return;
	await db
		.update(exports)
		.set({ status: "failed" })
		.where(eq(exports.id, row.id));
}

const terminal = (s: ExportStatus) =>
	s === "done" || s === "failed" || s === "previewed";

/** `https://github.com/owner/repo(.git)` -> its parts, or null. */
export function parseRepoUrl(
	url: string,
): { owner: string; repo: string } | null {
	const m = /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(
		url.trim(),
	);
	return m ? { owner: m[1] as string, repo: m[2] as string } : null;
}

async function findByKey(db: Db, key: string): Promise<ExportRow | undefined> {
	const [row] = await db
		.select()
		.from(exports)
		.where(eq(exports.idempotencyKey, key))
		.limit(1);
	return row;
}

/* ── reads ───────────────────────────────────────────────────────────────── */

export async function getExport(db: Db, id: string): Promise<ExportRow | null> {
	const [row] = await db
		.select()
		.from(exports)
		.where(eq(exports.id, id))
		.limit(1);
	return row ?? null;
}

/* ── the shared first half ───────────────────────────────────────────────── */

type Prepared = {
	row: ExportRow;
	files: ReadonlyMap<string, Uint8Array>;
	/**
	 * The PACKAGE hash — over the rendered paths and their bytes. NOT
	 * `snapshot_sha256`, which hashes the stored archive. The two are different
	 * preimages and a zip's differ by construction; conflating them is what this
	 * rename exists to prevent, having already caused one bug here.
	 */
	packageHash: string;
	baseCommitSha: string | null;
	violations: Violation[];
	radius: Record<string, unknown> | null;
	verification: Verification & { computedAt: string };
};

/**
 * pending -> rendering -> verifying -> previewing, for BOTH paths.
 *
 * Shared deliberately. "Both paths run `previewing`, so the pre-flight screen
 * and the delivery path share one code path — the preview is not a separate
 * simulation that can drift from reality."
 */
async function prepare(
	deps: ExportDeps,
	row: ExportRow,
	mission: {
		id: string;
		type: string;
		sprintN: number;
		brief: Record<string, unknown>;
	},
	/** Already resolved and parsed by the caller. null only for a zip. */
	repo: { owner: string; repo: string } | null,
	ref: string,
	override: GateOverride | null,
): Promise<Prepared> {
	const { db } = deps;

	let current = await advance(db, row, "rendering");
	const files = await deps.renderPackage(mission);

	/**
	 * The package hash, over the SAME preimage manifest.json uses — which means
	 * manifest.json is excluded from it.
	 *
	 * `packagePreimage` skips it (a manifest cannot hash itself), and `render()`
	 * puts it into the returned map. Hashing every entry here therefore produced
	 * a number that could never equal the one printed inside the artifact, so the
	 * value persisted for querying disagreed with the package's own manifest and
	 * was published into PR bodies as "Package sha256". The determinism gate
	 * still worked, because it compared this value against itself — which is
	 * exactly why the disagreement went unnoticed.
	 */
	const packageHash = packageHashOf(files);

	/**
	 * VERIFYING NOW VERIFIES SOMETHING. It previously walked this status and did
	 * nothing at all: `verification` was never written, no gate was ever
	 * evaluated, and `gate_override` existed in the contract for gates that did
	 * not exist. A status that looks like a mechanism and is not one is this
	 * project's stated failure mode, appearing inside the product.
	 *
	 * What it CANNOT do is measure. Nothing runs tests or coverage here, so
	 * every declared gate comes back `pending` with no source — which is the
	 * honest output. `evaluateGates` refuses to default an unmeasured gate to
	 * `pass`, so this reports the truth that almost nothing has been checked
	 * rather than manufacturing a clean bill.
	 */
	/**
	 * `isNull(deletedAt)` matters here more than anywhere. The live-uniqueness
	 * index on mission_type is PARTIAL, so once a playbook is soft-deleted
	 * several rows share a type and an unfiltered limit(1) may return the dead
	 * one — which would decide WHICH GATES BLOCK THIS DELIVERY.
	 */
	const [playbook] = await db
		.select({ gates: playbooks.gates })
		.from(playbooks)
		.where(
			and(eq(playbooks.missionType, mission.type), isNull(playbooks.deletedAt)),
		)
		.limit(1);

	const verification = {
		// The clock is the caller's, never the pure function's.
		computedAt: new Date().toISOString(),
		...evaluateGates(playbook?.gates ?? [], [], override),
	};

	current = await advance(db, current, "verifying", { verification });

	let baseCommitSha: string | null = null;
	let violations: Violation[] = [];
	let radius: Record<string, unknown> | null = null;

	/**
	 * A ZIP COMPUTES NO BLAST RADIUS. BLAST-RADIUS.md's Open section settles it:
	 * "there is no target repo. Skip `previewing` for zip." The status is still
	 * walked — the lifecycle is shared — but there is nothing remote to diff, so
	 * an empty radius here is the honest value rather than a skipped step.
	 */
	if (
		row.targetKind !== "zip" &&
		repo &&
		deps.readRemote &&
		deps.computeRadius
	) {
		const remote = await deps.readRemote({ ...repo, ref });
		baseCommitSha = remote.commitSha || null;
		const computed = deps.computeRadius(files, remote);
		violations = computed.violations;
		radius = computed.radius;
	}

	/**
	 * THE PACKAGE HASH GOES IN `version_manifest`, NOT `snapshot_sha256`.
	 *
	 * It has to be persisted or the determinism gate cannot work — that check
	 * compares a real export's hash against the hash its PREVIEW recorded, and a
	 * preview that stored nothing gives it nothing to compare. The snapshot
	 * columns are not the place: `exports_snapshot_all_or_none` refuses one of
	 * three, and they describe the stored archive rather than the render.
	 *
	 * version_manifest is the right home on its own merits. DECISIONS-V2:99 puts
	 * the manifest in Postgres precisely so it is queryable rather than sealed
	 * inside the artifact, and package_sha256 is the manifest's headline field.
	 */
	current = await advance(db, current, "previewing", {
		versionManifest: { packageSha256: packageHash },
		baseRef: ref,
		baseCommitSha,
		blastRadius: radius ?? undefined,
	});

	return {
		row: current,
		files,
		packageHash,
		baseCommitSha,
		violations,
		radius,
		verification,
	};
}

/**
 * Which repository this export targets, and a refusal if a GitHub target has
 * none.
 *
 * The contract lets the caller override the mission's `repo_url` per export —
 * `repoUrl` is on both the preview and the create body — and that override was
 * being ignored entirely, so a caller supplying one silently got the mission's.
 *
 * The refusal matters more. Without it a GitHub export with no resolvable repo
 * ran the whole pipeline, passed every guard vacuously (no remote read means no
 * violations and a null tip), reached `delivering`, and only then threw from
 * inside the target — a 500, after a row had already claimed to be delivering.
 * A missing repository is knowable before any of that.
 *
 * REPO_NOT_FOUND is the contract's only declared 404 here and the noun is
 * right for once: there is no repository to deliver to.
 */
type RepoResolution =
	| { ok: true; repo: { owner: string; repo: string } | null }
	| { ok: false; failure: ExportFailure };

function resolveRepo(
	target: ExportTargetKind,
	missionRepoUrl: string | null,
	override: string | undefined,
): RepoResolution {
	if (target === "zip") return { ok: true, repo: null };

	const url = override ?? missionRepoUrl;
	if (!url) {
		return {
			ok: false,
			failure: {
				code: "REPO_NOT_FOUND",
				status: 404,
				detail: `A ${target} export needs a repository. The mission has no repo_url and the request supplied none.`,
			},
		};
	}
	const parsed = parseRepoUrl(url);
	if (!parsed) {
		return {
			ok: false,
			failure: {
				code: "REPO_NOT_FOUND",
				status: 404,
				detail: `Could not read an owner and repository out of ${url}. Expected https://github.com/owner/repo.`,
			},
		};
	}
	return { ok: true, repo: parsed };
}

/**
 * A blocked gate, answered in the CRUD vocabulary — the same deliberate
 * deviation `http.ts` documents for a malformed body, and the fifth instance of
 * one root gap.
 *
 * ERROR_CODES has nothing meaning "a mandatory gate did not pass". The nearest
 * export code is BLAST_RADIUS_VIOLATION, which renders as "delivery would write
 * outside the permitted paths" — telling an operator their package is dangerous
 * because a test did not run is worse than a vocabulary mismatch. CRUD_CODES'
 * PRECONDITION_FAILED is documented as "a hard precondition the request did not
 * meet", which is exactly what this is.
 */
function gateBlocked(blocking: readonly string[]): ExportResult {
	return {
		ok: false,
		failure: {
			code: "PRECONDITION_FAILED",
			status: 422,
			detail: `${blocking.length} mandatory gate(s) did not pass and were not overridden: ${blocking.join(", ")}. Nothing was delivered.`,
			details: { blocking: [...blocking] },
		},
	};
}

/**
 * Turns a thrown gateway failure into the contract's declared 502.
 *
 * Every network call in this module can throw a GatewayError, and until now
 * every one of them escaped both routes as an unhandled exception — a framework
 * 500 with no `success:false` envelope, so the client's error map never saw the
 * code it switches on. The contract declares `502: errorEnvelope` and nothing
 * ever returned one.
 *
 * `preflight.blast-radius.ts` already got this right; this is the same mapping,
 * moved into the service so all three export routes inherit it.
 */
function asGatewayFailure(error: unknown): ExportResult | null {
	if (error instanceof GatewayError) {
		return fail("EXTERNAL_GITHUB", 502, error.detail);
	}
	return null;
}

/**
 * The connection that authorizes a GitHub delivery.
 *
 * Resolved SERVER-SIDE from the mission's engagement rather than taken from the
 * request. DECISIONS-V2:103 scopes a Connection per engagement, so the mission
 * already determines which credential applies, and letting a caller name one
 * would let them borrow another engagement's authorization — the one-way door
 * `client_id` exists to keep shut.
 *
 * This is also why the routes pass no `connectionId`: the contract bodies have
 * no such field, and adding one would have been the wrong shape.
 */
async function resolveConnection(
	db: Db,
	engagementId: string,
): Promise<string | null> {
	const [row] = await db
		.select({ id: connections.id })
		.from(connections)
		.where(
			and(
				eq(connections.engagementId, engagementId),
				eq(connections.service, "github"),
				eq(connections.status, "active"),
				isNull(connections.deletedAt),
			),
		)
		.limit(1);
	return row?.id ?? null;
}

/**
 * `findByKey` then `insert` is not atomic, so two concurrent requests with one
 * key both pass the replay check and the loser violates
 * `exports_idempotency_key_unique`. That insert sits outside the try block, so
 * it escaped as an unhandled 500 rather than the 409 the contract declares.
 * Catching the constraint and re-reading turns the race into the intended
 * answer — the database, not the check, is what actually enforces uniqueness.
 */
function isUniqueViolation(error: unknown): boolean {
	// Postgres 23505. neon-http surfaces the driver error with `code` intact.
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "23505"
	);
}

/**
 * The package hash: the SAME preimage manifest.json uses, which means
 * manifest.json is excluded from it.
 *
 * `packagePreimage` skips it (a manifest cannot hash itself) and `render()`
 * puts it into the returned map, so hashing every entry produced a number that
 * could never equal the one printed inside the artifact. That value was
 * persisted for querying and published into PR bodies as "Package sha256".
 *
 * The determinism gate did not catch it, and could not: it compares this value
 * against itself, so a consistently wrong number passes. That is exactly why
 * this is extracted and pinned against `manifestJson` rather than left inside
 * `prepare` where only an end-to-end run would exercise it.
 */
export function packageHashOf(files: ReadonlyMap<string, Uint8Array>): string {
	return packageSha256(
		[...files.entries()]
			.filter(([path]) => path !== "manifest.json")
			.map(([path, bytes]) => ({ path, sha256: sha256Hex(bytes) })),
	);
}

/** Just enough of an Export row to decide whether it can authorize a delivery. */
export type ApprovableRow = {
	id: string;
	dryRun: boolean;
	status: ExportStatus;
	targetKind: ExportTargetKind;
};

/**
 * Can this row authorize a delivery? Returns the refusal, or null to allow.
 *
 * THE DEVICE BOUNDARY LIVES HERE. Only the id was checked before, so any
 * earlier row carrying a package hash satisfied `checkPreviewRequired` — a
 * completed github_pr delivery, or a failed row that got as far as
 * `previewing`. A github_push could be authorized by something no operator ever
 * reviewed as a blast radius, which is the precise rule the guard exists to
 * enforce.
 *
 * Extracted from `createExport` because that function needs a database and this
 * decision does not. A safety rule that can only be exercised by an end-to-end
 * run is a safety rule with no regression test.
 */
export function refuseUnapprovablePreview(
	row: ApprovableRow,
	target: ExportTargetKind,
): string | null {
	if (!row.dryRun || row.status !== "previewed") {
		return `Export ${row.id} is not an approved preview (dryRun=${row.dryRun}, status=${row.status}). A delivery must be approved from a preview that reached 'previewed'.`;
	}
	if (row.targetKind !== target) {
		return `Preview ${row.id} was computed for a ${row.targetKind}, not a ${target}. A blast radius for one target does not authorize another.`;
	}
	return null;
}

/**
 * Which ref a delivery renders against.
 *
 * A LINKED PREVIEW'S REF WINS OUTRIGHT. `createExport` hardcoded "main" while
 * `previewExport` honoured the caller's ref, so a preview taken against
 * `develop` and then approved re-read main's tree. Usually that failed the
 * staleness check; where the two tips coincided it PASSED, and the delivery
 * branch was also "main" — a github_push approved against develop writing to
 * main.
 *
 * The point of approving from a preview is that the delivery matches what was
 * reviewed, so a request cannot re-specify the branch afterwards.
 */
export function refForDelivery(
	previewRef: string | null,
	requestedRef: string | undefined,
): string {
	return previewRef ?? requestedRef ?? "main";
}

/**
 * Is this replayed key the SAME preview request, or a different one wearing it?
 *
 * One definition, used by both the read path and the unique-violation race
 * path. Two copies is how the race path came to be missing the check the read
 * path had.
 */
function isSamePreviewRequest(
	row: ExportRow,
	input: { missionId: string; target: ExportTargetKind },
): boolean {
	return (
		row.dryRun &&
		row.missionId === input.missionId &&
		row.targetKind === input.target
	);
}

async function loadMission(db: Db, id: string) {
	const [m] = await db
		.select()
		.from(missions)
		.where(and(eq(missions.id, id)))
		.limit(1);
	return m ?? null;
}

/* ── preview ─────────────────────────────────────────────────────────────── */

export type PreviewInput = {
	missionId: string;
	idempotencyKey: string;
	target: ExportTargetKind;
	/** Required by the schema CHECK for any non-zip target. */
	connectionId?: string;
	/** Overrides the mission's repo_url for this export only. */
	repoUrl?: string;
	ref?: string;
};

/**
 * A dry run: a REAL Export row, terminal at `previewed`, never promoted.
 *
 * REPLAYING A PREVIEW KEY RETURNS THE ORIGINAL AS A SUCCESS, unlike
 * `createExport`, which returns 409. That asymmetry is the contract's, not an
 * inconsistency: `export.preview` declares 201/403/404/422/502 and no 409 at
 * all, so there is no response in which a replay could be reported as a
 * conflict. It is also the safer default of the two — a preview writes nothing
 * anybody else can see, so handing back the one that exists costs nothing,
 * whereas a replayed DELIVERY must never be mistaken for a second one.
 */
export async function previewExport(
	deps: ExportDeps,
	input: PreviewInput,
): Promise<ExportResult> {
	const { db } = deps;

	/**
	 * A replayed key returns the original ONLY if it is the same request. The
	 * key alone is not enough: reusing a create key here would hand back a real
	 * delivery row as a `201` preview, and reusing a key across missions or
	 * targets would silently answer with something unrelated. A key that means
	 * something different from what was asked is a conflict, not a replay.
	 */
	const existing = await findByKey(db, input.idempotencyKey);
	if (existing) {
		if (!isSamePreviewRequest(existing, input)) {
			return fail(
				"IDEMPOTENCY_REPLAY",
				409,
				`Idempotency key ${input.idempotencyKey} already belongs to a different export.`,
				{ exportId: existing.id, dryRun: existing.dryRun },
			);
		}
		return { ok: true, export: existing };
	}

	const mission = await loadMission(db, input.missionId);
	if (!mission) {
		/**
		 * KNOWN WRONG NOUN, and the fourth instance of one vocabulary gap.
		 * `errorEnvelope` carries only ERROR_CODES, which has nothing meaning "no
		 * such mission" — REPO_NOT_FOUND is the nearest and it names the wrong
		 * thing. The detail says which id was not found so the operator is not
		 * left checking a repository that is fine. A MISSION_NOT_FOUND code is
		 * filed; this is its first caller.
		 */
		return fail(
			"REPO_NOT_FOUND",
			404,
			`No mission with id ${input.missionId}.`,
		);
	}

	const connectionId =
		input.target === "zip"
			? null
			: await resolveConnection(db, mission.engagementId);

	if (input.target !== "zip" && !connectionId) {
		return fail(
			"REPO_NO_ACCESS",
			403,
			`No active github connection is attached to this mission's engagement, so nothing authorizes a ${input.target}. exports_remote_target_requires_connection refuses the row.`,
		);
	}

	const resolved = resolveRepo(input.target, mission.repoUrl, input.repoUrl);
	if (!resolved.ok) return { ok: false, failure: resolved.failure };

	let created: ExportRow | undefined;
	try {
		[created] = await db
			.insert(exports)
			.values({
				missionId: mission.id,
				sprintN: mission.sprintN,
				idempotencyKey: input.idempotencyKey,
				targetKind: input.target,
				connectionId,
				dryRun: true,
				status: "pending",
			})
			.returning();
	} catch (error) {
		// Lost the race with a concurrent request holding the same key.
		if (!isUniqueViolation(error)) throw error;
		const winner = await findByKey(db, input.idempotencyKey);
		/**
		 * THE RACE PATH MUST APPLY THE SAME CHECK AS THE READ PATH. The guard a
		 * few lines above refuses a replay whose mission, target or dryRun
		 * differ; this branch returned the winner unconditionally, so two
		 * concurrent previews sharing a key but naming DIFFERENT MISSIONS left
		 * the loser holding the winner's unrelated export as a 201 success —
		 * exactly what that guard exists to prevent, reachable by losing a race
		 * instead of by reading first.
		 */
		if (winner) {
			if (isSamePreviewRequest(winner, input)) {
				return { ok: true, export: winner };
			}
			return fail(
				"IDEMPOTENCY_REPLAY",
				409,
				`Idempotency key ${input.idempotencyKey} already belongs to a different export.`,
				{ exportId: winner.id, dryRun: winner.dryRun },
			);
		}
		throw error;
	}
	if (!created) throw new Error("The export row was not created.");

	let row = created;
	try {
		const prepared = await prepare(
			deps,
			row,
			mission,
			resolved.repo,
			input.ref ?? "main",
			// A preview evaluates gates but is never handed an override: there is
			// nothing to unblock, because a preview delivers nothing.
			null,
		);
		row = await advance(db, prepared.row, "previewed");
		return { ok: true, export: row };
	} catch (error) {
		await markFailed(db, row);
		const gateway = asGatewayFailure(error);
		if (gateway) return gateway;
		throw error;
	}
}

/* ── create ──────────────────────────────────────────────────────────────── */

export type CreateInput = {
	missionId: string;
	idempotencyKey: string;
	target: ExportTargetKind;
	previewExportId?: string;
	connectionId?: string;
	/** Overrides the mission's repo_url for this export only. */
	repoUrl?: string;
	/** Ignored when a preview is linked: that preview's ref wins. See below. */
	ref?: string;
	/** Clears ONE blocking gate. Never clears a blast-radius violation. */
	gateOverride?: GateOverride;
	message?: string;
};

/**
 * The real export. Re-renders from scratch, checks every guard, then delivers.
 *
 * The re-render is not waste. The render is deterministic, so this package's
 * hash MUST equal its preview's, and a mismatch is a DETERMINISM_VIOLATION
 * caught automatically before anything is written — a determinism gate obtained
 * as a side effect of previewing.
 */
export async function createExport(
	deps: ExportDeps,
	input: CreateInput,
): Promise<ExportResult> {
	const { db } = deps;

	const replay = await findByKey(db, input.idempotencyKey);
	if (replay) {
		return fail(
			"IDEMPOTENCY_REPLAY",
			409,
			"This idempotency key already produced an export. Nothing was delivered a second time.",
			{ exportId: replay.id, status: replay.status },
		);
	}

	const mission = await loadMission(db, input.missionId);
	if (!mission) {
		return fail(
			"REPO_NOT_FOUND",
			404,
			`No mission with id ${input.missionId}.`,
		);
	}

	const connectionId =
		input.target === "zip"
			? null
			: await resolveConnection(db, mission.engagementId);

	if (input.target !== "zip" && !connectionId) {
		return fail(
			"REPO_NO_ACCESS",
			403,
			`No active github connection is attached to this mission's engagement, so nothing authorizes a ${input.target}.`,
		);
	}

	const resolved = resolveRepo(input.target, mission.repoUrl, input.repoUrl);
	if (!resolved.ok) return { ok: false, failure: resolved.failure };

	// Loaded BEFORE the row is created, so a bad preview reference costs no row.
	let preview: PreviewFacts | null = null;
	let previewRef: string | null = null;
	if (input.previewExportId) {
		const p = await getExport(db, input.previewExportId);
		if (!p) {
			return fail(
				"PREVIEW_REQUIRED",
				422,
				`No export with id ${input.previewExportId} to approve from.`,
			);
		}
		/**
		 * IT MUST ACTUALLY BE A PREVIEW, of this mission, for this target.
		 *
		 * Only the id was checked before, so any earlier row carrying a package
		 * hash satisfied `checkPreviewRequired` — a completed github_pr delivery, a
		 * failed row that got as far as `previewing`, or a preview of a different
		 * mission entirely. That defeats the rule the guard exists to enforce: a
		 * github_push could be authorized by something no operator ever reviewed
		 * as a blast radius. checkPreviewMatchesMission catches the wrong mission
		 * downstream; nothing caught the wrong KIND of row.
		 */
		const unapprovable = refuseUnapprovablePreview(p, input.target);
		if (unapprovable) return fail("PREVIEW_REQUIRED", 422, unapprovable);

		/**
		 * An export with no recorded package hash cannot be approved from.
		 * Silently treating it as "matches" would disable the determinism gate on
		 * exactly the rows where we know least, so it is refused instead.
		 */
		const recorded = (p.versionManifest as { packageSha256?: string } | null)
			?.packageSha256;
		if (!recorded) {
			return fail(
				"PREVIEW_REQUIRED",
				422,
				`Export ${p.id} recorded no package hash, so the re-render cannot be compared against it. Run a fresh preview.`,
			);
		}
		preview = {
			id: p.id,
			missionId: p.missionId,
			snapshotSha256: recorded,
			baseCommitSha: p.baseCommitSha,
			violations: [],
		};
		previewRef = p.baseRef;
	}

	let created: ExportRow | undefined;
	try {
		[created] = await db
			.insert(exports)
			.values({
				missionId: mission.id,
				sprintN: mission.sprintN,
				idempotencyKey: input.idempotencyKey,
				targetKind: input.target,
				connectionId,
				dryRun: false,
				previewExportId: input.previewExportId ?? null,
				status: "pending",
			})
			.returning();
	} catch (error) {
		if (!isUniqueViolation(error)) throw error;
		const winner = await findByKey(db, input.idempotencyKey);
		if (winner) {
			return fail(
				"IDEMPOTENCY_REPLAY",
				409,
				"This idempotency key already produced an export. Nothing was delivered a second time.",
				{ exportId: winner.id, status: winner.status },
			);
		}
		throw error;
	}
	if (!created) throw new Error("The export row was not created.");

	let row = created;

	try {
		/**
		 * THE REF WAS HARDCODED TO "main", AND THAT COULD WRITE TO THE WRONG
		 * BRANCH.
		 *
		 * `previewExport` honours `input.ref`; this did not. Preview against
		 * `develop` and approve, and the re-prepare read main's tree — so
		 * `checkPreviewFresh(develop_tip, main_tip)` failed and the export could
		 * never be delivered. In the worse case where the two tips happened to
		 * coincide, the staleness check PASSED and `ctx.target.branch` was also
		 * "main", so a github_push approved against develop wrote to main.
		 *
		 * A linked preview's ref wins outright. The whole point of approving from
		 * a preview is that the delivery matches what was reviewed, and letting a
		 * request re-specify the branch afterwards is exactly the drift the link
		 * exists to prevent.
		 */
		const ref = refForDelivery(previewRef, input.ref);
		const prepared = await prepare(
			deps,
			row,
			mission,
			resolved.repo,
			ref,
			input.gateOverride ?? null,
		);
		row = prepared.row;

		const verdict = checkDeliverable({
			kind: input.target,
			missionId: mission.id,
			preview,
			currentTipSha: prepared.baseCommitSha,
			realSnapshotSha256: prepared.packageHash,
			violations: prepared.violations,
		});

		if (!verdict.ok) {
			await markFailed(db, row);
			const { code, detail } = verdict.failure;
			return fail(code, code === "PREVIEW_STALE" ? 409 : 422, detail);
		}

		/**
		 * A MANDATORY GATE THAT DID NOT PASS STOPS THE DELIVERY.
		 *
		 * Distinct from a blast-radius violation, and the distinction is the one
		 * BLAST-RADIUS.md draws: gates concern work quality and an operator may
		 * accept the risk in writing; violations concern writing where you were
		 * not permitted and are never overridable. `evaluateGates` has already
		 * applied any override, so anything still in `blocking` is a mandatory
		 * gate nobody accepted.
		 *
		 * Today this blocks almost everything, because nothing measures a gate
		 * and an unmeasured mandatory gate is `pending`, not `pass`. That is the
		 * correct behaviour for a system with no test runner wired in, and it is
		 * why `playbooks.gates` defaults to an empty array — a playbook that
		 * declares no gates blocks nothing.
		 */
		if (prepared.verification.blocking.length > 0) {
			await markFailed(db, row);
			return gateBlocked(prepared.verification.blocking);
		}

		row = await advance(db, row, "delivering");

		const target = deps.targetFor(input.target);
		const ctx: DeliveryContext = {
			files: prepared.files,
			snapshotSha256: prepared.packageHash,
			missionId: mission.id,
			sprintN: mission.sprintN,
			target: resolved.repo
				? { ...resolved.repo, branch: row.baseRef ?? "main" }
				: null,
			baseCommitSha: prepared.baseCommitSha,
			message:
				input.message ?? `AVEL ${mission.type} sprint ${mission.sprintN}`,
		};

		const outcome = await target.deliver(ctx);

		/**
		 * THE SNAPSHOT COLUMNS STAY NULL, all three of them.
		 *
		 * `exports_snapshot_all_or_none` requires the key, the hash and the byte
		 * count together or none, and there is nowhere to put the bytes: R2 was
		 * never provisioned. Writing two of the three is refused by the database,
		 * and inventing a `snapshot_key` pointing at no object would satisfy the
		 * CHECK while making the row lie. So the delivery is recorded and the
		 * snapshot is not, until a bucket exists.
		 */
		row = await advance(db, row, terminalStatusFor(input.target), {
			prStatus: outcome.kind === "github_pr" ? "open" : null,
		});

		/**
		 * THE OUTCOME TRAVELS IN `meta`, BECAUSE THE TABLE HAS NOWHERE TO PUT IT.
		 *
		 * A successful github_pr previously returned a row saying `pr-open` and no
		 * way whatsoever to find the pull request — the number and url were
		 * computed and dropped on the floor. There are no columns for them, so
		 * persisting properly needs a migration; until then they at least reach
		 * the caller, and the success envelope already allows a `meta` object so
		 * this costs no contract change.
		 *
		 * The zip's BYTES are still lost. They cannot go in a JSON envelope and
		 * there is nowhere to store them, which is the R2 gap rather than an
		 * oversight. Its hash and length are returned so a caller can at least
		 * verify an archive they rebuild.
		 *
		 * `verdict.warning` rides along too. guards.ts says it is "returned rather
		 * than logged, so a caller that ignores it does so visibly" — it was being
		 * ignored invisibly, and it marks a PR whose blast radius no operator ever
		 * saw.
		 */
		return {
			ok: true,
			export: row,
			meta: {
				delivery:
					outcome.kind === "zip"
						? {
								kind: outcome.kind,
								sha256: outcome.sha256,
								byteLength: outcome.byteLength,
							}
						: outcome,
				...(verdict.warning ? { warning: verdict.warning } : {}),
			},
		};
	} catch (error) {
		await markFailed(db, row);
		const gateway = asGatewayFailure(error);
		if (gateway) return gateway;
		throw error;
	}
}
