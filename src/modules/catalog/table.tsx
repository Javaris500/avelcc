import { type ReactNode, useMemo, useState } from "react";

import { cn } from "#/utils/cn";

/**
 * THE TABLE, AND THE COUNT CELL THAT ONLY IT USES.
 *
 * Split out of `ui.tsx` because the two catalog screens that had tables no
 * longer do: skills is a library with a reading pane and agent templates is a
 * roster of cards, both because those shapes follow what the entities actually
 * are. Sources is the one list that is still genuinely tabular — a short set of
 * rows with a split count — so the table machinery serves one screen and does
 * not belong in the file every screen imports.
 *
 * `ui.tsx` stays the seam that gets deleted when avel-71's primitives land.
 * `DataTable` is still one of the requested names, so this file goes the same
 * way; keeping it separate means the seam file is not 760 lines of which most
 * serves one caller.
 */

/**
 * A COUNT CELL, WITH ONE SHAPE FOR EVERY VALUE.
 *
 * Three columns across two screens were each inventing their own treatment of
 * zero: `2 templates` over `0 roster entries` on most skill rows but a bare
 * `nothing` on one, `4` against `none` in the agents skills column, and `1`
 * against `never used` under On teams. Every one of those was defensible on its
 * own — a bare `0` in a column of counts really can read as a missing value —
 * and together they made a right-aligned numeric column impossible to scan,
 * because a reader cannot tell whether `nothing` means zero or unknown.
 *
 * So the number is always a number, and the words move to the line beneath it
 * where they qualify rather than replace. Zero is rendered in the subtle tone
 * instead of being written out, which is what stops it reading as missing.
 *
 * Found by avel-96 auditing the populated screens. It was invisible while every
 * catalogue row was hypothetical.
 */
export function CountCell({
	value,
	/** What the number counts. ALWAYS shown, so the unit is never inferred. */
	unit,
	/**
	 * A third line, for the exceptional case only. Never a substitute for the
	 * unit: the first version let it replace the unit, and the column went
	 * straight back to mixing kinds — most rows read `4 skills` while two read
	 * `4 · 1 revoked`, so the same slot meant "what these are" on one row and
	 * "what is wrong with them" on the next. Seen on the rendered page, not
	 * reasoned about.
	 */
	warning,
	"data-testid": testId,
}: {
	value: number;
	unit: string;
	warning?: string;
	"data-testid": string;
}) {
	return (
		<div
			className="flex flex-col items-end gap-0.5"
			data-count={value}
			data-testid={testId}
		>
			{/*
			 * Zero is a NUMBER in the subtle tone, never a word. `nothing`, `none`
			 * and `never used` were each defensible alone and together made the
			 * column unscannable: a reader cannot tell whether a word means zero or
			 * unknown, which is rule 7's distinction at cell scale. The demoted
			 * tone is what stops a bare 0 reading as a missing value.
			 */}
			<span
				className={cn(
					"text-sm",
					value === 0 ? "text-text-subtle" : "text-text",
				)}
			>
				{value}
			</span>
			<span className="text-micro text-text-subtle">{unit}</span>
			{warning ? (
				<span className="text-micro text-gate-block">{warning}</span>
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
												{active ? (sort.desc ? "↓" : "↑") : "↕"}
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
