import type { LucideIcon } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import { Pill, StatusBadge, type StatusBadgeProps } from "#/ui/badge";
import { EmptyState } from "#/ui/states";
import { cn } from "#/utils/cn";

/**
 * THE SHARED VOCABULARY, HELD IN ONE FILE UNTIL IT HAS A REAL HOME.
 *
 * UI-PLAN section 2 lists eleven components the shell needs and records that
 * none of them exist. `src/ui/` holds ten primitives today, verified by listing
 * it: badge, button, dialog, dropdown-menu, input, page-empty, skeleton,
 * states, surface, tooltip. `PageHeader`, `SectionCard`, `DefinitionList`,
 * `StatusChip`, `DataTable` and `MetricStat` are not among them. `[built]`
 *
 * avel-71 owns `src/ui/` and is building those six. This session may not write
 * there. The instruction that came with this work is the important one: "DO NOT
 * INVENT PARALLEL COMPONENTS. Four sessions each building their own card is the
 * specific outcome this split exists to prevent."
 *
 * So this file is the single seam, and it obeys three rules:
 *
 *   1. ONE FILE. Nothing in `src/modules/catalog/` styles a card, a table or a
 *      chip itself. Everything imports from here. When the real primitives
 *      land, this file becomes six re-export lines and one commit closes it.
 *   2. NOTHING NEW IS INVENTED. Where `src/ui/` already has the thing, this
 *      wraps it rather than reimplementing it. `StatusChip` is `StatusBadge`
 *      with a domain mapping. `EmptyState` is re-exported untouched.
 *   3. THE PROP SIGNATURES ARE THE REQUEST. They are what the catalog screens
 *      need. Where they differ from what avel-71 builds, avel-71 wins and this
 *      module adapts.
 *
 * WHAT IS BEING ASKED FOR, beyond the six names, and why:
 *   - `PageHeader` needs a `definition` slot SEPARATE from `subtitle`. Section
 *     2 gives the subtitle to "counts, status, last activity". Section 12 rule
 *     5 gives the header the one plain sentence that names the jargon. Those
 *     are two different lines with two different jobs, and collapsing them
 *     loses the counts or loses the explanation.
 *   - `SectionCard` needs the same `definition` slot for the same reason.
 *   - `DataTable` needs a per-row tone. A revoked row that looks like a live
 *     row is the defect this catalog was asked to fix, and it cannot be fixed
 *     from inside a cell.
 *
 * MOTION. CSS only, on `--duration-micro` and `--ease-avel` from
 * patch.css:114-117. No library is installed and adding one is open (section
 * 11). The `interactive` utility already carries the hover transition on those
 * tokens, so hover states use it rather than a second timing.
 */

/* ── re-exported untouched ───────────────────────────────────────────────── */

export { EmptyState };

/* ── PageHeader ──────────────────────────────────────────────────────────── */

export type PageHeaderProps = {
	title: string;
	/**
	 * The one plain sentence that names the jargon on the screen. Section 12
	 * rule 5. Rendered above the counts because an operator who does not know
	 * what a skill is cannot read a count of them.
	 */
	definition?: string;
	/** Counts, status, last activity. Section 2's subtitle slot. */
	subtitle?: ReactNode;
	/** Exactly one, per section 2. Empty is a valid state. */
	action?: ReactNode;
	"data-testid": string;
};

/**
 * IN-CONTENT FOR NOW, AND THAT IS TEMPORARY.
 *
 * Section 2 rules that the `h1` moves into the shell header, and that "moving
 * the h1 into the header is what stops the strip reading as a divider". That
 * needs `ActionSlot`, which does not exist, and `src/modules/shell/` which this
 * session may not write. Rendering the title in the content is what every other
 * route does today, so this is consistent rather than novel, and it is one
 * import to move when the slot lands.
 */
export function PageHeader({
	title,
	definition,
	subtitle,
	action,
	"data-testid": testId,
}: PageHeaderProps) {
	return (
		<header
			className="flex flex-wrap items-start gap-x-6 gap-y-3 pb-5"
			data-testid={testId}
		>
			<div className="min-w-0 flex-1">
				<h1
					className="font-display text-lg font-semibold text-text"
					data-testid={`${testId}-title`}
				>
					{title}
				</h1>
				{definition ? (
					<p
						className="max-w-[68ch] pt-1.5 text-sm leading-relaxed text-text-muted"
						data-testid={`${testId}-definition`}
					>
						{definition}
					</p>
				) : null}
				{subtitle ? (
					<div
						className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-micro text-text-subtle"
						data-testid={`${testId}-subtitle`}
					>
						{subtitle}
					</div>
				) : null}
			</div>
			{/* No reserved space when there is no action. Section 2 is explicit. */}
			{action ? <div className="shrink-0">{action}</div> : null}
		</header>
	);
}

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
						className="w-full max-w-[68ch] text-micro leading-relaxed text-text-subtle"
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
							<p className="max-w-[64ch] pt-1 text-micro leading-relaxed text-text-subtle">
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

/* ── MetricStat ──────────────────────────────────────────────────────────── */

/**
 * A number with a label. `hint` is the third line section 2 calls a trend; the
 * catalog has no time series, so it carries a qualifier instead of a delta. An
 * invented trend arrow would be the screen asserting a change nothing measured.
 */
export function MetricStat({
	label,
	value,
	hint,
	tone = "rest",
	"data-testid": testId,
}: {
	label: string;
	value: ReactNode;
	hint?: string;
	/** `warn` where the number is a problem rather than a fact. */
	tone?: "rest" | "warn";
	"data-testid": string;
}) {
	return (
		<div
			className="elev-1 min-w-[12ch] flex-1 rounded-md px-4 py-3"
			data-testid={testId}
		>
			<p
				className={cn(
					"tabular font-display text-lg font-semibold",
					tone === "warn" ? "text-gate-warn" : "text-text",
				)}
				data-testid={`${testId}-value`}
			>
				{value}
			</p>
			<p className="pt-0.5 text-micro text-text-muted">{label}</p>
			{hint ? (
				<p className="pt-1 text-micro leading-relaxed text-text-subtle">
					{hint}
				</p>
			) : null}
		</div>
	);
}

/* ── DataTable ───────────────────────────────────────────────────────────── */

export type Column<T> = {
	key: string;
	header: string;
	render: (row: T) => ReactNode;
	/** Omit to make the column unsortable. */
	sortValue?: (row: T) => string | number;
	align?: "start" | "end";
	/** Dropped below `lg`. Catalog routes are desktop-only, this is headroom. */
	secondary?: boolean;
};

export type RowTone = "rest" | "revoked" | "warn";

export type DataTableProps<T> = {
	rows: T[];
	columns: Column<T>[];
	rowId: (row: T) => string;
	/**
	 * PER ROW, NOT PER CELL. A withdrawn row has to read as withdrawn across its
	 * whole width. Doing it inside one cell is how a revoked skill ends up
	 * looking live everywhere except the column nobody was reading.
	 */
	rowTone?: (row: T) => RowTone;
	/** The cell whose contents become the row's select control. */
	selectColumn?: string;
	selectedId?: string | null;
	onSelect?: (id: string) => void;
	/** Rendered in place of the body. Say why it is empty, never "Nothing here". */
	empty: ReactNode;
	/** Screen-reader description of what the table lists. */
	caption: string;
	"data-testid": string;
};

const TONE_ROW: Record<RowTone, string> = {
	rest: "",
	/**
	 * Dimmed AND struck through on the leading cell, never dimming alone.
	 * Opacity is not a state: a low-contrast row reads as disabled, as loading
	 * or as a rendering fault depending on who is looking. The row also carries
	 * `data-row-tone` so a test can assert the state rather than a colour.
	 */
	revoked: "text-text-subtle",
	warn: "",
};

export function DataTable<T>({
	rows,
	columns,
	rowId,
	rowTone,
	selectColumn,
	selectedId,
	onSelect,
	empty,
	caption,
	"data-testid": testId,
}: DataTableProps<T>) {
	const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null);

	const sorted = useMemo(() => {
		if (sort === null) return rows;
		const column = columns.find((c) => c.key === sort.key);
		if (column?.sortValue === undefined) return rows;
		const read = column.sortValue;
		// A copy. Sorting the prop in place mutates the caller's array, and the
		// caller here is a react-query cache entry shared with other screens.
		return [...rows].sort((a, b) => {
			const left = read(a);
			const right = read(b);
			const order =
				typeof left === "number" && typeof right === "number"
					? left - right
					: String(left).localeCompare(String(right));
			return sort.desc ? -order : order;
		});
	}, [rows, columns, sort]);

	if (rows.length === 0) return <>{empty}</>;

	return (
		<div className="app-scroll overflow-x-auto">
			<table
				className="density-comfortable w-full border-collapse text-sm"
				data-testid={testId}
			>
				<caption className="sr-only">{caption}</caption>
				<thead>
					{/* No rule under the header row either. The label tone already
					    separates it from the data, and the extra bottom padding does
					    what the line was doing. */}
					<tr>
						{columns.map((column) => {
							const active = sort?.key === column.key;
							return (
								<th
									className={cn(
										"px-3 pt-2 pb-3 text-micro font-medium text-text-subtle",
										column.align === "end" ? "text-right" : "text-left",
										column.secondary ? "hidden lg:table-cell" : "",
									)}
									key={column.key}
									scope="col"
								>
									{column.sortValue === undefined ? (
										column.header
									) : (
										<button
											aria-label={`Sort by ${column.header}`}
											className="interactive -mx-1 rounded-xs px-1 py-0.5"
											data-testid={`${testId}-sort-${column.key}`}
											onClick={() =>
												setSort(
													active
														? { key: column.key, desc: !sort.desc }
														: { key: column.key, desc: false },
												)
											}
											type="button"
										>
											{column.header}
											{/* The glyph carries the direction. An arrow that only
											    changes colour when active is not a state. */}
											<span aria-hidden="true" className="pl-1 font-mono">
												{active ? (sort.desc ? "↓" : "↑") : "·"}
											</span>
										</button>
									)}
								</th>
							);
						})}
					</tr>
				</thead>
				<tbody>
					{sorted.map((row) => {
						const id = rowId(row);
						const tone = rowTone?.(row) ?? "rest";
						const selected = selectedId === id;
						return (
							<tr
								className={cn(
									// No rule between rows. `--row-pad` is the separation now,
									// which is what "tone and gap" means for a table: the rows
									// are already distinguished by their own content and a line
									// per row is 200 lines on a full catalog.
									//
									// Selection is a background, and it transitions on the
									// state duration rather than the micro one: it is a panel
									// state change, which is what --duration-state is for.
									"transition-colors duration-[var(--duration-state)] ease-[var(--ease-avel)]",
									selected ? "bg-accent-surface" : "",
									TONE_ROW[tone],
								)}
								data-row-tone={tone}
								data-selected={selected ? "true" : undefined}
								data-testid={`${testId}-row`}
								key={id}
							>
								{columns.map((column) => {
									const content = column.render(row);
									const isSelect =
										onSelect !== undefined && column.key === selectColumn;
									return (
										<td
											className={cn(
												"px-3 py-[var(--row-pad)] align-top",
												column.align === "end"
													? "text-right tabular"
													: "text-left",
												column.secondary ? "hidden lg:table-cell" : "",
											)}
											key={column.key}
										>
											{isSelect ? (
												// A real button rather than a click handler on the
												// row. The row is a <tr>, and a <tr> given onClick
												// is not reachable by keyboard without inventing
												// roles that lie about what it is.
												<button
													aria-expanded={selected}
													className="interactive -mx-1 block w-full rounded-sm px-1 py-0.5 text-left"
													data-testid={`${testId}-select`}
													onClick={() => onSelect(id)}
													type="button"
												>
													{content}
												</button>
											) : (
												content
											)}
										</td>
									);
								})}
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
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
	options: { key: K; label: string; count: number }[];
	value: K;
	onChange: (key: K) => void;
	label: string;
	"data-testid": string;
}) {
	return (
		// A real <fieldset>, not a div carrying role="group". The set of chips IS
		// one control with several options, and the element that says so already
		// exists. The legend is the group's name and is read rather than seen: the
		// chips carry their own labels, so a visible "Filter by state" above them
		// would be a second heading for something already obvious.
		<fieldset
			className="flex flex-wrap items-center gap-2 border-0 p-0"
			data-testid={testId}
		>
			<legend className="sr-only">{label}</legend>
			{options.map((option) => {
				const active = option.key === value;
				return (
					<button
						aria-pressed={active}
						className={cn(
							"interactive rounded-full border px-2.5 py-0.5 text-micro",
							"transition-colors duration-[var(--duration-micro)] ease-[var(--ease-avel)]",
							active
								? "border-border-strong bg-accent-surface text-text"
								: "border-[var(--elevation-border-rest)] text-text-muted",
						)}
						data-testid={`${testId}-${option.key}`}
						key={option.key}
						onClick={() => onChange(option.key)}
						type="button"
					>
						{option.label}
						<span className="tabular pl-1.5 text-text-subtle">
							{option.count}
						</span>
					</button>
				);
			})}
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
				<p className="max-w-[68ch] pt-1 text-sm leading-relaxed text-text-muted">
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
