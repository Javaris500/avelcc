import { neon } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";

/**
 * EVERY TABLE WITH updated_at HAS THE TRIGGER THAT MAINTAINS IT.
 *
 * 0003 installs set_updated_at() and attaches it by iterating an explicit
 * ARRAY of the table names that existed at the time. It reads like a blanket
 * rule and is not one, so every table added afterwards silently has no
 * trigger — and the symptom is invisible until the first write that does not
 * go through drizzle, because drizzle's app-level $onUpdate covers the ORM
 * path and nothing else. Step 2 reopened exactly that gap and 0005 closed it.
 *
 * A note in the module doc would not have prevented it: nobody reads 0003
 * before running `drizzle-kit generate`. This asserts the invariant instead,
 * so adding a table without a trigger fails a check rather than depending on
 * someone remembering. Same move as the token lint and the required
 * data-testid prop.
 *
 * Matched on the FUNCTION the trigger calls, not on its name, so renaming a
 * trigger cannot make a missing one look present.
 */

// Self-sufficient locally; in CI the variable comes from the environment.
try {
	process.loadEnvFile(".env");
} catch {
	// No .env file. Fall through to whatever is already exported.
}

const URL = process.env.DATABASE_URL_DIRECT;

/**
 * Skipped rather than failed when there is no database to ask. The skip is
 * LOUD — vitest reports it — because a guard that silently passes when it
 * cannot run is the thing this file exists to prevent.
 */
describe.skipIf(!URL)("updated_at triggers", () => {
	const sql = neon(URL ?? "");

	/** Base tables in the public schema that carry an updated_at column. */
	async function tablesWithUpdatedAt(): Promise<string[]> {
		const rows = await sql.query(`
			select c.table_name
			from information_schema.columns c
			join information_schema.tables t
				on t.table_schema = c.table_schema and t.table_name = c.table_name
			where c.table_schema = 'public'
				and c.column_name = 'updated_at'
				and t.table_type = 'BASE TABLE'
			order by 1
		`);
		return rows.map((r) => String(r.table_name));
	}

	/** Tables carrying a row-level trigger that calls set_updated_at(). */
	async function tablesWithTrigger(): Promise<string[]> {
		const rows = await sql.query(`
			select distinct cl.relname as table_name
			from pg_trigger tg
			join pg_class cl on cl.oid = tg.tgrelid
			join pg_namespace n on n.oid = cl.relnamespace
			join pg_proc p on p.oid = tg.tgfoid
			where not tg.tgisinternal
				and n.nspname = 'public'
				and p.proname = 'set_updated_at'
			order by 1
		`);
		return rows.map((r) => String(r.table_name));
	}

	it("finds tables to check, so a green result is not an empty set", async () => {
		// Without this, dropping every table would pass the assertion below.
		const tables = await tablesWithUpdatedAt();
		expect(tables.length).toBeGreaterThan(0);
	});

	it("gives every table with updated_at a set_updated_at trigger", async () => {
		const [tables, triggered] = await Promise.all([
			tablesWithUpdatedAt(),
			tablesWithTrigger(),
		]);

		const missing = tables.filter((t) => !triggered.includes(t));

		expect(
			missing,
			`These tables have updated_at and NO set_updated_at trigger, so the column ` +
				`holds its creation time forever for any write that does not go through ` +
				`drizzle. Add them to a new migration; never edit an applied one.`,
		).toEqual([]);
	});

	it("has no set_updated_at trigger on a table without the column", async () => {
		// The other direction. A trigger assigning NEW.updated_at on a table with
		// no such column raises at write time, not at migration time.
		const [tables, triggered] = await Promise.all([
			tablesWithUpdatedAt(),
			tablesWithTrigger(),
		]);

		const orphaned = triggered.filter((t) => !tables.includes(t));

		expect(
			orphaned,
			"set_updated_at is attached to a table with no updated_at",
		).toEqual([]);
	});

	it("keeps set_updated_at itself installed", async () => {
		// Every trigger above points at this function. If it were dropped the
		// triggers would still be listed and none of them would work.
		const rows = await sql.query(
			`select 1 from pg_proc where proname = 'set_updated_at'`,
		);
		expect(rows.length).toBeGreaterThan(0);
	});
});
