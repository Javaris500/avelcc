import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DefinitionList } from "#/ui/definition-list";

/** Rendered through SSR — see the note in `section-card.test.ts`. */
const render = (items: { label: string; value: unknown }[]) =>
	renderToStaticMarkup(
		createElement(DefinitionList, {
			items: items as never,
			testId: "definitions",
		}),
	);

describe("DefinitionList empty values", () => {
	it("dashes every kind of absent value, including the empty string", () => {
		/**
		 * THE EMPTY STRING IS THE ONE THAT SLIPS THROUGH. `value ?? "—"` catches
		 * null and undefined and passes `""` on to render as nothing — the exact
		 * blank the dash exists to prevent, arriving by the one route a nullish
		 * check cannot see. Asserted per-case rather than in aggregate so a
		 * failure names which kind of absence regressed.
		 */
		for (const value of [null, undefined, "", "   "]) {
			const html = render([{ label: "Contact", value }]);
			expect(html, `absent value ${JSON.stringify(value)}`).toContain(
				">—</dd>",
			);
		}
	});

	it("renders a zero and a false, which are values rather than absences", () => {
		/**
		 * A falsiness test would dash both. `0` missions is a fact about this
		 * client; an em dash there would claim nobody counted, which is the same
		 * lie SectionCard's three states exist to prevent.
		 */
		expect(render([{ label: "Missions", value: 0 }])).toContain(">0</dd>");
		expect(render([{ label: "Missions", value: 0 }])).not.toContain("—");
	});

	it("keeps each pair together rather than laying out loose children", () => {
		// A label ending a grid row while its value starts the next is what the
		// wrapping div prevents; the dt and dd must share a parent.
		const html = render([
			{ label: "Status", value: "active" },
			{ label: "Contact", value: "ops@example.com" },
		]);
		expect(html).toContain(
			'<div class="flex flex-col gap-0.5"><dt class="text-micro text-text-subtle">Status</dt>',
		);
	});
});
