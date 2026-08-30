import { describe, expect, it } from "vitest";

import {
	frontMatter,
	list,
	parseHeader,
	str,
	tableRows,
	tokens,
	usd,
	wallToSeconds,
} from "#/modules/db/ingest/parseTeam5";

/**
 * THE NUMBER PARSERS, PINNED.
 *
 * `usd` truncated at a thousands separator: "$1,639.00" parsed as "1", three
 * orders of magnitude wrong and entirely plausible-looking. It was found by
 * reading, not by a test, and the tell was that `tokens` in the same file
 * already stripped commas while `usd` did not.
 *
 * These load into cost_entries, which is append-only and guarded by
 * refuse_mutation(), so a wrong figure has NO UPDATE PATH — it can only be
 * corrected by a later row saying the earlier one was wrong. That makes the
 * cost of a silent parse error permanent, which is why both parsers are now
 * asserted against the separator cases rather than only the ones the current
 * corpus happens to contain.
 */
describe("money and token parsing survive thousands separators", () => {
	it("parses the values the corpus actually holds", () => {
		expect(usd("$60.27")).toBe("60.27");
		expect(usd("$161.66")).toBe("161.66");
		expect(usd("**unlogged**")).toBeUndefined();
		expect(usd(undefined)).toBeUndefined();
	});

	it("does NOT truncate at a comma", () => {
		// The regression. Before the fix these returned "1" and "12".
		expect(usd("$1,639.00")).toBe("1639.00");
		expect(usd("$12,345.67")).toBe("12345.67");
		expect(usd("$1,000,000")).toBe("1000000");
	});

	it("treats tokens the same way, which is where the inconsistency showed", () => {
		expect(tokens("83,670,625")).toBe(83670625);
		expect(tokens("245,611,316")).toBe(245611316);
		expect(tokens("**unlogged**")).toBeUndefined();
		expect(tokens("—")).toBeUndefined();
	});

	it("refuses a non-number rather than coercing it to zero", () => {
		// A silent 0 in a cost ledger is worse than a null: it reads as "this was
		// free" instead of "this was never logged", and mission 001's whole point
		// is the difference.
		expect(tokens("n/a")).toBeUndefined();
		expect(tokens("")).toBeUndefined();
	});

	it("parses wall clock in the forms the ledger uses, and no others", () => {
		expect(wallToSeconds("3h01m")).toBe(10860);
		expect(wallToSeconds("8h22m")).toBe(30120);
		expect(wallToSeconds("7 days")).toBe(604800);
		// Undefined rather than a guess — an unparsed duration is reported, and
		// the loader surfaces it instead of writing a wrong number.
		expect(wallToSeconds("about an hour")).toBeUndefined();
		expect(wallToSeconds("90m")).toBeUndefined();
	});
});

describe("header parsing handles the shapes .team-5 writes", () => {
	const block = `---
agent:            nemi
slice:            1
dispatch_id:      nemi-slice-1
branch:           test/nemi-slice-1        # branched from feat/transactions
scope: >
  The slice 1 browser gate, and the
  accessibility pass.
file_boundary:
  may_edit:
    - apps/web/e2e/
    - "*.test.tsx"
  may_append_only:
    - .team-5/findings/
  must_not_touch:
    - apps/api/src/
builds_against: live
severity: [warn, warn,
           note]
slice_hard_stops: []
---
body`;

	const h = parseHeader(frontMatter(block) ?? "");

	it("reads scalars and strips a trailing comment", () => {
		expect(str(h, "agent")).toBe("nemi");
		expect(str(h, "dispatch_id")).toBe("nemi-slice-1");
		// The comment goes; the value keeps its slashes.
		expect(str(h, "branch")).toBe("test/nemi-slice-1");
	});

	it("folds a `>` block onto one line", () => {
		expect(str(h, "scope")).toBe(
			"The slice 1 browser gate, and the accessibility pass.",
		);
	});

	it("reads a nested file_boundary as three lists", () => {
		const fb = h.nested.get("file_boundary");
		expect(fb?.get("may_edit")).toEqual(["apps/web/e2e/", "*.test.tsx"]);
		expect(fb?.get("may_append_only")).toEqual([".team-5/findings/"]);
		expect(fb?.get("must_not_touch")).toEqual(["apps/api/src/"]);
	});

	it("reads a bracketed list that spans lines", () => {
		// The findings files wrap severity and categories across lines.
		expect(list(h, "severity")).toEqual(["warn", "warn", "note"]);
	});

	it("reads an empty bracketed list as empty, not as one blank entry", () => {
		expect(list(h, "slice_hard_stops")).toEqual([]);
	});

	it("does not mistake a value containing a hash for a comment", () => {
		// `reviewer: axe-core/playwright 4.13.0` and branch names with `+` were
		// the cases that made a naive split on "#" wrong.
		const h2 = parseHeader(
			"reviewer: axe-core/playwright 4.13.0\nbranch: main + uncommitted work",
		);
		expect(str(h2, "reviewer")).toBe("axe-core/playwright 4.13.0");
		expect(str(h2, "branch")).toBe("main + uncommitted work");
	});
});

describe("markdown table rows", () => {
	it("drops the separator row and keeps the data", () => {
		const rows = tableRows(
			["| # | date |", "|---|---|", "| 1 | 2026-08-23 |", "not a row"].join(
				"\n",
			),
		);
		expect(rows).toEqual([
			["#", "date"],
			["1", "2026-08-23"],
		]);
	});
});
