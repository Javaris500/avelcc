import { Clock } from "lucide-react";
import { type Metric, MetricRow, MetricStat } from "#/modules/chat/metric-stat";

/**
 * The strip above the conversation. UI-PLAN section 8.
 *
 * WHY IT EXISTS. "A pure conversation hides the system's state behind having to
 * ask for it. If a gate is blocking a delivery, the operator should not have to
 * think of the question first." The strip is the answer to "what should I do
 * next" printed before the question is asked. Today that is answered only by
 * STATE.md, in prose, which the operator does not read.
 *
 * Each item navigates, so the strip is also the fastest route out of the chat
 * and into the screen that owns the thing.
 *
 * IT IS NOT READING ANYTHING YET. This session is frontend only: there is no
 * `/api/chat`, no read-only tools and no query behind these three numbers. They
 * render as unknown, with the reason, rather than as zeros. See `MetricStat`.
 */

export const STATUS_METRICS: Metric[] = [
	{
		key: "missions-running",
		label: "missions running",
		value: null,
		tone: "accent",
		to: "/missions",
		unknownReason: "Nothing is querying missions from this screen yet.",
	},
	{
		key: "gates-blocking",
		label: "gates blocking",
		value: null,
		tone: "block",
		to: "/missions",
		unknownReason: "Gate state is read on mission detail, not here, yet.",
	},
	{
		key: "last-export",
		label: "since the last delivery",
		value: null,
		// Deliveries have no list route of their own. UI-PLAN section 5 puts
		// them in a client section, which is not built, so this one does not
		// pretend to lead anywhere.
		unknownReason: "No delivery history is loaded on this screen yet.",
	},
];

export function StatusStrip({
	metrics = STATUS_METRICS,
}: {
	metrics?: Metric[];
}) {
	const allUnknown = metrics.every((m) => m.value === null);

	return (
		// NO RULE UNDER THIS. It had a `border-b`, which was the obvious way to
		// mark a band and is exactly what the operator ruled out: panes separate
		// by tone and gap. The gap below is set by the home layout, and the tone
		// separates on its own, since the strip sits on `app-bg` while every
		// message below it is a card on `app-panel`.
		// `-ml-2` cancels the first metric's own inline padding, which exists to
		// give the hover target and focus ring room to live in. Without it the
		// strip's first number started 22px right of the header title above it,
		// which is close enough to alignment to read as a mistake rather than as
		// a choice. Measured in a browser, not eyeballed.
		<div
			className="-ml-2 flex flex-wrap items-center gap-x-3 gap-y-1"
			data-testid="chat-status-strip"
		>
			<MetricRow>
				{metrics.map((metric) => (
					<MetricStat key={metric.key} metric={metric} />
				))}
			</MetricRow>

			{/*
			  One line, once, rather than the same disclaimer repeated on each
			  stat. It is the strip that is not connected, not three separate
			  numbers that happen to be missing.

			  It carries a glyph and a border now. As a bare grey sentence beside
			  three em dashes it read as an error the page had printed; the pair
			  reads as a caption the page meant to print. `pending` is the right
			  tone rather than `warn`: nothing is wrong, three values have not
			  been wired yet, and colouring that amber would put a false alarm at
			  the top of the first screen an operator sees.
			*/}
			{allUnknown ? (
				<p
					className="inline-flex items-center gap-1.5 rounded-full bg-gate-pending-soft px-2 py-0.5 text-xs text-text-subtle"
					data-testid="chat-status-strip-note"
				>
					<Clock aria-hidden="true" size={12} strokeWidth={1.8} />
					Not wired yet. The agent and its read-only tools are not built.
				</p>
			) : null}
		</div>
	);
}
