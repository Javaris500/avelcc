import { and, eq } from "drizzle-orm";

import type { ErrorCode } from "#/contract/shared/errors";
import type { Db } from "#/modules/db/client";
import { exports, missions } from "#/modules/db/schema";
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
import { packageSha256, sha256Hex } from "#/modules/export/render/manifest";

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
	code: ErrorCode;
	detail: string;
	/** The status the contract declares for this code on this route. */
	status: 403 | 404 | 409 | 422 | 502;
	/** Structured payload. Carries the original export id on a replay. */
	details?: Record<string, unknown>;
};

export type ExportResult =
	| { ok: true; export: ExportRow }
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
	return next as ExportRow;
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
): Promise<Prepared> {
	const { db } = deps;

	let current = await advance(db, row, "rendering");
	const files = await deps.renderPackage(mission);

	// The package hash, over paths and per-file hashes — the same preimage the
	// manifest uses, so the number here is the number the package states.
	const packageHash = packageSha256(
		[...files.entries()].map(([path, bytes]) => ({
			path,
			sha256: sha256Hex(bytes),
		})),
	);

	current = await advance(db, current, "verifying");

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

	const existing = await findByKey(db, input.idempotencyKey);
	if (existing) return { ok: true, export: existing };

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

	if (input.target !== "zip" && !input.connectionId) {
		return fail(
			"REPO_NO_ACCESS",
			403,
			`A ${input.target} export must name the connection that authorizes it. None was supplied, and exports_remote_target_requires_connection refuses the row.`,
		);
	}

	const resolved = resolveRepo(input.target, mission.repoUrl, input.repoUrl);
	if (!resolved.ok) return { ok: false, failure: resolved.failure };

	const [created] = await db
		.insert(exports)
		.values({
			missionId: mission.id,
			sprintN: mission.sprintN,
			idempotencyKey: input.idempotencyKey,
			targetKind: input.target,
			connectionId: input.connectionId ?? null,
			dryRun: true,
			status: "pending",
		})
		.returning();

	let row = created as ExportRow;
	try {
		const prepared = await prepare(
			deps,
			row,
			mission,
			resolved.repo,
			input.ref ?? "main",
		);
		row = await advance(db, prepared.row, "previewed");
		return { ok: true, export: row };
	} catch (error) {
		await markFailed(db, row);
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

	if (input.target !== "zip" && !input.connectionId) {
		return fail(
			"REPO_NO_ACCESS",
			403,
			`A ${input.target} export must name the connection that authorizes it.`,
		);
	}

	const resolved = resolveRepo(input.target, mission.repoUrl, input.repoUrl);
	if (!resolved.ok) return { ok: false, failure: resolved.failure };

	// Loaded BEFORE the row is created, so a bad preview reference costs no row.
	let preview: PreviewFacts | null = null;
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
	}

	const [created] = await db
		.insert(exports)
		.values({
			missionId: mission.id,
			sprintN: mission.sprintN,
			idempotencyKey: input.idempotencyKey,
			targetKind: input.target,
			connectionId: input.connectionId ?? null,
			dryRun: false,
			previewExportId: input.previewExportId ?? null,
			status: "pending",
		})
		.returning();

	let row = created as ExportRow;

	try {
		const prepared = await prepare(deps, row, mission, resolved.repo, "main");
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

		return { ok: true, export: row };
	} catch (error) {
		await markFailed(db, row);
		throw error;
	}
}
