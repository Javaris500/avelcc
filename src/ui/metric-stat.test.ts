import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { type Metric, MetricStats } from "#/ui/metric-stat";

/** SSR-rendered — see the note in `section-card.test.ts`. */
const render = (items: Metric[]) =>
	renderToStaticMarkup(
		createElement(MetricStats, { items, testId: "client-metrics" }),
	);

describe("MetricStats", () => {
	it("marks a blocked figure and leaves the others at rest", () => {
		const html = render([
			{ label: "Missions", value: "4" },
			{ label: "Blocked", value: "2", tone: "block" },
		]);

		/**
		 * ASSERTED ON `data-tone`, NOT ON THE CLASS. The token behind the tone has
		 * moved twice in this codebase and the class name is the implementation;
		 * the attribute is the claim. A test pinned to `text-gate-block` goes red
		 * on a re-tune that changed nothing about which figure is blocked.
		 */
		expect(html).toContain('data-tone="block"');
		expect(html).toContain('data-tone="rest"');
		expect(html.match(/data-tone="rest"/g)).toHaveLength(1);
	});

	it("renders the value verbatim, so a formatted string survives", () => {
		/**
		 * THE POINT OF `value: string`. Money crosses the wire as a decimal string
		 * because it does not round-trip as a float, and anything that reformatted
		 * it here would parse it back through one. A value may also be a WORD —
		 * "Not logged" is a different fact from an em dash, which would read as
		 * "coming soon" for a figure nobody can ever supply.
		 */
		const html = render([
			{ label: "Spend", value: "$1234.50" },
			{ label: "Cost", value: "Not logged" },
		]);

		expect(html).toContain(">$1234.50</dd>");
		expect(html).toContain(">Not logged</dd>");
	});

	it("renders a zero as a zero", () => {
		// Zero missions is a fact. Nothing here may treat it as absent.
		expect(render([{ label: "Missions", value: "0" }])).toContain(">0</dd>");
	});

	it("derives a testid per figure from the row's", () => {
		const html = render([{ label: "Blocked", value: "1", tone: "block" }]);
		expect(html).toContain('data-testid="client-metrics-blocked"');
	});
});
