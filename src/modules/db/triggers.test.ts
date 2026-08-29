import { neon } from "@neondatabase/serverless";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as schema from "#/modules/db/schema";

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
 *
 * BOTH SETS ARE READ FROM THE DATABASE, which leaves one hole the assertions
 * below cannot see: a table that was never migrated is absent from the live
 * side AND from the trigger side, so it passes by not existing. Generate 0009
 * and forget to push it and every assertion here stays green while the table
 * does not exist. `declaredTablesWithUpdatedAt` closes that by reading the
 * schema module — the thing drizzle-kit generates from — and requiring the
 * database to actually carry every table the code declares.
 */

// Self-sufficient locally; in CI the variable comes from the environment.
try {
	process.loadEnvFile(".env");
} catch {
	// No .env file. Fall through to whatever is already exported.
}

const URL = process.env.DATABASE_URL_DIRECT;

/**
 * IN CI, NO DATABASE IS A FAILURE, NOT A SKIP.
 *
 * Without this the describe below skips all four assertions and vitest exits
 * green, so on a runner with no database this file is decoration and nothing
 * ever says so. That is the same shape as the gap the file itself guards: the
 * mechanism exists, and whether it FIRES was an environment fact rather than a
 * guarantee.
 *
 * Precedent is already in the repo — playwright.config.ts sets
 * `forbidOnly: !!process.env.CI`, because a committed `.only` silently shrinks
 * a suite to one test and still reports green. Same failure, same fix.
 */
if (process.env.CI && !URL) {
	throw new Error(
		"DATABASE_URL_DIRECT is required in CI: the updated_at trigger guard " +
			"cannot run without a database, and a skipped guard protects nothing.",
	);
}

/**
 * Skipped rather than failed LOCALLY, so anyone working without credentials is
 * not blocked. The skip is loud — vitest reports it — and CI refuses it above.
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

	/**
	 * The same question asked of the SCHEMA rather than the database: which
	 * tables does the code declare with an updated_at column. Derived, never a
	 * hardcoded list — a hardcoded one would need editing for every new table,
	 * which is the exact maintenance burden that let 0003's array go stale.
	 */
	function declaredTablesWithUpdatedAt(): string[] {
		const names: string[] = [];
		// A loop rather than filter().map(): the module's exports are a union of
		// tables, enums and relations, and a `v is PgTable` predicate is not
		// assignable to that union. `is` narrows in place without one.
		for (const value of Object.values(schema)) {
			if (!is(value, PgTable)) continue;
			const config = getTableConfig(value);
			if (config.columns.some((col) => col.name === "updated_at")) {
				names.push(config.name);
			}
		}
		return names.sort();
	}

	it("finds tables to check, so a green result is not an empty set", async () => {
		// Without this, dropping every table would pass the assertion below.
		const tables = await tablesWithUpdatedAt();
		expect(tables.length).toBeGreaterThan(0);
	});

	it("carries every table the schema declares, so an unapplied migration fails", async () => {
		// Without this, generating a migration and never pushing it leaves the
		// whole file green: the new table is missing from both sets and is
		// therefore never compared. The trigger assertion below then guards a
		// table that does not exist.
		const [declared, live] = await Promise.all([
			Promise.resolve(declaredTablesWithUpdatedAt()),
			tablesWithUpdatedAt(),
		]);

		const unapplied = declared.filter((t) => !live.includes(t));

		expect(
			unapplied,
			"These tables are declared in schema.ts with an updated_at column and do " +
				"NOT exist in the database, so their migration was generated but never " +
				"pushed. Every other assertion in this file passes for them by omission.",
		).toEqual([]);
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
