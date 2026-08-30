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
		<div
			className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--elevation-border-rest)] px-2 pb-3"
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
			*/}
			{allUnknown ? (
				<p
					className="text-xs text-text-subtle"
					data-testid="chat-status-strip-note"
				>
					These read nothing yet. The agent and its read-only tools are not
					built.
				</p>
			) : null}
		</div>
	);
}
