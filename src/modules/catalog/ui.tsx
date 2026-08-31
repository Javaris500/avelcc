import type { LucideIcon } from "lucide-react";
import { Search, X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";

import { Pill, StatusBadge, type StatusBadgeProps } from "#/ui/badge";
import { Input } from "#/ui/input";
import { EmptyState } from "#/ui/states";
import { cn } from "#/utils/cn";

/**
 * THE SHARED VOCABULARY, HELD IN ONE FILE UNTIL IT HAS A REAL HOME.
 *
 * avel-71 owns `src/ui/` and is building `SectionCard`, `DefinitionList`,
 * `StatusChip` and `DataTable`; this session may not write there. The
 * instruction that came with the work is the load-bearing one: "DO NOT INVENT
 * PARALLEL COMPONENTS. Four sessions each building their own card is the
 * specific outcome this split exists to prevent."
 *
 * Three rules make that survivable:
 *
 *   1. ONE FILE. Nothing else in `src/modules/catalog/` styles a card or a
 *      chip. When the real primitives land this becomes re-export lines and one
 *      commit closes it. `PageHeader` proved the shape: adopting the real one
 *      touched this file and three call sites and nothing else.
 *   2. NOTHING NEW IS INVENTED. Where `src/ui/` has the thing, this wraps it.
 *      `StatusChip` is `StatusBadge` with a domain mapping; `EmptyState` is
 *      re-exported untouched.
 *   3. THE PROP SIGNATURES ARE THE REQUEST. Where they differ from what
 *      avel-71 builds, avel-71 wins and this module adapts.
 *
 * The one request that is not just a name: `SectionCard` needs a `definition`
 * slot separate from its title and count. Section 2 gives a subtitle to counts
 * and status; section 12 rule 5 gives the header the plain sentence that names
 * the jargon. Two jobs, and collapsing them loses one. `usePageHeader` already
 * carries both slots under these names.
 *
 * MOTION is CSS only, on `--duration-micro` and `--ease-avel`. No animation
 * library is installed and adding one is an open decision.
 */

/* ── re-exported untouched ───────────────────────────────────────────────── */

export { EmptyState };

/* ── SectionCard ─────────────────────────────────────────────────────────── */

export type SectionCardProps = {
	title: string;
	/** Section 12 rule 5, one level down. */
	definition?: string;
	count?: number;
	action?: ReactNode;
	children: ReactNode;
	className?: string;
	"data-testid": string;
};

export function SectionCard({
	title,
	definition,
	count,
	action,
	children,
	className,
	"data-testid": testId,
}: SectionCardProps) {
	return (
		<section
			className={cn("elev-1 rounded-md", className)}
			data-testid={testId}
		>
			{/*
			 * NO RULE UNDER THE HEADER. The card's own border stays, being a border
			 * around one thing rather than a line between two, and the plan draws
			 * exactly that distinction: dividers go, container borders stay because
			 * app-panel, app-raised and app-float are all #ffffff in light and the
			 * border is half the elevation mechanism there.
			 *
			 * What separated header from body was a 1px line. It is gap now: py-4
			 * on the header against the body's own padding.
			 */}
			<div className="flex flex-wrap items-baseline gap-x-3 gap-y-2 px-4 pt-4 pb-2">
				<h2
					className="font-display text-sm font-semibold text-text"
					data-testid={`${testId}-title`}
				>
					{title}
				</h2>
				{count === undefined ? null : (
					<Pill data-testid={`${testId}-count`}>{count}</Pill>
				)}
				{action ? <div className="ml-auto">{action}</div> : null}
				{definition ? (
					<p
						className="w-full max-w-[52ch] text-micro leading-relaxed text-text-subtle"
						data-testid={`${testId}-definition`}
					>
						{definition}
					</p>
				) : null}
			</div>
			{children}
		</section>
	);
}

/* ── DefinitionList ──────────────────────────────────────────────────────── */

export type DefinitionItem = {
	label: string;
	value: ReactNode;
	/** One quiet line under the value. The plain-sentence slot again. */
	hint?: string;
};

/**
 * `<dl>`, not a two-column grid of `<div>`s. The label and the value are a pair
 * and a screen reader should be told so.
 */
export function DefinitionList({
	items,
	className,
	"data-testid": testId,
}: {
	items: DefinitionItem[];
	className?: string;
	"data-testid": string;
}) {
	return (
		<dl
			className={cn("grid gap-x-6 gap-y-3 sm:grid-cols-[14rem_1fr]", className)}
			data-testid={testId}
		>
			{items.map((item) => (
				<div className="contents" key={item.label}>
					<dt className="text-micro text-text-subtle">{item.label}</dt>
					<dd className="min-w-0 text-sm text-text">
						{item.value}
						{item.hint ? (
							<p className="max-w-[52ch] pt-1 text-micro leading-relaxed text-text-subtle">
								{item.hint}
							</p>
						) : null}
					</dd>
				</div>
			))}
		</dl>
	);
}

/* ── StatusChip ──────────────────────────────────────────────────────────── */

export type ChipTone = NonNullable<StatusBadgeProps["tone"]>;

/**
 * `StatusBadge` WITH A DOMAIN MAPPING, not a second badge.
 *
 * Section 2's reason for wanting `StatusChip` is "badge is presentational.
 * Gate verdicts, request status and mission status need one component with one
 * colour mapping." The badge is the right rendering; what was missing is the
 * mapping. So this adds the mapping and reuses the rendering, which is also the
 * only way the glyphs stay consistent: badge.tsx pairs a distinct glyph with
 * every tone precisely so the state does not rest on hue alone.
 */
export function StatusChip({
	tone,
	children,
	className,
	"data-testid": testId,
}: {
	tone: ChipTone;
	children: ReactNode;
	className?: string;
	"data-testid": string;
}) {
	return (
		<StatusBadge className={className} data-testid={testId} tone={tone}>
			{children}
		</StatusBadge>
	);
}

/* ── ChecksPassed ────────────────────────────────────────────────────────── */

/**
 * WHAT WAS CHECKED AND FOUND CLEAN, on one quiet line.
 *
 * This replaces a row of `MetricStat` cards and the replacement is the whole
 * point, so the reasoning is here rather than in a commit message.
 *
 * The cards were carrying two different jobs. Totals — "9 live skills", "1
 * revoked" — moved to the header subtitle, because the same number in two
 * places means one of them is redundant. What was left was the risk numbers,
 * and those turned out to duplicate something too: a card reading "1 · Revoked
 * but still attached" sat directly above a banner reading "A revoked skill is
 * still attached to work · nothing re-checks the catalog when a package is
 * built". Same fact, twice, stacked, in two treatments, and the banner says it
 * better because it has room for the consequence.
 *
 * THE CARD WAS NOT USELESS THOUGH, and dropping it outright loses the thing it
 * was good at. At ZERO it was the only evidence the check had run at all, and
 * "not counted" and "counted zero" becoming the same pixel is the failure this
 * module has been arguing against at three different scales.
 *
 * So the two states split and become mutually exclusive. A check that FAILS
 * renders as a banner, with room for what to do about it. A check that PASSES
 * renders as one clause here. Neither can duplicate the other, because a check
 * is never in both states at once, and the page keeps its answer to "did
 * anything look at this?"
 */
export function ChecksPassed({
	items,
	"data-testid": testId,
}: {
	/** Only the checks that PASSED. A failing one belongs in a DataNotice. */
	items: { key: string; label: string }[];
	"data-testid": string;
}) {
	if (items.length === 0) return null;
	return (
		<p
			className={cn(
				// px-4/py-3 matches DataNotice exactly. The two are mutually
				// exclusive occupants of the same slot — a check is a banner or a
				// clause, never both — so a different inset made the block appear to
				// shift sideways depending on which state the page was in.
				"flex flex-wrap items-center gap-x-2 gap-y-1 rounded-sm px-4 py-3",
				// A surface, so the passing half of banner-or-clause reads as a
				// status strip rather than as floating text beside a loud banner.
				// A border around one thing, not a rule between two.
				"border border-[var(--elevation-border-rest)] text-micro text-text-muted",
			)}
			data-testid={testId}
		>
			<span aria-hidden="true" className="font-mono text-gate-pass">
				✓
			</span>
			<span>Checked:</span>
			{items.map((item, i) => (
				<span data-check={item.key} key={item.key}>
					{item.label}
					{i < items.length - 1 ? "," : ""}
				</span>
			))}
		</p>
	);
}

/* ── SearchField ─────────────────────────────────────────────────────────── */

/** True when focus is somewhere that should receive the keystroke itself. */
function isTypingTarget(el: EventTarget | null): boolean {
	if (!(el instanceof HTMLElement)) return false;
	if (el.isContentEditable) return true;
	return ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/**
 * A SEARCH FIELD, rather than an input with a placeholder.
 *
 * The first version was the bare `Input` primitive and a placeholder, which is
 * the minimum that works and nothing more: you could filter to zero results and
 * the only signal was an empty list. Four things were missing and each is a
 * question the operator would otherwise have to answer by looking elsewhere.
 *
 *   - A COUNT. "3 of 10" says the filter is doing something, and says it in the
 *     one place you are already looking.
 *   - A CLEAR. Selecting text and deleting it is not an affordance.
 *   - `/` TO FOCUS, guarded the way `sidebar-search.tsx` guards its `F`, so it
 *     never steals a keystroke from someone typing. The hint is rendered, so it
 *     has to work: a shortcut the product advertises and does not honour is
 *     worse than no shortcut.
 *   - ESCAPE TO CLEAR, which is what every search field anyone has used does.
 *
 * COLOUR, AND THE FIRST ANSWER WAS WRONG. The `Input` primitive paints itself
 * `bg-muted`, which resolves to `app-recessed`. That reasoning was "a search box
 * is somewhere you put something", and on paper a well is right.
 *
 * On the dark theme it reads as a black hole punched in the card. The numbers
 * say why: after the ramp was re-derived, `app-recessed` is `#16181d` at
 * `L* 8.2` while `app-panel` — the card this field sits on — is `L* 11.7`. The
 * field is DARKER than its container, and against a dark surface that does not
 * read as depth, it reads as a gap.
 *
 * So it sits at `app-raised` instead, one step ABOVE the card, which is what
 * every other control on a card does — `secondary` buttons resolve there too.
 * A search field is a control, not an excavation.
 *
 * When a query is active it takes an accent left edge, the same treatment as a
 * selected row in the list beneath it, so "a filter is on" is legible without
 * reading the field. No new tokens in either case.
 */
export function SearchField({
	value,
	onChange,
	label,
	placeholder,
	shown,
	total,
	"data-testid": testId,
}: {
	value: string;
	onChange: (value: string) => void;
	/** The accessible name. Never rendered, so it must stand alone. */
	label: string;
	placeholder: string;
	shown: number;
	total: number;
	"data-testid": string;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const active = value.trim() !== "";

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key !== "/") return;
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			if (isTypingTarget(event.target)) return;
			event.preventDefault();
			inputRef.current?.focus();
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, []);

	return (
		<div className="flex flex-col gap-1" data-testid={testId}>
			<div
				className={cn(
					"relative rounded-xs",
					// The accent edge, matching the selected row. Transparent rather
					// than absent when idle, so the field does not shift by 2px the
					// moment you type.
					"border-l-2",
					active ? "border-accent" : "border-transparent",
				)}
				data-active={active ? "true" : undefined}
			>
				<Search
					aria-hidden="true"
					className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-text-subtle"
					strokeWidth={1.8}
				/>
				<Input
					aria-label={label}
					// Overrides the primitive's `bg-muted`. See the colour note above.
					className="bg-app-raised pr-8 pl-8"
					data-testid={`${testId}-input`}
					onChange={(event) => onChange(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Escape" && active) {
							event.preventDefault();
							onChange("");
						}
					}}
					placeholder={placeholder}
					ref={inputRef}
					type="text"
					value={value}
				/>
				{active ? (
					<button
						aria-label="Clear the filter"
						className="interactive absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-xs text-text-subtle"
						data-testid={`${testId}-clear`}
						onClick={() => {
							onChange("");
							inputRef.current?.focus();
						}}
						type="button"
					>
						<X aria-hidden="true" className="size-3.5" strokeWidth={2} />
					</button>
				) : null}
			</div>
			{/*
			 * The count only appears once it means something. "10 of 10" on arrival
			 * is the screen narrating its own resting state, and the non-zero rule
			 * applies to a filter's effect as much as to a row's counts.
			 */}
			<p
				className="text-micro text-text-subtle"
				data-testid={`${testId}-count`}
			>
				{active ? (
					<span>
						{shown} of {total} shown
					</span>
				) : (
					<span>
						Press <span className="font-mono">/</span> to filter
					</span>
				)}
			</p>
		</div>
	);
}

/* ── FilterBar ───────────────────────────────────────────────────────────── */

/**
 * ONE TOOLBAR, WITH NARROWING ON THE LEFT AND ORDERING ON THE RIGHT.
 *
 * Four chip groups used to sit in a single undifferentiated run: three that
 * NARROW the set and one that REORDERS it, in identical pills, reading as one
 * long strip of fourteen controls governing seven cards. Labelling the groups
 * fixed which dimension each chip belonged to and did nothing about the more
 * basic confusion, which is that two of these do completely different things.
 *
 * So the two kinds separate spatially. Filters left, ordering right, which is
 * the arrangement every toolbar the operator has used already puts them in.
 *
 * `summary` is the third thing a filter bar owes you and none of these had it:
 * what the filters currently leave, and a way out. It renders only when
 * something is actually filtered — the same non-zero rule the counts follow,
 * because "7 of 7" on arrival is the screen narrating its resting state.
 */
export function FilterBar({
	children,
	order,
	summary,
	"data-testid": testId,
}: {
	/** The narrowing controls. */
	children: ReactNode;
	/** The reordering control, pushed right. */
	order?: ReactNode;
	/** Rendered under the bar, only when a filter is active. */
	summary?: ReactNode;
	"data-testid": string;
}) {
	return (
		<div className="flex flex-col gap-2" data-testid={testId}>
			<div className="flex flex-wrap items-start gap-x-6 gap-y-4">
				{children}
				{order ? <div className="md:ml-auto">{order}</div> : null}
			</div>
			{summary}
		</div>
	);
}

/**
 * What the filters left, and the way back out.
 *
 * A count alone is a statement; a count with a reset is a control. Both are
 * absent when nothing is filtered, so the bar stays quiet until it is doing
 * something.
 */
export function FilterSummary({
	shown,
	total,
	noun,
	onClear,
	"data-testid": testId,
}: {
	shown: number;
	total: number;
	noun: string;
	onClear: () => void;
	"data-testid": string;
}) {
	if (shown === total) return null;
	return (
		<p
			className="flex flex-wrap items-center gap-2 text-micro text-text-subtle"
			data-testid={testId}
		>
			<span>
				{shown} of {total} {noun}
			</span>
			<button
				className="interactive rounded-xs px-1.5 py-0.5 text-accent-text"
				data-testid={`${testId}-clear`}
				onClick={onClear}
				type="button"
			>
				Clear filters
			</button>
		</p>
	);
}

/* ── PathBudget ──────────────────────────────────────────────────────────── */

/**
 * WHAT AN AGENT MAY CHANGE, as three numbers.
 *
 * This is the single strongest thing the agent-template list was missing. The
 * three path sets are already on the wire and appeared nowhere in the product,
 * and they are the first fact a reviewer looks for: an agent template list that
 * cannot say what an agent may WRITE is a list of names.
 *
 * The three are not three shades of one thing, which is why they are never
 * summed. `roster.ts` states the distinction and it is load-bearing: writable
 * is edit freely, append-only is add your own and never remove or reorder
 * anyone else's, read-only is read and do not write. A single "12 paths" would
 * erase exactly the difference that makes an agent safe.
 *
 * Zero is shown, in the subtle tone, never omitted. An agent with no writable
 * paths cannot change a single file, which is a real and notable configuration
 * — and an omitted row would read as "not recorded" instead.
 */
export function PathBudget({
	writable,
	appendOnly,
	readonly,
	"data-testid": testId,
}: {
	writable: number;
	appendOnly: number;
	readonly: number;
	"data-testid": string;
}) {
	const parts = [
		{ key: "writable", label: "writable", n: writable },
		{ key: "append", label: "append-only", n: appendOnly },
		{ key: "readonly", label: "read-only", n: readonly },
	];

	/*
	 * ALL THREE EMPTY IS "NOT DECLARED", NOT "DECLARED AS ZERO".
	 *
	 * The schema defaults every one of these to `{}`, so all-three-empty is the
	 * shape of a template nobody has configured rather than one deliberately
	 * granted nothing. Rendering `0 · 0 · 0` asserts a decision that was never
	 * made, and it did it seven times across the roster — twenty-one zeros on
	 * one screen, in the block that is supposed to be the strongest thing on a
	 * card.
	 *
	 * A partial grant still shows numbers, including its zeros: once ANY of the
	 * three is set, the empty ones are a real answer.
	 */
	if (writable === 0 && appendOnly === 0 && readonly === 0) {
		return (
			<p
				className="text-micro text-text-subtle"
				data-path-budget="undeclared"
				data-testid={testId}
			>
				No boundaries declared yet
			</p>
		);
	}

	return (
		<dl
			className="flex flex-wrap items-baseline gap-x-4 gap-y-1"
			data-path-budget="declared"
			data-testid={testId}
		>
			{parts.map((part) => (
				<div className="flex items-baseline gap-1.5" key={part.key}>
					<dd
						className={cn(
							"tabular text-sm",
							part.n === 0 ? "text-text-subtle" : "text-text",
						)}
						data-path-count={part.key}
					>
						{part.n}
					</dd>
					<dt className="text-micro text-text-subtle">{part.label}</dt>
				</div>
			))}
		</dl>
	);
}

/* ── small shared pieces ─────────────────────────────────────────────────── */

/**
 * A filter row. Chips rather than a `<select>` because the counts are the
 * point: an operator has to be able to see that three of fourteen skills are
 * revoked without opening anything.
 */
export function FilterChips<K extends string>({
	options,
	value,
	onChange,
	label,
	"data-testid": testId,
}: {
	/** `count` is optional: an ORDER has no count, only a filter does. */
	options: { key: K; label: string; count?: number }[];
	value: K;
	onChange: (key: K) => void;
	/** Short, and now VISIBLE. One or two words. */
	label: string;
	"data-testid": string;
}) {
	return (
		// A real <fieldset>, not a div with role="group". The legend renders
		// ABOVE the chips rather than inside the flex row: a <legend> is laid out
		// specially by browsers and putting it in a flex container is where that
		// gets unpredictable, so the chips get their own row instead.
		<fieldset className="min-w-0 border-0 p-0" data-testid={testId}>
			{/*
			 * VISIBLE, and it used to be `sr-only`. Four groups sat in one row with
			 * 8px between chips and 16px between groups — a 2:1 ratio that is not
			 * enough to read as a boundary — so fourteen chips ran together as one
			 * undifferentiated strip and nothing said which dimension any of them
			 * belonged to. Naming the dimension is what turns a strip of pills back
			 * into four small controls.
			 */}
			<legend className="float-none p-0 pb-1.5 text-micro text-text-subtle">
				{label}
			</legend>
			<div className="flex flex-wrap items-center gap-1.5">
				{options.map((option) => {
					const active = option.key === value;
					/*
					 * A CHIP THAT CAN ONLY EMPTY THE TABLE IS DISABLED, WITH ITS COUNT
					 * STILL SHOWING. Section 12 rule 6 does not quite name this case:
					 * the control works perfectly and its only possible outcome is
					 * nothing. Disabled rather than hidden, because the count is the
					 * information — hiding "Person" would leave an operator unable to
					 * tell whether no agent is run by a person or whether the product
					 * has no such idea. The active chip is never disabled, so no
					 * filter can trap you.
					 *
					 * A countless option is never dead: an ordering always applies.
					 */
					const dead = option.count === 0 && !active;
					return (
						<button
							aria-pressed={active}
							className={cn(
								"rounded-full border px-2.5 py-0.5 text-micro",
								"transition-colors duration-[var(--duration-micro)] ease-[var(--ease-avel)] motion-reduce:transition-none",
								active
									? "border-border-strong bg-accent-surface text-text"
									: "border-[var(--elevation-border-rest)] text-text-muted",
								dead
									? "cursor-not-allowed opacity-[var(--opacity-disabled)]"
									: "interactive",
							)}
							data-testid={`${testId}-${option.key}`}
							disabled={dead}
							key={option.key}
							onClick={() => onChange(option.key)}
							title={dead ? "Nothing matches this filter" : undefined}
							type="button"
						>
							{option.label}
							{option.count === undefined ? null : (
								<span className="tabular pl-1.5 text-text-subtle">
									{option.count}
								</span>
							)}
						</button>
					);
				})}
			</div>
		</fieldset>
	);
}

/**
 * A notice that sits above content and says one thing went wrong with it.
 *
 * Not an ErrorState: the read succeeded, and the screen is fully usable. This
 * marks a condition IN the data. Both places it is used are conditions that
 * shipped as bugs on this project, so they get a banner rather than a
 * footnote.
 */
export function DataNotice({
	tone,
	icon: Icon,
	title,
	body,
	"data-testid": testId,
}: {
	tone: "warn" | "block";
	icon: LucideIcon;
	title: string;
	body: string;
	"data-testid": string;
}) {
	return (
		<div
			className={cn(
				"flex items-start gap-3 rounded-md border px-4 py-3",
				tone === "block"
					? "border-gate-block-line bg-gate-block-soft"
					: "border-gate-warn-line bg-gate-warn-soft",
			)}
			data-testid={testId}
		>
			<Icon
				aria-hidden="true"
				className={cn(
					"mt-0.5 size-4 shrink-0",
					tone === "block" ? "text-gate-block" : "text-gate-warn",
				)}
				strokeWidth={1.8}
			/>
			<div className="min-w-0">
				<p
					className={cn(
						"text-sm font-medium",
						tone === "block" ? "text-gate-block" : "text-gate-warn",
					)}
				>
					{title}
				</p>
				<p className="max-w-[52ch] pt-1 text-sm leading-relaxed text-text-muted">
					{body}
				</p>
			</div>
		</div>
	);
}

/** Monospaced, one per line, for globs and slugs. Never wrapped mid-path. */
export function PathList({
	paths,
	emptyLabel,
	"data-testid": testId,
}: {
	paths: string[];
	/** What NO paths means here. It is never the same sentence twice. */
	emptyLabel: string;
	"data-testid": string;
}) {
	if (paths.length === 0) {
		return (
			<p className="text-sm text-text-subtle" data-testid={`${testId}-empty`}>
				{emptyLabel}
			</p>
		);
	}
	return (
		<ul className="flex flex-col gap-1" data-testid={testId}>
			{paths.map((path) => (
				<li
					className="font-mono text-micro break-all text-text-muted"
					key={path}
				>
					{path}
				</li>
			))}
		</ul>
	);
}
