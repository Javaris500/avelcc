import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as schema from "#/modules/db/schema";

/**
 * Every read of a soft-deletable table must exclude deleted rows.
 *
 * WRITTEN BECAUSE VIGILANCE FAILED THREE TIMES IN ONE REVIEW, all in the same
 * author's code: a soft-deleted playbook could be selected in two places — once
 * deciding which gates block a delivery, once deciding which playbook renders
 * into a client package — and revoked skills and deleted agent templates were
 * being written into packages.
 *
 * The diagnosis that produced this file is avel-71's, and it is better than
 * "someone forgot": *nothing makes you name the filter, so forgetting it is
 * silent and the query still returns rows.* Their own services filter
 * correctly, and they were explicit that this was not skill — they copied
 * `listMissions`, which happened to be right. The next person copying something
 * that is wrong inherits that instead. So the fix is a mechanism, not care.
 *
 * STATIC, and deliberately so. A runtime version would need every read path
 * enumerated by hand, which is the same list this bug lives in the gaps of.
 * Scanning the source finds a query nobody remembered to enumerate.
 */

/** The tables carrying `deleted_at`, derived from the schema module. */
function softDeletable(): Set<string> {
	const names = new Set<string>();
	for (const value of Object.values(schema)) {
		try {
			const cfg = getTableConfig(value as never);
			if (cfg.columns.some((c) => c.name === "deleted_at")) names.add(cfg.name);
		} catch {
			// Not a table: enums, relations, helpers.
		}
	}
	return names;
}

/** Drizzle identifiers, keyed by their SQL table name. */
function drizzleNames(): Map<string, string> {
	const out = new Map<string, string>();
	for (const [ident, value] of Object.entries(schema)) {
		try {
			out.set(getTableConfig(value as never).name, ident);
		} catch {
			/* not a table */
		}
	}
	return out;
}

function sourceFiles(): string[] {
	const roots = ["src/modules", "src/routes"].map((r) => path.resolve(r));
	const out: string[] = [];
	const walk = (dir: string) => {
		for (const e of readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, e.name);
			if (e.isDirectory()) walk(full);
			else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts"))
				out.push(full);
		}
	};
	for (const r of roots) walk(r);
	return out;
}

/**
 * A query chain, roughly. Splitting on `;` is crude and it is enough: a drizzle
 * chain is one statement, so a `.from(x)` and its `.where(...)` land in the
 * same chunk. Over-splitting would produce false positives, which is the safe
 * direction for a check like this.
 */
function selectChains(src: string): string[] {
	/**
	 * COMMENTS ARE STRIPPED FIRST, and the first version did not do this. A
	 * semicolon inside a prose comment split a chain in half, so a `.from()`
	 * and its `.where()` landed in different chunks and a correctly-filtered
	 * query was reported as an offender. Found immediately, by this check
	 * flagging a line I had just fixed — a false positive rather than a missed
	 * one, which is the safe direction for a scanner but still wrong.
	 */
	/**
	 * THE OPT-OUT MARKER SURVIVES STRIPPING, and it did not until the catalog
	 * needed it. The opt-out below is documented as "a sentence someone wrote",
	 * which means a comment — and comments were being removed before the opt-out
	 * was looked for, so the only way to claim it was to put the token in code.
	 * A check whose escape hatch cannot be written the way it is documented is a
	 * check people route around instead of using.
	 *
	 * Comment BODIES still go, semicolons and all, which is what the stripping is
	 * for. Only the token is kept.
	 */
	const keepMarker = (block: string) =>
		block.includes("includes-deleted") ? " includes-deleted " : "";
	const stripped = src
		.replace(/\/\*[\s\S]*?\*\//g, keepMarker)
		.replace(/\/\/.*$/gm, keepMarker);
	return stripped
		.split(";")
		.filter((c) => c.includes(".select(") || c.includes(".select()"));
}

describe("soft-deleted rows never reach a read", () => {
	const soft = softDeletable();
	const ident = drizzleNames();
	const files = sourceFiles();

	it("finds the tables and the files it is checking", () => {
		// Non-empty guards. An empty set on either side makes the real assertion
		// pass on nothing, which is how a scanner quietly stops working — the
		// exact failure this suite caught in the method-guard check earlier.
		expect(soft.size).toBeGreaterThan(5);
		expect(files.length).toBeGreaterThan(15);
		expect(soft.has("playbooks")).toBe(true);
		expect(soft.has("skills")).toBe(true);
	});

	/**
	 * An opt-out exists and must be written down at the query. A read that
	 * deliberately includes deleted rows is legitimate — an audit view, a
	 * restore path — but it should be a sentence someone wrote, not an
	 * omission indistinguishable from a mistake.
	 */
	it("filters deletedAt on every select touching a soft-deletable table", () => {
		const offenders: string[] = [];

		for (const file of files) {
			const src = readFileSync(file, "utf8");
			for (const chain of selectChains(src)) {
				if (chain.includes("includes-deleted")) continue;

				for (const table of soft) {
					const id = ident.get(table);
					if (!id) continue;
					const referenced =
						chain.includes(`.from(${id})`) ||
						chain.includes(`.innerJoin(\n\t\t\t${id},`) ||
						chain.includes(`.innerJoin(${id},`) ||
						chain.includes(`.leftJoin(${id},`);
					if (!referenced) continue;

					if (!chain.includes(`${id}.deletedAt`)) {
						offenders.push(
							`${path.relative(process.cwd(), file)} — select touching ${table} with no ${id}.deletedAt filter`,
						);
					}
				}
			}
		}

		expect(
			[...new Set(offenders)].sort(),
			"reads that would return soft-deleted rows",
		).toEqual([]);
	});
});
