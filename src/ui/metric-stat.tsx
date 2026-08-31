import { cn } from "#/utils/cn";

/**
 * A figure with its label — the masthead numbers.
 *
 * Replaces a plain stand-in in the client route that was marked as waiting on
 * this. Its decisions are carried over rather than re-made; the ones below are
 * load-bearing and were paid for once already.
 *
 * A `<dl>`, like `DefinitionList`, because a metric IS a label/value pair and
 * that relationship is the whole content. The container and the item are
 * separate exports for the same reason `<ul>` and `<li>` are: the row owns the
 * layout, the item owns the tone.
 */

/**
 * THE VALUE IS A STRING AND NEVER A NUMBER, which is the one thing here that
 * would break silently if it were relaxed.
 *
 * Spend crosses the wire as a decimal STRING because money does not round-trip
 * as a float. A `value: number` prop would invite a caller — or a later
 * "improvement" — to reach for toLocaleString, which parses it back to a float
 * and undoes precisely what the string type was protecting. Formatting belongs
 * to whoever knows what the figure means.
 *
 * (toLocaleString is unbackticked on purpose: backticks in this codebase mark
 * an identifier that should resolve HERE, and the comment checker reads them
 * that way. It is a platform builtin, like tsc is a program.)
 *
 * It is also what lets a value be a WORD. `spendUsd: null` renders "Not
 * logged", not an em dash: the dash is ambiguous between "nothing spent", "not
 * yet entered" and "we cannot know", and for spend it is the third. One cost
 * row exists with every measure null, deliberately recording that an early
 * slice's spend is permanently unrecoverable — a dash reading as "coming soon"
 * would promise a number nobody can ever supply.
 */
export type Metric = {
	label: string;
	value: string;
	tone?: MetricTone;
};

/**
 * `rest` | `block`, NOT `rest` | `warn`, and the deviation is deliberate.
 *
 * The shorthand this was specified under said "warn". The only figure that
 * takes a tone today is the blocked-mission count, which the stand-in painted
 * `gate-block`, and a prop named `warn` that paints the block token is exactly
 * the comment-disagrees-with-code mismatch this codebase keeps finding. Named
 * for what it paints instead.
 *
 * There is no `warn` member yet because nothing needs one. `gate-warn` exists
 * and adding a third tone is a one-line change the day a caller has a figure
 * that is worth noticing but not blocking.
 */
export type MetricTone = "rest" | "block";

const TONE: Record<MetricTone, string> = {
	rest: "text-text",
	block: "text-gate-block",
};

export function MetricStats({
	items,
	testId,
	className,
}: {
	items: Metric[];
	testId: string;
	className?: string;
}) {
	return (
		<dl className={cn("flex flex-wrap gap-6", className)} data-testid={testId}>
			{items.map((m) => (
				<MetricStat
					key={m.label}
					label={m.label}
					testId={`${testId}-${m.label.toLowerCase()}`}
					tone={m.tone}
					value={m.value}
				/>
			))}
		</dl>
	);
}

/**
 * One figure. Valid inside a `<dl>` — `MetricStats` provides one; a caller
 * placing a lone stat elsewhere has to bring its own.
 */
export function MetricStat({
	label,
	value,
	tone = "rest",
	testId,
}: {
	label: string;
	value: string;
	tone?: MetricTone;
	/** The testid lands on the VALUE, which is the thing a test asserts. */
	testId: string;
}) {
	return (
		<div className="flex flex-col gap-0.5">
			<dt className="text-micro text-text-subtle uppercase">{label}</dt>
			<dd
				className={cn("font-display text-lg font-semibold", TONE[tone])}
				data-testid={testId}
				data-tone={tone}
			>
				{value}
			</dd>
		</div>
	);
}
