import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";

import { neon } from "@neondatabase/serverless";

import {
	bool,
	frontMatter,
	type Header,
	int,
	list,
	parseHeader,
	str,
	tableRows,
	tokens,
	usd,
	wallToSeconds,
} from "#/modules/db/ingest/parseTeam5";

/**
 * Loading `.team-5/` into the telemetry tables.
 *
 * ONE TRANSACTION, ALL SIX TABLES OR NONE. The tables are append-only and the
 * refusal is enforced by a trigger, so a partial load cannot be repaired: no
 * UPDATE to fix a row, no DELETE to remove one, and `dispatches_ref_unique`
 * turns a re-run into a collision rather than a resume. Recovering from a half
 * load means recreating the tables. So every row is built and validated in
 * memory first, ids are generated client-side so foreign keys resolve before
 * anything is sent, and the whole set goes in one statement batch.
 *
 * DRY BY DEFAULT. Pass `--commit` to write. Anything else prints the plan.
 */

const T5 = "//wsl.localhost/Ubuntu/home/jt0629/projects/counselOS/.team-5";
const ROOT = "//wsl.localhost/Ubuntu/home/jt0629/projects/counselOS";

/** COST-LOG's mission column to the mission rows already in Neon. */
const MISSION_BY_LABEL: Record<string, string> = {
	"001": "338a6e9d",
	"002": "40d19f93",
};

const read = (p: string): string => readFileSync(p, "utf8");
const corpusFiles = (dir: string): string[] =>
	readdirSync(`${T5}/${dir}`)
		.filter((n) => n.endsWith(".md") && !n.startsWith("_TEMPLATE"))
		.map((n) => `${dir}/${n}`);

const header = (rel: string): Header =>
	parseHeader(frontMatter(read(`${T5}/${rel}`)) ?? "");

/** `2026-08-23` or undefined. Anything else is refused rather than coerced. */
function isoDate(v: string | undefined): string | undefined {
	if (!v) return undefined;
	return /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : undefined;
}

export interface Plan {
	dispatches: Record<string, unknown>[];
	completions: Record<string, unknown>[];
	findings: Record<string, unknown>[];
	blockers: Record<string, unknown>[];
	costEntries: Record<string, unknown>[];
	notes: string[];
}

export function buildPlan(missions: {
	slice0: string;
	slice1: string;
	engagement0: string;
	engagement1: string;
}): Plan {
	const notes: string[] = [];

	/* dispatches — every one in the corpus is slice 1 */
	const dispatchIdByRef = new Map<string, string>();
	const dispatches = corpusFiles("dispatch").map((rel) => {
		const h = header(rel);
		const fb = h.nested.get("file_boundary");
		const ref = str(h, "dispatch_ref") ?? str(h, "dispatch_id");
		if (!ref) throw new Error(`${rel}: no dispatch_id — refusing to load`);
		const id = randomUUID();
		dispatchIdByRef.set(ref, id);
		return {
			id,
			missionId: missions.slice1,
			agentSlug: str(h, "agent") ?? "unknown",
			dispatchRef: ref,
			slice: str(h, "slice") ?? "unknown",
			branch: str(h, "branch") ?? null,
			issuedOn: isoDate(str(h, "issued")) ?? null,
			scope: str(h, "scope") ?? null,
			writablePaths: fb?.get("may_edit") ?? [],
			appendOnlyPaths: fb?.get("may_append_only") ?? [],
			readonlyPaths: fb?.get("must_not_touch") ?? [],
			buildsAgainst: str(h, "builds_against") ?? null,
			exitCondition: str(h, "exit_condition") ?? null,
			sliceHardStops: list(h, "slice_hard_stops"),
		};
	});

	/* completions */
	const completions = corpusFiles("reports").map((rel) => {
		const h = header(rel);
		const ref = str(h, "dispatch_id");
		const dispatchId = ref ? dispatchIdByRef.get(ref) : undefined;
		if (!dispatchId) {
			throw new Error(
				`${rel}: dispatch_id ${JSON.stringify(ref)} matches no dispatch. ` +
					"Their README: a completion without a matching dispatch cannot be harvested.",
			);
		}
		const selfCheck = str(h, "self_check");
		return {
			id: randomUUID(),
			dispatchId,
			status: str(h, "status") ?? "complete",
			branch: str(h, "branch") ?? null,
			completedOn: isoDate(str(h, "completed")) ?? null,
			summary: null,
			filesTouched: list(h, "files_touched"),
			sharedFilesTouched: list(h, "shared_files_touched"),
			componentsCreated: list(h, "components_created"),
			errorCodesHandled: list(h, "error_codes_handled"),
			contractDrift: list(h, "contract_drift"),
			testidsAdded: bool(h, "testids_added") ?? null,
			fourStatesCovered: bool(h, "four_states_covered") ?? null,
			mockUsed: bool(h, "mock_used") ?? null,
			selfCheckPassed:
				selfCheck === "passed" ? true : selfCheck === "failed" ? false : null,
			decisionsCount: int(h, "decisions") ?? null,
			/**
			 * The playbook declares the gate vocabulary; this records the
			 * measurement against it. CounselOS's gate is `playwright`, and its
			 * `pass | fail | not_run` maps onto the verdict/non-verdict split in
			 * gates.ts — `not_run` is a non-verdict and carries no source, which is
			 * the distinction that module exists to keep.
			 */
			gateMeasurements: (() => {
				const g = str(h, "playwright_gate");
				if (!g) return null;
				// A GATE THAT DID NOT RUN HAS NO MEASUREMENT, so it contributes no
				// entry. Writing `{ state: null, source: null }` would persist a shape
				// that satisfies neither branch of GateResult — that union exists so a
				// verdict cannot be recorded without saying how it was reached, and
				// jsonb would have accepted the violation silently. evaluateGates
				// already yields `pending` with no source for a gate it has no
				// measurement for, which is the correct reading of `not_run`.
				//
				// `[]` rather than null here is deliberate: the field was present and
				// said the gate did not run, which is different from a completion that
				// recorded nothing about gates at all.
				if (g === "not_run") return [];
				return [
					{
						gate: "playwright",
						state: g === "pass" ? "pass" : "block",
						source: "mechanical",
					},
				];
			})(),
		};
	});

	/* findings */
	const findings: Record<string, unknown>[] = [];
	for (const rel of corpusFiles("findings")) {
		const h = header(rel);
		const count = int(h, "findings_count") ?? 0;
		const severities = list(h, "severity");
		const categories = list(h, "categories");
		if (severities.length !== count) {
			throw new Error(
				`${rel}: findings_count ${count} but ${severities.length} severity values`,
			);
		}
		const aligned = categories.length === count;
		if (!aligned) {
			notes.push(
				`${rel}: categories is a SET of ${categories.length} for ${count} findings, ` +
					"not a per-finding list. category left NULL rather than zipped — a finding " +
					"with an unknown category is better than one wearing another's.",
			);
		}
		for (let i = 0; i < count; i += 1) {
			findings.push({
				id: randomUUID(),
				missionId: missions.slice1,
				engagementId: missions.engagement1,
				sourceFile: rel.replace("findings/", ""),
				ordinal: i + 1,
				// No per-finding rule identifier exists in the corpus; the file plus
				// its ordinal IS the identifier, so that is what `rule` carries.
				rule: `${rel.replace("findings/", "").replace(/\.md$/, "")}#${i + 1}`,
				subject: str(h, "target_agent") ?? "unknown",
				targetAgent: str(h, "target_agent") ?? null,
				filePath: null,
				severity: severities[i] as string,
				category: aligned ? (categories[i] as string) : null,
				reviewerKind: (() => {
					const r = str(h, "reviewer") ?? "";
					if (r === "operator") return "operator";
					if (/\d+\.\d+/.test(r)) return "tool";
					return "agent";
				})(),
				reviewerRef: str(h, "reviewer") ?? "unknown",
				detail: null,
				openedOn: isoDate(str(h, "reviewed")),
			});
		}
	}

	/* blockers — the error-log ledger, closure by reference */
	const blockerIdByRef = new Map<number, string>();
	const rawBlockers: {
		ledgerRef: number;
		row: string[];
		closesRef?: number;
	}[] = [];
	for (const row of tableRows(read(`${T5}/log/error-log.md`))) {
		if (row.length < 8) continue;
		const n = Number.parseInt(row[0] as string, 10);
		if (!Number.isFinite(n)) continue;
		if ((row[1] as string) === "2026-01-15") {
			notes.push(
				"log/error-log.md: the illustration row sits inside the same table as " +
					"real rows and is identifiable only by its 2026-01-15 date. Skipped, " +
					"but a real row on that date would be dropped — the fix belongs in " +
					"their file, not in this parser.",
			);
			continue;
		}
		const closes = (row[4] as string).match(/Closes row (\d+)/i);
		rawBlockers.push({
			ledgerRef: n,
			row,
			closesRef: closes ? Number(closes[1]) : undefined,
		});
		blockerIdByRef.set(n, randomUUID());
	}
	const blockers = rawBlockers.map(({ ledgerRef, row, closesRef }) => ({
		id: blockerIdByRef.get(ledgerRef) as string,
		missionId: missions.slice1,
		engagementId: missions.engagement1,
		ledgerRef,
		dispatchId: null,
		agentSlug: (row[2] as string) || null,
		slice: (row[3] as string) || null,
		raisedOn: isoDate(row[1] as string) ?? null,
		blocker: row[4] as string,
		escalatedTo: (row[5] as string) || null,
		resolution: (row[6] as string) || null,
		status: row[7] as string,
		closesBlockerId:
			closesRef !== undefined ? (blockerIdByRef.get(closesRef) ?? null) : null,
	}));

	/* cost entries */
	const costText = read(`${ROOT}/COST-LOG.md`);
	const splitFor: Record<string, Record<string, number | undefined>> = {
		operator: {},
		transactions: {},
	};
	for (const r of tableRows(costText)) {
		if (r.length !== 3) continue;
		const label = r[0] as string;
		const key = /uncached/.test(label)
			? "inputUncached"
			: /cache \*\*writes/.test(label)
				? "inputCacheWrite"
				: /cache \*\*reads/.test(label)
					? "inputCacheRead"
					: /^output$/.test(label)
						? "outputTokens"
						: /assistant turns/.test(label)
							? "assistantTurns"
							: null;
		if (!key) continue;
		(splitFor.operator as Record<string, number | undefined>)[key] = tokens(
			r[1],
		);
		(splitFor.transactions as Record<string, number | undefined>)[key] = tokens(
			r[2],
		);
	}

	const costEntries: Record<string, unknown>[] = [];
	for (const row of tableRows(costText)) {
		if (row.length < 11) continue;
		const label = row[0] as string;
		if (!/^\d+$|^—$/.test(label)) continue;
		const actorRef = row[3] as string;
		const isOperator = actorRef.startsWith("operator");
		const missionLabel = row[2] as string;
		// FAIL, NOT FALL THROUGH. The previous shape sent any unmapped label —
		// a blank cell, an em dash, a future mission 003 — to slice1 by default,
		// which is the same "put a wrong value somewhere permanent" the split
		// assertion below refuses. An unknown mission is not a slice-1 mission.
		const missionPrefix = MISSION_BY_LABEL[missionLabel];
		if (!missionPrefix) {
			throw new Error(
				`COST-LOG row ${label}: mission ${JSON.stringify(missionLabel)} is not ` +
					`in the known set ${JSON.stringify(Object.keys(MISSION_BY_LABEL))}. ` +
					"Refusing to guess which mission it belongs to.",
			);
		}
		const missionId =
			missionPrefix === "338a6e9d" ? missions.slice0 : missions.slice1;
		const dispatchRef =
			(row[4] as string) === "—" ? undefined : (row[4] as string);
		const split = isOperator
			? splitFor.operator
			: (splitFor.transactions as Record<string, number | undefined>);
		const total = tokens(row[6] as string);

		// FAIL, NOT WARN. A split that does not reconcile against its own total
		// means one of the two was transcribed wrong, and loading it would put a
		// wrong number somewhere permanent.
		if (total !== undefined) {
			const sum =
				(split.inputUncached ?? 0) +
				(split.inputCacheWrite ?? 0) +
				(split.inputCacheRead ?? 0);
			if (sum !== total) {
				throw new Error(
					`COST-LOG row ${label}: token split sums to ${sum} but the ledger ` +
						`says ${total}. Refusing to load a figure that does not reconcile.`,
				);
			}
		}

		costEntries.push({
			id: randomUUID(),
			missionId,
			dispatchId: dispatchRef
				? (dispatchIdByRef.get(dispatchRef) ?? null)
				: null,
			actorKind: isOperator ? "operator" : "agent",
			actorRef,
			occurredOn: isoDate(row[1] as string) ?? null,
			model: (row[5] as string) === "—" ? null : (row[5] as string),
			inputUncached: total === undefined ? null : (split.inputUncached ?? null),
			inputCacheWrite:
				total === undefined ? null : (split.inputCacheWrite ?? null),
			inputCacheRead:
				total === undefined ? null : (split.inputCacheRead ?? null),
			outputTokens: tokens(row[7] as string) ?? null,
			usd: usd(row[8] as string) ?? null,
			wallSeconds: wallToSeconds(row[9] as string) ?? null,
			assistantTurns:
				total === undefined ? null : (split.assistantTurns ?? null),
			outcome: (row[10] as string) === "—" ? null : (row[10] as string) || null,
			note: null,
		});
	}

	return { dispatches, completions, findings, blockers, costEntries, notes };
}

/* ── runner ─────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
	try {
		process.loadEnvFile(".env");
	} catch {
		// Fall through to the ambient environment.
	}
	const url = process.env.DATABASE_URL_DIRECT;
	if (!url) throw new Error("DATABASE_URL_DIRECT is not set");
	const sql = neon(url);
	const commit = process.argv.includes("--commit");

	const rows = (await sql.query(
		`select id, engagement_id, sprint_n from missions order by sprint_n`,
	)) as unknown as { id: string; engagement_id: string; sprint_n: number }[];
	const slice0 = rows.find((r) => r.id.startsWith("338a6e9d"));
	const slice1 = rows.find((r) => r.id.startsWith("40d19f93"));
	if (!slice0 || !slice1) {
		throw new Error(
			`expected missions 338a6e9d and 40d19f93; found ${rows.map((r) => r.id.slice(0, 8)).join(", ")}`,
		);
	}

	const plan = buildPlan({
		slice0: slice0.id,
		slice1: slice1.id,
		engagement0: slice0.engagement_id,
		engagement1: slice1.engagement_id,
	});

	console.log("PLAN");
	console.log("  dispatches   ", plan.dispatches.length);
	console.log("  completions  ", plan.completions.length);
	console.log("  findings     ", plan.findings.length);
	console.log("  blockers     ", plan.blockers.length);
	console.log("  cost_entries ", plan.costEntries.length);
	console.log(
		"  TOTAL        ",
		plan.dispatches.length +
			plan.completions.length +
			plan.findings.length +
			plan.blockers.length +
			plan.costEntries.length,
	);
	for (const n of plan.notes) console.log(`  note: ${n}`);

	if (!commit) {
		console.log("\nDRY RUN — nothing written. Pass --commit to load.");
		return;
	}

	const q: unknown[] = [];
	for (const d of plan.dispatches) {
		q.push(
			sql.query(
				`insert into dispatches (id,mission_id,agent_slug,dispatch_ref,slice,branch,issued_on,scope,
				 writable_paths,append_only_paths,readonly_paths,builds_against,exit_condition,slice_hard_stops)
				 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
				[
					d.id,
					d.missionId,
					d.agentSlug,
					d.dispatchRef,
					d.slice,
					d.branch,
					d.issuedOn,
					d.scope,
					d.writablePaths,
					d.appendOnlyPaths,
					d.readonlyPaths,
					d.buildsAgainst,
					d.exitCondition,
					d.sliceHardStops,
				],
			),
		);
	}
	for (const c of plan.completions) {
		q.push(
			sql.query(
				`insert into completions (id,dispatch_id,status,branch,completed_on,summary,files_touched,
				 shared_files_touched,components_created,error_codes_handled,contract_drift,testids_added,
				 four_states_covered,mock_used,self_check_passed,decisions_count,gate_measurements)
				 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
				[
					c.id,
					c.dispatchId,
					c.status,
					c.branch,
					c.completedOn,
					c.summary,
					c.filesTouched,
					c.sharedFilesTouched,
					c.componentsCreated,
					c.errorCodesHandled,
					c.contractDrift,
					c.testidsAdded,
					c.fourStatesCovered,
					c.mockUsed,
					c.selfCheckPassed,
					c.decisionsCount,
					c.gateMeasurements === null
						? null
						: JSON.stringify(c.gateMeasurements),
				],
			),
		);
	}
	for (const f of plan.findings) {
		q.push(
			sql.query(
				`insert into findings (id,mission_id,engagement_id,source_file,ordinal,rule,subject,
				 target_agent,file_path,severity,category,reviewer_kind,reviewer_ref,detail,opened_at)
				 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,coalesce($15::timestamptz, now()))`,
				[
					f.id,
					f.missionId,
					f.engagementId,
					f.sourceFile,
					f.ordinal,
					f.rule,
					f.subject,
					f.targetAgent,
					f.filePath,
					f.severity,
					f.category,
					f.reviewerKind,
					f.reviewerRef,
					f.detail,
					f.openedOn ?? null,
				],
			),
		);
	}
	for (const b of plan.blockers) {
		q.push(
			sql.query(
				`insert into blockers (id,mission_id,engagement_id,ledger_ref,dispatch_id,agent_slug,slice,
				 raised_on,blocker,escalated_to,resolution,status,closes_blocker_id)
				 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
				[
					b.id,
					b.missionId,
					b.engagementId,
					b.ledgerRef,
					b.dispatchId,
					b.agentSlug,
					b.slice,
					b.raisedOn,
					b.blocker,
					b.escalatedTo,
					b.resolution,
					b.status,
					b.closesBlockerId,
				],
			),
		);
	}
	for (const c of plan.costEntries) {
		q.push(
			sql.query(
				`insert into cost_entries (id,mission_id,dispatch_id,actor_kind,actor_ref,occurred_on,model,
				 input_uncached,input_cache_write,input_cache_read,output_tokens,usd,wall_seconds,
				 assistant_turns,outcome,note)
				 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
				[
					c.id,
					c.missionId,
					c.dispatchId,
					c.actorKind,
					c.actorRef,
					c.occurredOn,
					c.model,
					c.inputUncached,
					c.inputCacheWrite,
					c.inputCacheRead,
					c.outputTokens,
					c.usd,
					c.wallSeconds,
					c.assistantTurns,
					c.outcome,
					c.note,
				],
			),
		);
	}

	// ONE TRANSACTION. Every table or none.
	await (
		sql as unknown as { transaction: (qs: unknown[]) => Promise<unknown> }
	).transaction(q);

	// READ BACK FROM THE DATABASE, not from intent. The tables are append-only,
	// so what is permanently there is the only number that means anything.
	console.log("\nCOMMITTED — read back from Neon:");
	for (const t of [
		"dispatches",
		"completions",
		"findings",
		"finding_dispositions",
		"blockers",
		"cost_entries",
	]) {
		const r = (await sql.query(
			`select count(*)::int n from ${t}`,
		)) as unknown as {
			n: number;
		}[];
		console.log(`  ${t.padEnd(21)} ${r[0]?.n}`);
	}
}

if (process.argv[1]?.includes("loadTeam5")) {
	main().catch((e) => {
		console.error("LOAD FAILED:", (e as Error).message);
		process.exitCode = 1;
	});
}
