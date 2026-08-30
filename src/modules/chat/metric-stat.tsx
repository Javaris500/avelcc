import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "#/utils/cn";

/**
 * A number with a label, and a target.
 *
 * BELONGS IN `src/ui/`, NOT HERE. UI-PLAN section 2 lists `MetricStat` among
 * the primitives the shell needs, shared by the client masthead and the chat
 * status strip. `src/ui/` is not in this session's mount, so it lives here as
 * a documented workaround rather than a silent relocation. Whoever builds the
 * client masthead should move this file to `src/ui/metric-stat.tsx` and import
 * it back, not write a second one. Two components with one job is how a design
 * system stops being one.
 *
 * A NULL VALUE IS A STATE, NOT A ZERO. This is the whole reason the component
 * takes `MetricValue` rather than `number`. Nothing in this session reads the
 * database, so every value on the home screen is genuinely unknown today. A
 * strip that renders "0 missions running" against no query is a fabricated
 * count, which is the failure CLAUDE.md names three times. Unknown renders as
 * unknown and says why.
 */

export type MetricValue = number | string | null;

export type MetricTone = "neutral" | "accent" | "warn" | "block";

export type Metric = {
	/** Stable across renders. Used for the key and the testid. */
	key: string;
	/** Plain words, lower case. "missions running", not "Active Missions". */
	label: string;
	value: MetricValue;
	tone?: MetricTone;
	/** Where clicking it goes. Omitted when there is nowhere yet. */
	to?: string;
	/** Required when `value` is null. What is missing, in one clause. */
	unknownReason?: string;
};

const TONE_CLASS: Record<MetricTone, string> = {
	neutral: "text-text",
	accent: "text-accent-text",
	warn: "text-gate-warn",
	block: "text-gate-block",
};

/** An em dash reads as "no value", where 0 reads as "measured, and none". */
const UNKNOWN = "—";

/**
 * THE UNKNOWN VALUE SITS IN A WELL, and that is the whole of the fix.
 *
 * A bare em dash in the same slot a number will occupy is honest and reads as
 * a screen that failed to load, which is the one thing an operator cannot tell
 * apart from a screen that is broken. It is the same problem a designed
 * "not built" state has: being correct is not the same as looking deliberate.
 *
 * `app-recessed` is the well surface in both themes, and it is the only step
 * that separates downward from `app-bg` in light, where everything above the
 * panel is white. So the slot reads as a place a value goes, empty on purpose,
 * rather than as text that did not arrive.
 */
const UNKNOWN_SLOT =
	"rounded-xs bg-app-recessed px-1.5 text-text-subtle tabular-nums";

export function MetricStat({
	metric,
	className,
}: {
	metric: Metric;
	className?: string;
}) {
	const known = metric.value !== null;
	const body = (
		<>
			<span
				className={cn(
					"font-display text-lg font-semibold",
					known
						? cn("tabular-nums", TONE_CLASS[metric.tone ?? "neutral"])
						: UNKNOWN_SLOT,
				)}
				data-testid={`metric-${metric.key}-value`}
			>
				{known ? metric.value : UNKNOWN}
			</span>
			<span className="text-xs text-text-muted">{metric.label}</span>
		</>
	);

	const shell =
		"flex items-baseline gap-2 rounded-sm px-2 py-1 outline-offset-2";

	// No target means no link. A stat that looks clickable and is not is the
	// dead-control rule, which section 12 records as the one already violated.
	if (!metric.to) {
		return (
			<span
				className={cn(shell, className)}
				data-state={known ? "known" : "unknown"}
				data-testid={`metric-${metric.key}`}
				title={known ? undefined : metric.unknownReason}
			>
				{body}
			</span>
		);
	}

	return (
		<Link
			className={cn(shell, "interactive", className)}
			data-state={known ? "known" : "unknown"}
			data-testid={`metric-${metric.key}`}
			title={known ? undefined : metric.unknownReason}
			to={metric.to as never}
		>
			{body}
		</Link>
	);
}

/** Wraps a row of stats. Kept here so the strip and a masthead share spacing. */
export function MetricRow({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("flex flex-wrap items-center gap-1", className)}>
			{children}
		</div>
	);
}
