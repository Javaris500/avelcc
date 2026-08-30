import { neon } from "@neondatabase/serverless";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as schema from "#/modules/db/schema";

/**
 * THE SCHEMA MODULE AND THE DATABASE DESCRIBE THE SAME COLUMNS.
 *
 * Every other check in this repo lives on ONE side of that line.
 * `renderMapping.test.ts` reads the Drizzle schema through getTableConfig.
 * `triggers.test.ts` reads the database but compares TABLES, not columns. So a
 * column that exists in code and not in Neon — or the reverse — is invisible to
 * all of them, and stays invisible until a query fails at runtime, long after
 * the cause.
 *
 * The case that prompted this: a migration recorded as applied that changed
 * nothing. The journal says the change shipped, the schema module says the
 * column exists, every code-side check agrees with the schema module, and the
 * database never got it. Nothing in the repo could see that.
 *
 * BOTH DIRECTIONS, and the second is the one nobody had considered:
 *
 *   schema has it, database does not   an unapplied or empty migration
 *   database has it, schema does not   a hand-applied fix, a rolled-back
 *                                      migration, or a manual psql session
 *
 * The second is arguably worse. Everything on the code side stays green
 * forever, because nothing on the code side is wrong — the extra column simply
 * is not mentioned anywhere, and an ALTER that drops it later will surprise
 * whoever depended on it.
 *
 * TYPES, NOT JUST NAMES. A column that exists with the wrong type passes a
 * names-only check and breaks at render time. That is the same failure
 * renderMapping was built to catch one layer up.
 */

// Self-sufficient locally; in CI the variable comes from the environment.
try {
	process.loadEnvFile(".env");
} catch {
	// No .env file. Fall through to whatever is already exported.
}

const URL = process.env.DATABASE_URL_DIRECT;

/**
 * IN CI, NO DATABASE IS A FAILURE, NOT A SKIP. Same reasoning as
 * triggers.test.ts: a guard that skips itself protects nothing, and this one
 * exists precisely to catch the case where the database and the code disagree.
 */
if (process.env.CI && !URL) {
	throw new Error(
		"DATABASE_URL_DIRECT is required in CI: the schema/database column guard " +
			"cannot run without a database, and a skipped guard protects nothing.",
	);
}

/* ── type vocabularies ──────────────────────────────────────────────────── */

/**
 * Postgres and Drizzle name the same type differently, and THIS FUNCTION IS
 * WHERE THIS CHECK WOULD QUIETLY GO WRONG. Too loose and a real mismatch
 * passes; too strict and it fails on a spelling difference.
 *
 * Both sides are normalised onto `udt_name`, which is the only Postgres column
 * that names an enum and an array unambiguously — `data_type` collapses every
 * enum to 'USER-DEFINED' and every array to 'ARRAY', which would make a
 * mission_cut column indistinguishable from an export_status one.
 *
 * Measured against the live database rather than assumed, for all 22 distinct
 * type pairs this schema produces:
 *
 *   drizzle getSQLType()        udt_name
 *   text                        text
 *   text[]                      _text
 *   uuid                        uuid
 *   timestamp with time zone    timestamptz
 *   integer                     int4
 *   boolean                     bool
 *   jsonb                       jsonb
 *   numeric(12, 2)              numeric  + precision 12, scale 2
 *   <enum name>                 <enum name>   (identical, so it passes through)
 *
 * DELIBERATELY OVER-STRICT ON THE UNKNOWN. Anything not in the table below
 * passes through unchanged, which makes an unrecognised type FAIL rather than
 * silently match. A noisy false positive is a conversation; a false negative is
 * the bug this file exists to prevent.
 */
const TO_UDT: Record<string, string> = {
	"timestamp with time zone": "timestamptz",
	"timestamp without time zone": "timestamp",
	integer: "int4",
	bigint: "int8",
	smallint: "int2",
	boolean: "bool",
	"double precision": "float8",
	real: "float4",
	"character varying": "varchar",
	character: "bpchar",
};

/** Drizzle's SQL type string, in Postgres's udt_name vocabulary. */
function normalizeDrizzleType(sqlType: string): string {
	const lower = sqlType.toLowerCase().trim();

	// Arrays: Postgres prefixes the element type with an underscore.
	if (lower.endsWith("[]")) {
		return `_${normalizeDrizzleType(lower.slice(0, -2))}`;
	}

	// numeric(12, 2) keeps its precision, with the space dropped so both sides
	// spell it the same way. Precision is part of the type: widening a money
	// column is a real change and should not pass as "still numeric".
	const parametrized = lower.match(/^([a-z ]+)\((\d+)\s*,\s*(\d+)\)$/);
	if (parametrized) {
		const base = TO_UDT[parametrized[1] as string] ?? parametrized[1];
		return `${base}(${parametrized[2]},${parametrized[3]})`;
	}
	const sized = lower.match(/^([a-z ]+)\((\d+)\)$/);
	if (sized) {
		const base = TO_UDT[sized[1] as string] ?? sized[1];
		return `${base}(${sized[2]})`;
	}

	return TO_UDT[lower] ?? lower;
}

interface PgColumn {
	table_name: string;
	column_name: string;
	udt_name: string;
	is_nullable: string;
	numeric_precision: number | null;
	numeric_scale: number | null;
	character_maximum_length: number | null;
}

/** The database's type for one column, in the same vocabulary. */
function normalizePgType(row: PgColumn): string {
	const udt = row.udt_name.toLowerCase();
	if (udt === "numeric" && row.numeric_precision !== null) {
		return `numeric(${row.numeric_precision},${row.numeric_scale ?? 0})`;
	}
	if (
		(udt === "varchar" || udt === "bpchar") &&
		row.character_maximum_length !== null
	) {
		return `${udt}(${row.character_maximum_length})`;
	}
	return udt;
}

/* ── the comparison ─────────────────────────────────────────────────────── */

interface Declared {
	type: string;
	notNull: boolean;
}

/**
 * Derived from the schema module, never a hardcoded table list — the same rule
 * the trigger assertion follows, and for the same reason: a list needs editing
 * for every new table, which is exactly how 0003's array went stale.
 */
function declaredColumns(): Map<string, Declared> {
	const out = new Map<string, Declared>();
	for (const value of Object.values(schema)) {
		if (!is(value, PgTable)) continue;
		const config = getTableConfig(value);
		for (const column of config.columns) {
			out.set(`${config.name}.${column.name}`, {
				type: normalizeDrizzleType(column.getSQLType()),
				notNull: column.notNull,
			});
		}
	}
	return out;
}

describe.skipIf(!URL)("schema and database agree, column by column", () => {
	const sql = neon(URL ?? "");

	async function liveColumns(tables: string[]): Promise<Map<string, PgColumn>> {
		const rows = (await sql.query(
			`select table_name, column_name, udt_name, is_nullable,
			        numeric_precision, numeric_scale, character_maximum_length
			 from information_schema.columns
			 where table_schema = 'public' and table_name = any($1)
			 order by table_name, column_name`,
			[tables],
		)) as unknown as PgColumn[];
		return new Map(
			rows.map((r) => [`${r.table_name}.${r.column_name}`, r] as const),
		);
	}

	/** Only tables the schema declares. A stray TABLE is the trigger test's job. */
	function declaredTables(): string[] {
		const names: string[] = [];
		for (const value of Object.values(schema)) {
			if (!is(value, PgTable)) continue;
			names.push(getTableConfig(value).name);
		}
		return names.sort();
	}

	it("finds columns to compare, so a green result is not an empty set", async () => {
		// Without this, a schema module that exported nothing would satisfy every
		// assertion below. Same guard the trigger assertion carries.
		const declared = declaredColumns();
		const live = await liveColumns(declaredTables());
		expect(declared.size).toBeGreaterThan(0);
		expect(live.size).toBeGreaterThan(0);
	});

	it("has every column the schema declares", async () => {
		// THE APPLIED-BUT-EMPTY MIGRATION CASE. The journal says the change
		// shipped, the code says the column exists, and the database never got it.
		const declared = declaredColumns();
		const live = await liveColumns(declaredTables());

		const missing = [...declared.keys()].filter((k) => !live.has(k)).sort();

		expect(
			missing,
			"These columns are declared in schema.ts and DO NOT EXIST in the " +
				"database. Either their migration was never applied, or it was " +
				"recorded as applied while changing nothing. Every code-side check " +
				"passes for them, because nothing on the code side is wrong.",
		).toEqual([]);
	});

	it("has no column the schema does not declare", async () => {
		// THE OTHER DIRECTION, and the one that stays green forever on the code
		// side: a hand-applied fix, a rolled-back migration, or a manual psql
		// session leaves a column nothing mentions.
		const declared = declaredColumns();
		const live = await liveColumns(declaredTables());

		const undeclared = [...live.keys()].filter((k) => !declared.has(k)).sort();

		expect(
			undeclared,
			"These columns exist in the database and are declared NOWHERE in " +
				"schema.ts. Nothing on the code side is wrong, so nothing else in " +
				"this repo can see them. Add them to the schema, or drop them in a " +
				"migration — never by hand.",
		).toEqual([]);
	});

	it("agrees on the type of every shared column", async () => {
		// A column that exists with the wrong type passes a names-only check and
		// breaks at render time. text vs text[] is the live example.
		const declared = declaredColumns();
		const live = await liveColumns(declaredTables());

		const mismatched: string[] = [];
		for (const [key, want] of declared) {
			const got = live.get(key);
			if (!got) continue; // reported by the missing-columns test
			const actual = normalizePgType(got);
			if (actual !== want.type) {
				mismatched.push(`${key}: schema ${want.type}, database ${actual}`);
			}
		}

		expect(
			mismatched.sort(),
			"These columns exist on both sides with DIFFERENT TYPES. A names-only " +
				"check would pass every one of them.",
		).toEqual([]);
	});

	it("agrees on the nullability of every shared column", async () => {
		// A NOT NULL that exists in code and not in the database lets a write
		// through that the schema says is impossible — and the reverse blocks a
		// write the code believes is fine. This is the missions.status defect
		// class, seen from the database side.
		const declared = declaredColumns();
		const live = await liveColumns(declaredTables());

		const mismatched: string[] = [];
		for (const [key, want] of declared) {
			const got = live.get(key);
			if (!got) continue;
			const actualNotNull = got.is_nullable === "NO";
			if (actualNotNull !== want.notNull) {
				mismatched.push(
					`${key}: schema ${want.notNull ? "NOT NULL" : "nullable"}, ` +
						`database ${actualNotNull ? "NOT NULL" : "nullable"}`,
				);
			}
		}

		expect(mismatched.sort(), "Nullability disagrees.").toEqual([]);
	});
});
