import { neon } from "@neondatabase/serverless";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as schema from "#/modules/db/schema";
import { APPEND_ONLY_TABLES } from "#/modules/db/schema";

/**
 * EVERY APPEND-ONLY TABLE ACTUALLY REFUSES A MUTATION.
 *
 * The six telemetry tables record what was true when each row was written, and
 * closure is a new row referencing the old one. That rule is worth nothing as a
 * convention: the corpus these tables ingest only discovered it because a tool
 * refused an edit (`.team-5/log/error-log.md` row 9), and row 10 is an agent
 * explaining that a status written mid-flight records an intention rather than
 * a result. A rule enforced by a person is a rule that holds until the person
 * is in a hurry.
 *
 * 0015 attaches refuse_mutation() per table from an explicit array — the same
 * shape as 0003's set_updated_at, and therefore the same hazard: an array that
 * reads like a blanket rule and is not one. 0003's went stale the moment step 2
 * added tables, silently, and stayed that way until a test caught it. This
 * asserts the set in both directions against APPEND_ONLY_TABLES so a seventh
 * table cannot be added without its guard.
 *
 * Matched on the FUNCTION the trigger calls rather than on its name, so
 * renaming a trigger cannot make a missing one look present — the same reason
 * triggers.test.ts matches that way.
 */

// Self-sufficient locally; in CI the variable comes from the environment.
try {
	process.loadEnvFile(".env");
} catch {
	// No .env file. Fall through to whatever is already exported.
}

const URL = process.env.DATABASE_URL_DIRECT;

if (process.env.CI && !URL) {
	throw new Error(
		"DATABASE_URL_DIRECT is required in CI: the append-only guard cannot run " +
			"without a database, and a skipped guard protects nothing.",
	);
}

/* ── schema-side, no database needed ────────────────────────────────────── */

function declaredTables(): Map<string, string[]> {
	const out = new Map<string, string[]>();
	for (const value of Object.values(schema)) {
		if (!is(value, PgTable)) continue;
		const config = getTableConfig(value);
		out.set(
			config.name,
			config.columns.map((c) => c.name),
		);
	}
	return out;
}

describe("the append-only set is coherent in the schema", () => {
	it("names only tables that exist", () => {
		// Catches a typo in APPEND_ONLY_TABLES, which would otherwise produce a
		// migration that silently attaches nothing.
		const tables = declaredTables();
		const missing = APPEND_ONLY_TABLES.filter((t) => !tables.has(t));
		expect(
			missing,
			"APPEND_ONLY_TABLES names tables that do not exist",
		).toEqual([]);
	});

	it("gives no append-only table an updated_at column", () => {
		// AN updated_at ON A TABLE NOTHING MAY UPDATE IS A CONTRADICTION. It would
		// also be picked up by triggers.test.ts, which would then demand a
		// set_updated_at trigger on a table whose other trigger refuses the very
		// UPDATE that one exists to service. The two guards would fight.
		const tables = declaredTables();
		const offenders = APPEND_ONLY_TABLES.filter((t) =>
			(tables.get(t) ?? []).includes("updated_at"),
		);
		expect(
			offenders,
			"These tables are append-only and carry updated_at. Nothing can ever " +
				"update them, so the column would hold its creation time forever " +
				"while implying otherwise.",
		).toEqual([]);
	});

	it("gives no append-only table a deleted_at column", () => {
		// A soft delete IS an UPDATE, so it would be refused at runtime anyway —
		// the column would advertise a capability the table does not have.
		// DATA-CONTRACTS-V2:399 is satisfied here by there being no delete path at
		// all, which is stronger than a flag a reader has to interpret.
		const tables = declaredTables();
		const offenders = APPEND_ONLY_TABLES.filter((t) =>
			(tables.get(t) ?? []).includes("deleted_at"),
		);
		expect(offenders, "append-only tables cannot be soft-deleted").toEqual([]);
	});
});

/* ── database-side ──────────────────────────────────────────────────────── */

describe.skipIf(!URL)("the database refuses mutations on them", () => {
	const sql = neon(URL ?? "");

	/** Tables carrying a row-level trigger that calls refuse_mutation(). */
	async function guarded(): Promise<string[]> {
		const rows = await sql.query(`
			select distinct cl.relname as table_name
			from pg_trigger tg
			join pg_class cl on cl.oid = tg.tgrelid
			join pg_namespace n on n.oid = cl.relnamespace
			join pg_proc p on p.oid = tg.tgfoid
			where not tg.tgisinternal
				and n.nspname = 'public'
				and p.proname = 'refuse_mutation'
			order by 1
		`);
		return rows.map((r) => String(r.table_name));
	}

	it("keeps refuse_mutation itself installed", async () => {
		// Every trigger below points at this function. Dropped, the triggers would
		// still be listed and none of them would do anything.
		const rows = await sql.query(
			`select 1 from pg_proc where proname = 'refuse_mutation'`,
		);
		expect(rows.length).toBeGreaterThan(0);
	});

	it("guards every table in the append-only set", async () => {
		const have = await guarded();
		const missing = APPEND_ONLY_TABLES.filter((t) => !have.includes(t));
		expect(
			missing,
			"These tables are declared append-only and have NO refuse_mutation " +
				"trigger, so an UPDATE would silently rewrite history. Add them in a " +
				"new migration; never edit an applied one.",
		).toEqual([]);
	});

	it("guards nothing outside the append-only set", async () => {
		// The other direction. A trigger on a table that is supposed to be
		// mutable turns an ordinary write into a runtime error nobody expects.
		const have = await guarded();
		const unexpected = have.filter(
			(t) => !(APPEND_ONLY_TABLES as readonly string[]).includes(t),
		);
		expect(
			unexpected,
			"refuse_mutation is attached to a table not declared append-only",
		).toEqual([]);
	});

	it("fires on both UPDATE and DELETE, not just one", async () => {
		// A BEFORE UPDATE trigger alone leaves DELETE open, which destroys history
		// outright rather than rewriting it. tgtype bit 2 is UPDATE, bit 3 is
		// DELETE; both must be set on every guard.
		const rows = await sql.query(
			`
			select cl.relname as table_name,
			       (tg.tgtype & 16) <> 0 as on_update,
			       (tg.tgtype & 8)  <> 0 as on_delete
			from pg_trigger tg
			join pg_class cl on cl.oid = tg.tgrelid
			join pg_namespace n on n.oid = cl.relnamespace
			join pg_proc p on p.oid = tg.tgfoid
			where not tg.tgisinternal
				and n.nspname = 'public'
				and p.proname = 'refuse_mutation'
			order by 1
		`,
		);
		const partial = rows
			.filter((r) => !(r.on_update && r.on_delete))
			.map(
				(r) => `${r.table_name}: update=${r.on_update} delete=${r.on_delete}`,
			);
		expect(
			partial,
			"a guard that covers only one verb is half a guard",
		).toEqual([]);
	});

	it("actually refuses an UPDATE, rather than merely being attached", async () => {
		// THE ONLY ASSERTION HERE THAT PROVES THE MECHANISM WORKS. Every check
		// above reads catalogue metadata, which says a trigger EXISTS and not that
		// it DOES anything.
		//
		// EXERCISED INSIDE A DO BLOCK THAT ALWAYS ABORTS, because there is no
		// other way: a row inserted into an append-only table is permanent —
		// DELETE is refused too, by design. The block inserts a probe dispatch and
		// updates it; the trigger raises on the UPDATE, the exception propagates,
		// and the whole block rolls back including the INSERT. So the trigger is
		// proven on a real row and nothing survives the test.
		const mission = await sql.query(`select id from missions limit 1`);
		const missionId = mission[0]?.id;
		expect(
			missionId,
			"no mission row to hang a probe dispatch from",
		).toBeTruthy();

		let message = "";
		try {
			await sql.query(`
				do $$
				declare probe uuid;
				begin
					insert into dispatches (mission_id, agent_slug, dispatch_ref, slice)
					values ('${missionId}', '__probe__', '__probe__-append-only', '__probe__')
					returning id into probe;

					update dispatches set branch = 'mutated' where id = probe;
				end $$;
			`);
		} catch (e) {
			message = String((e as Error).message);
		}

		expect(
			/append-only/.test(message),
			`the UPDATE was not refused. Postgres said: ${message || "nothing"}`,
		).toBe(true);

		// And the abort really did take the INSERT with it.
		const left = await sql.query(
			`select count(*)::int as n from dispatches where agent_slug = '__probe__'`,
		);
		expect(Number(left[0]?.n ?? -1), "the probe row survived").toBe(0);
	});

	it("refuses a DELETE as well", async () => {
		// Same shape. A guard covering only UPDATE would let history be destroyed
		// outright rather than merely rewritten.
		const mission = await sql.query(`select id from missions limit 1`);
		const missionId = mission[0]?.id;

		let message = "";
		try {
			await sql.query(`
				do $$
				declare probe uuid;
				begin
					insert into dispatches (mission_id, agent_slug, dispatch_ref, slice)
					values ('${missionId}', '__probe_del__', '__probe__-append-only-del', '__probe__')
					returning id into probe;

					delete from dispatches where id = probe;
				end $$;
			`);
		} catch (e) {
			message = String((e as Error).message);
		}

		expect(
			/append-only/.test(message),
			`the DELETE was not refused. Postgres said: ${message || "nothing"}`,
		).toBe(true);

		const left = await sql.query(
			`select count(*)::int as n from dispatches where agent_slug = '__probe_del__'`,
		);
		expect(Number(left[0]?.n ?? -1), "the probe row survived").toBe(0);
	});
});
