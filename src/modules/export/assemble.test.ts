import { describe, expect, it } from "vitest";

import { briefToMarkdown, toRenderAgent } from "#/modules/export/assemble";

/**
 * `mission/brief.md` is handed to a client and is covered by
 * `package_sha256`, so what this function drops is dropped from a deliverable
 * and from the hash that claims to describe it.
 */
describe("briefToMarkdown", () => {
	/**
	 * THE BUG, PINNED. The first version passed `Object.keys(v).sort()` to
	 * JSON.stringify as a replacer, to get deterministic key order. A replacer
	 * ARRAY is an allowlist applied at EVERY DEPTH — so a nested object kept
	 * only the keys that happened to appear at depth 1, and this exact input
	 * serialized as `[{}]`. Silent, total loss of nested content.
	 */
	it("keeps nested content instead of emptying it", () => {
		const md = briefToMarkdown({ items: [{ name: "x", size: 3 }] });
		expect(md).toContain("x");
		expect(md).toContain("3");
		expect(md).not.toContain("[{}]");
	});

	/**
	 * The property the replacer was there to get in the first place, which the
	 * fix must not lose: identical content in a different insertion order
	 * produces identical bytes, or the package hash moves between runs.
	 */
	it("is deterministic under key insertion order, at every depth", () => {
		const a = briefToMarkdown({ b: { y: 1, x: 2 }, a: "first" });
		const c = briefToMarkdown({ a: "first", b: { x: 2, y: 1 } });
		expect(a).toBe(c);
	});

	/** Array order carries meaning and must never be sorted. */
	it("does not reorder arrays", () => {
		const md = briefToMarkdown({ steps: ["c", "a", "b"] });
		expect(md.indexOf("c")).toBeLessThan(md.indexOf("a"));
	});

	it("renders a string value as prose rather than as JSON", () => {
		expect(briefToMarkdown({ note: "plain text" })).toContain("\n\nplain text");
	});

	it("returns nothing for an empty brief", () => {
		expect(briefToMarkdown({})).toBe("");
	});
});

const template = (over: Partial<Parameters<typeof toRenderAgent>[1]> = {}) => ({
	slug: "nemi",
	kind: "horizontal" as const,
	runtime: "model" as const,
	writablePaths: ["t/w"],
	appendOnlyPaths: ["t/a"],
	readonlyPaths: ["t/r"],
	identityMd: "# identity",
	depthMd: "# depth",
	...over,
});

const entry = (over: Partial<Parameters<typeof toRenderAgent>[0]> = {}) => ({
	wave: null,
	writablePaths: null,
	appendOnlyPaths: null,
	readonlyPaths: null,
	...over,
});

describe("toRenderAgent", () => {
	/**
	 * THE BUG, PINNED. render.ts branches on PRESENCE — a runtime:human agent
	 * "loads no model context, so it has neither file" — and identity_md is NOT
	 * NULL, so passing it unconditionally shipped an identity.md into a client
	 * package for something that is not a language model.
	 */
	it("gives model context only to a model", () => {
		for (const runtime of ["human", "code"] as const) {
			const a = toRenderAgent(entry(), template({ runtime }), {}, []);
			expect(a.identityMd).toBeUndefined();
			expect(a.depthMd).toBeUndefined();
		}
		const m = toRenderAgent(entry(), template({ runtime: "model" }), {}, []);
		expect(m.identityMd).toBe("# identity");
		expect(m.depthMd).toBe("# depth");
	});

	/**
	 * Null inherits the template's mount; `[]` is a real, different instruction
	 * meaning the mission granted none. Collapsing them would lose the
	 * difference between unconfigured and deliberately empty.
	 */
	it("distinguishes an inherited mount from an empty one", () => {
		const inherited = toRenderAgent(entry(), template(), {}, []);
		expect(inherited.writable).toEqual(["t/w"]);

		const emptied = toRenderAgent(
			entry({ writablePaths: [] }),
			template(),
			{},
			[],
		);
		expect(emptied.writable).toEqual([]);
	});

	it("lets an entry override each mount kind independently", () => {
		const a = toRenderAgent(
			entry({ appendOnlyPaths: ["e/a"] }),
			template(),
			{},
			[],
		);
		expect(a.appendOnly).toEqual(["e/a"]);
		expect(a.writable).toEqual(["t/w"]);
		expect(a.readonly).toEqual(["t/r"]);
	});

	it("carries resolved skills rather than dropping them", () => {
		const a = toRenderAgent(entry(), template(), {}, [
			{ slug: "s", body: "b" },
		]);
		expect(a.skills).toEqual([{ slug: "s", body: "b" }]);
	});

	it("renders an unassigned wave as empty, not as a guess", () => {
		expect(toRenderAgent(entry(), template(), {}, []).phase).toBe("");
	});
});
