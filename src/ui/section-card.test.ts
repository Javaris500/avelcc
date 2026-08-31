import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SectionCard } from "#/ui/section-card";

/**
 * SectionCard's three states, and the type that makes the third one honest.
 *
 * NO JSX AND NO DOM, deliberately: `vitest.config.ts` includes `*.test.ts`
 * only, and the environment is node. `createElement` types props exactly as
 * JSX does, and `renderToStaticMarkup` answers everything below — which state
 * a section opens in, and what it says when it has nothing. Effects do not run
 * in SSR, so the deep-link behaviour is NOT covered here; that needs a browser
 * and belongs in an e2e.
 */

const base = { id: "cost", title: "Cost", testId: "section-cost" } as const;

describe("SectionCard build states", () => {
	it("says what is missing rather than that there is nothing", () => {
		const html = renderToStaticMarkup(
			createElement(SectionCard, {
				...base,
				state: "not-built",
				notBuiltReason: "No cost query exists yet.",
			}),
		);

		expect(html).toContain('data-build-state="not-built"');
		expect(html).toContain("Not built. No cost query exists yet.");
	});

	it("distinguishes empty from not-built in the markup, not just in prose", () => {
		const empty = renderToStaticMarkup(
			createElement(SectionCard, { ...base, state: "empty" }),
		);

		/**
		 * THE WHOLE POINT OF THE THIRD STATE. An empty section must not render as
		 * a not-built one: "we asked and there is nothing" and "nothing ever
		 * asked" are different facts, and only one is the operator's problem.
		 * Asserted on the attribute AND on the absence of the not-built copy,
		 * because a section that merely omitted the phrase while carrying the
		 * wrong state attribute would still be lying to anything reading the DOM.
		 */
		expect(empty).toContain('data-build-state="empty"');
		expect(empty).not.toContain("Not built.");
	});

	it("opens where there is something to say and closes where there is not", () => {
		const open = (state: "empty" | "populated") =>
			renderToStaticMarkup(
				createElement(SectionCard, { ...base, state }, "body"),
			).includes("<details");

		// `open` is a boolean attribute: present when true, absent when false.
		expect(
			renderToStaticMarkup(
				createElement(SectionCard, { ...base, state: "populated" }, "body"),
			),
		).toContain("open=");
		expect(
			renderToStaticMarkup(
				createElement(SectionCard, { ...base, state: "empty" }),
			),
		).not.toContain("open=");

		// Both still render. A closed section is not an absent one.
		expect(open("empty")).toBe(true);
		expect(open("populated")).toBe(true);
	});
});

describe("SectionCard count", () => {
	it("prints a zero it was given and no count it was not", () => {
		/**
		 * ZERO IS A REAL COUNT. `undefined` means nobody counted, and rendering 0
		 * for that is the screen asserting an emptiness it never checked — the
		 * same failure the not-built state exists to prevent, one level down.
		 */
		const counted = renderToStaticMarkup(
			createElement(SectionCard, { ...base, state: "empty", count: 0 }),
		);
		const uncounted = renderToStaticMarkup(
			createElement(SectionCard, { ...base, state: "empty" }),
		);

		expect(counted).toContain('data-testid="section-cost-count"');
		expect(counted).toContain(">0<");
		expect(uncounted).not.toContain("section-cost-count");
	});
});

/**
 * THE UNION, PROVED RATHER THAN DESCRIBED.
 *
 * avel-c2 established these two shapes against the stand-in this replaced,
 * with a throwaway probe they compiled and deleted. Made permanent here,
 * because a throwaway proves the type was right ONCE.
 *
 * These lines are checked by tsc, not by vitest: an unsatisfied
 * `@ts-expect-error` is itself an error, so if either shape ever becomes legal
 * the typecheck fails and names the line. That is the property that makes this
 * a mechanism instead of a comment claiming the type is safe.
 */
describe("SectionCard props", () => {
	it("rejects a not-built section with no reason, and a reason on a built one", () => {
		// A section cannot say it is unbuilt without saying what is missing.
		// @ts-expect-error notBuiltReason is required when state is "not-built"
		createElement(SectionCard, { ...base, state: "not-built" });

		/**
		 * And cannot keep a reason left over from when it was unbuilt — the
		 * direction that actually rots, once a section gets built.
		 *
		 * THE PROPS ARE A CONST BECAUSE THE DIRECTIVE ONLY COVERS THE NEXT LINE.
		 * Written inline, the formatter wraps the object across four lines and
		 * the overload error lands on `notBuiltReason:` rather than on the call
		 * the directive precedes — so the directive suppresses nothing, reports
		 * as unused, AND the real error goes unsuppressed. tsc named both, which
		 * is the only reason this was not a probe quietly testing nothing.
		 */
		const staleReason = {
			...base,
			state: "empty",
			notBuiltReason: "stale",
		} as const;
		// @ts-expect-error notBuiltReason is not allowed once state is built
		createElement(SectionCard, staleReason);

		// The runtime assertion is that neither of the above threw while being
		// constructed; the real check ran at compile time.
		expect(true).toBe(true);
	});
});
