import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	Outlet,
	useParams,
} from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import type { z } from "zod";

import { clientListRow, clientStatus } from "#/contract/client";
import { successList } from "#/contract/shared/envelope";
import { CLIENT_STATUS_TONE } from "#/modules/client/ui/status";
import { StatusBadge } from "#/ui/badge";
import { Button } from "#/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "#/ui/dropdown-menu";
import { SkeletonRows } from "#/ui/skeleton";
import { EmptyState, ErrorState } from "#/ui/states";
import { Surface } from "#/ui/surface";
import { cn } from "#/utils/cn";

/**
 * Clients — the three-pane layout, and the second pane.
 *
 * OPERATOR RULING: "The clients page should be a table for the 2nd view."
 * `nav | clients table | detail`. This route owns the table and hands the third
 * pane to whichever child route is active.
 *
 * A LAYOUT ROUTE RATHER THAN SELECTION STATE. The selected client lives in the
 * URL because it is a route param — `/clients/:id` renders the detail into the
 * `Outlet` below while this table stays mounted. So a selected client is
 * linkable, survives a reload, and works with the back button, none of which a
 * `useState` selection gives you. That is the same class of mistake as the dead
 * top-bar dropdowns whose selection lived in `useState` inside the TopBar: state
 * the product appears to hold and does not.
 *
 * NO RULES. The operator asked for every divider removed, so the panes are
 * separated by tone and gap and the rows carry no hairline. A selected row is
 * marked by surface, not by a line.
 */
export const Route = createFileRoute("/_app/clients")({
	staticData: { device: "construction" as const },
	component: ClientsLayout,
});

const clientListResponse = successList(clientListRow);
type ClientListResponse = z.infer<typeof clientListResponse>;
type ClientRow = z.infer<typeof clientListRow>;

/** Client-only failure labels, exactly as `missions.index.tsx` declares them. */
const SHAPE_MISMATCH = "SHAPE_MISMATCH";
const httpFailure = (status: number) => `HTTP_${status}`;

async function fetchClients(): Promise<ClientListResponse> {
	const res = await fetch("/api/clients");
	const body = await res.json().catch(() => null);

	// Codes are the contract; messages change freely. Nothing here parses one.
	if (body?.success === false) throw new Error(body.error.code);
	if (!res.ok || body === null) throw new Error(httpFailure(res.status));

	const parsed = clientListResponse.safeParse(body);
	if (!parsed.success) throw new Error(SHAPE_MISMATCH);

	return parsed.data;
}

/**
 * `client.list` declares 200 and 403 only, so FORBIDDEN is the single code an
 * envelope can carry here. Same reasoning as the mission list: name the cases
 * that can actually arrive rather than inventing a table for a vocabulary this
 * screen does not own.
 */
function describeFailure(code: string): {
	title: string;
	body: string;
	canRetry: boolean;
} {
	const title = "The client list could not be read.";
	switch (code) {
		case "FORBIDDEN":
			return {
				title,
				body: "This session is not permitted to read clients. Nothing was loaded.",
				canRetry: false,
			};
		case SHAPE_MISMATCH:
			return {
				title,
				body: "The endpoint answered, but the body did not match client.list. The screen and the route have drifted apart, and rendering it anyway would be a guess.",
				canRetry: false,
			};
		default:
			return {
				title,
				body: "The request to /api/clients did not complete, so nothing was loaded. This screen only reads, so nothing was written either.",
				canRetry: true,
			};
	}
}

/**
 * The three columns the reference names: Account, Lead, State.
 *
 * They map onto real fields — `name`, `primaryContact`, `status` — which is why
 * these three and not others. `primaryContact` is nullable, so Lead sorts with
 * the unnamed ones together rather than scattered; see `compare`.
 *
 * Typed against the contract rather than as loose strings, so a column that
 * ever leaves `clientListRow` stops compiling here instead of silently sorting
 * by undefined.
 */
type SortKey = Extract<
	keyof ClientRow,
	| "name"
	| "primaryContact"
	| "status"
	| "openRequests"
	| "activeMissions"
	| "openBlockers"
	| "lastActivityAt"
>;
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string }[] = [
	{ key: "name", label: "Account" },
	{ key: "primaryContact", label: "Lead" },
	{ key: "status", label: "State" },
	{ key: "openRequests", label: "Requests" },
	{ key: "activeMissions", label: "Missions" },
	{ key: "openBlockers", label: "Blocked" },
	{ key: "lastActivityAt", label: "Last activity" },
];

/**
 * THE SWITCHER'S COLUMNS. Two, not seven.
 *
 * With a client selected the pane stops being a table and becomes a way to
 * change which client you are looking at. Seven columns in the width that
 * leaves clipped the last one at the pane edge — the operator saw "BLOCKE"
 * with nowhere for the rest to go.
 *
 * Account answers "which one is this" and Blocked answers "which one needs me",
 * which is the whole job of a switcher. The other five are browsing columns and
 * they live at `/clients`, where the table has the full width and is genuinely
 * a table.
 */
const COMPACT_COLUMNS: { key: SortKey; label: string }[] = [
	{ key: "name", label: "Account" },
	{ key: "openBlockers", label: "Blocked" },
];

/**
 * ONE DEFINITION FOR EVERY CELL, so the hover band is unbroken across the row.
 *
 * The hover was on the `<tr>` with `interactive rounded-sm`, and a `<tr>` is
 * `display: table-row` — WHICH CANNOT TAKE A BORDER RADIUS. Measured: the
 * computed radius was 6px and the browser ignored it, so a wash meant to read
 * as a rounded band painted as a hard-edged full-width stripe. The 3.5% white
 * it used was also close to invisible.
 *
 * Painting the CELLS instead is what makes a radius possible at all: the first
 * and last round their outer corners and the row reads as one pill. The tint is
 * 7% accent rather than a neutral wash — visible, and the brand colour the rest
 * of the shell already uses for state.
 */
const CELL =
	"px-2 py-2 transition-colors duration-[var(--duration-micro)] first:rounded-l-sm last:rounded-r-sm group-hover:bg-[color-mix(in_oklab,var(--color-accent)_7%,transparent)] motion-reduce:transition-none";

/**
 * A COUNTED ZERO IS NOT A MISSING VALUE, and the row has to say which. An em
 * dash means "we did not look"; a 0 means "we looked and there are none". Both
 * appear in this table — `lastActivityAt` is genuinely null for a client with
 * no mission — so the two cannot render alike.
 */
function Count({ n }: { n: number }) {
	return n === 0 ? (
		<span className="text-text-subtle">0</span>
	) : (
		<span className="text-text">{n}</span>
	);
}

const STATUS_FILTERS = ["all", ...clientStatus.options] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

/**
 * Localised comparison, not `<`. Names are arbitrary text and byte order puts
 * every lowercase name after every uppercase one, which reads as unsorted to
 * anyone who is not thinking about ASCII.
 *
 * A null Lead sorts LAST in both directions rather than being treated as an
 * empty string. Reversing the sort should reorder the clients that have a lead,
 * not promote the ones that do not to the top of the list. `lastActivityAt` is
 * nullable for the same reason and gets the same treatment — a client with no
 * mission has no activity to rank.
 */
function compare(a: ClientRow, b: ClientRow, key: SortKey, dir: SortDir) {
	const x = a[key];
	const y = b[key];
	if (x === null && y === null) return 0;
	if (x === null) return 1;
	if (y === null) return -1;
	// NUMBERS COMPARE NUMERICALLY. Three of the columns are counts, and
	// localeCompare on their string forms sorts 10 before 9. The null guards
	// above already ran, so anything left is a string or a number.
	const result =
		typeof x === "number" && typeof y === "number"
			? x - y
			: String(x).localeCompare(String(y));
	return dir === "asc" ? result : -result;
}

function HeaderCell({
	active,
	dir,
	label,
	onClick,
}: {
	active: boolean;
	dir: SortDir;
	label: string;
	onClick: () => void;
}) {
	return (
		<th
			// `aria-sort` belongs on the column header cell, and this is one. The
			// earlier version of this table was a list of buttons, where the same
			// attribute would have been ignored by assistive tech while looking
			// handled.
			aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
			className="text-left font-normal"
			scope="col"
		>
			<button
				className="interactive flex w-full items-center gap-1 rounded-sm px-2 py-1 text-micro text-text-subtle uppercase"
				data-testid={`clients-sort-${label.toLowerCase()}`}
				onClick={onClick}
				type="button"
			>
				{label}
				<span aria-hidden="true" className="font-mono">
					{active ? (dir === "asc" ? "↑" : "↓") : "·"}
				</span>
			</button>
		</th>
	);
}

/**
 * THE CLIENT SWITCHER, which replaces the table on a detail page.
 *
 * Changing which client you are looking at is a control, not a region. As a
 * column the table spent 288x723 to show one row, and the space it held was
 * taken from the pane that had ten sections to render.
 *
 * It carries the blocked count on every entry, because that is the one signal
 * UI-PLAN requires to survive into any list of clients — and only where it is
 * non-zero, so "not blocked" and "not counted" stay different pixels.
 *
 * Disabled with a reason when there is nothing to switch to. One client is not
 * a choice, and a menu that opens onto a single item you are already looking at
 * is the kind of control this project keeps deleting.
 */
function ClientSwitcher({
	rows,
	selectedId,
}: {
	rows: ClientListResponse["data"];
	selectedId: string;
}) {
	const current = rows.find((r) => r.id === selectedId);
	const others = rows.filter((r) => r.id !== selectedId);

	if (others.length === 0) {
		return (
			<span
				className="inline-flex items-center gap-2 rounded-sm bg-app-raised px-2.5 py-2 text-sm text-text"
				data-testid="client-switcher-only"
				title="This is the only client. There is nothing to switch to."
			>
				{current?.name ?? "Client"}
			</span>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				className="interactive group inline-flex items-center gap-2 rounded-sm bg-app-raised px-2.5 py-2 text-left text-sm text-text"
				data-testid="client-switcher"
			>
				{current?.name ?? "Client"}
				<ChevronDown
					aria-hidden="true"
					className="shrink-0 text-text-subtle transition-transform duration-[var(--duration-micro)] group-data-[state=open]:rotate-180"
					size={12}
					strokeWidth={2}
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" data-testid="client-switcher-menu">
				<DropdownMenuLabel>Switch client</DropdownMenuLabel>
				{others.map((r) => (
					<DropdownMenuItem asChild key={r.id}>
						<Link
							data-testid={`client-switcher-option-${r.id}`}
							params={{ clientId: r.id }}
							to="/clients/$clientId"
						>
							{r.name}
							{r.openBlockers > 0 ? (
								<StatusBadge
									className="ml-auto"
									data-testid="client-switcher-blocked"
									tone="warn"
								>
									{r.openBlockers}
								</StatusBadge>
							) : null}
						</Link>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function ClientsLayout() {
	const query = useQuery<ClientListResponse>({
		queryKey: ["clients"],
		queryFn: fetchClients,
		retry: false,
	});

	/**
	 * The selected client, read from the URL rather than held here.
	 *
	 * `strict: false` because this layout renders under both `/clients` and
	 * `/clients/:clientId` and only the second has the param. Undefined is a real
	 * state — nothing selected — and is what the third pane's empty view is for.
	 */
	const params = useParams({ strict: false });
	const selectedId = (params as { clientId?: string }).clientId;

	const [sortKey, setSortKey] = useState<SortKey>("name");
	const [sortDir, setSortDir] = useState<SortDir>("asc");
	const [status, setStatus] = useState<StatusFilter>("all");

	const rows = query.data?.data;

	/**
	 * Filter then sort, ON A COPY. `sort` mutates, and this array is the one
	 * react-query is caching — sorting it in place reorders the cache, so any
	 * other consumer's next render reads an order nothing asked for.
	 */
	const visible = useMemo(() => {
		if (!rows) return [];
		const filtered =
			status === "all" ? rows : rows.filter((r) => r.status === status);
		return [...filtered].sort((a, b) => compare(a, b, sortKey, sortDir));
	}, [rows, status, sortKey, sortDir]);

	function toggleSort(key: SortKey) {
		if (key === sortKey) {
			setSortDir(sortDir === "asc" ? "desc" : "asc");
			return;
		}
		setSortKey(key);
		setSortDir("asc");
	}

	return (
		/*
		 * TWO PANES AT `/clients`, THREE AT `/clients/:id`. Operator ruling: an
		 * empty detail pane whose only content is "pick a client" is waste, and
		 * the table should have the room instead.
		 *
		 * The shape is decided by the ROUTE — `selectedId` is a param — and never
		 * by whether the Outlet rendered anything. A layout that infers its
		 * columns from its child's output breaks the first time a child returns
		 * null for an unrelated reason, and it would fail silently, as a layout
		 * that is merely wrong rather than broken.
		 *
		 * With nothing selected the table takes the full width. With a client
		 * selected it drops to a fixed measure and the detail takes the rest,
		 * because the detail is where the nine sections live and is the pane that
		 * benefits from width.
		 */
		/*
		 * NO PADDING HERE. The shell's `main` is already `p-6`, so this added a
		 * second 24px on every side and pushed the panes 48px off the frame. The
		 * gap between the two panes is this row's job; the margin around them is
		 * the shell's.
		 */
		<div
			className={cn(
				"flex h-full flex-col gap-4",
				// A ROW ONLY WHERE THERE ARE TWO PANES. On the id page the switcher
				// is one line above the detail, not a column beside it.
				selectedId === undefined && "lg:flex-row",
			)}
		>
			<section
				aria-label="Clients"
				/*
				 * HIDDEN ON A NARROW SCREEN WHEN SOMETHING IS SELECTED. The request
				 * review nested under here is phone-allowed, so this layout does
				 * render on a phone — and stacking the whole clients table above the
				 * thing the operator opened would mean scrolling past every client to
				 * reach the one decision they came for. On a phone the selected child
				 * IS the screen.
				 */
				/*
				 * 18rem WHEN SELECTED, was 26rem. At the old width the seven-column
				 * table clipped its last column and the pane still ran ~90% empty
				 * below a single row, while the detail pane — nine sections, a metric
				 * row, a definition list and prose — was squeezed to about 570px and
				 * wrapped its prose at roughly 55 characters. The width was being
				 * spent on the pane that had least to say.
				 */
				/*
				 * A BAR, NOT A COLUMN, once a client is selected.
				 *
				 * As a column it was 288px wide and 723px tall holding about 135px of
				 * content — a ~590px void between the sidebar and everything the
				 * operator was actually reading, and it pushed the sections 43% of
				 * the way across a 1440px screen. The list has one row today; the
				 * detail has ten sections. The column was sized for the wrong one.
				 *
				 * The table does not shrink into the bar, it is REPLACED by a
				 * switcher: on a detail page, changing which client you are looking
				 * at is a control, not a spatial region. The full table lives at
				 * /clients, where it has the width to be a table.
				 */
				className={
					selectedId === undefined
						? "flex min-w-0 flex-1 flex-col gap-3"
						: "flex shrink-0 flex-wrap items-center gap-2 max-lg:hidden"
				}
				data-testid="clients-pane"
			>
				{/*
				 * NO HEADING HERE. The shell header owns the document's only h1 and
				 * already renders "Clients", so a second one was a literal duplicate
				 * — two <h1>Clients</h1> in one document and two `page-title`
				 * testids, which is a selector that silently matches the wrong one.
				 * The pane is named by its `aria-label`, so nothing is lost.
				 */}
				{/*
				 * THE SWITCHER LEADS THE BAR. It names what you are looking at, and
				 * identity comes before the things you can do to it — reading
				 * "New client · Import · CounselOS" puts the answer after the verbs.
				 *
				 * ONE OR THE OTHER, never both: on the id page the bar carries this
				 * and the table is not rendered at all. Shrinking a table into a bar
				 * would keep the component and lose the point.
				 */}
				{selectedId === undefined ? null : (
					<ClientSwitcher
						rows={query.data?.data ?? []}
						selectedId={selectedId}
					/>
				)}

				<div className="flex flex-wrap items-center gap-2">
					{/*
					 * MODULE ACTIONS, which sit left of the shell's core actions. Both
					 * are disabled by STATE with the reason in the tooltip rather than
					 * beside them: at this width a sentence per button would be most of
					 * the pane. `title` is the compromise, and it is a real one — a
					 * tooltip is worse than visible text, and it beats a button that
					 * looks live.
					 */}
					{/*
					 * LEFT-ALIGNED. This row carried `sm:ml-auto` with nothing on its
					 * left, so two buttons floated in the middle of the pane, aligned
					 * to neither its edge nor the filter row directly beneath them.
					 * `ml-auto` pushes against a sibling, and there was no sibling.
					 */}
					<div className="flex items-center gap-2">
						<Button
							data-testid="clients-new"
							disabled
							title="The create form is not built."
							variant="primary"
						>
							New client
						</Button>
						<Button
							data-testid="clients-import"
							disabled
							title="Import is not built. There is no importer and no file format decided."
							variant="secondary"
						>
							Import
						</Button>
					</div>
				</div>

				{selectedId !== undefined ? null : (
					<Surface
						empty={
							<EmptyState
								action={
									<div className="flex flex-wrap items-center gap-3">
										<Button
											data-testid="clients-empty-new"
											disabled
											variant="primary"
										>
											New client
										</Button>
										<span className="text-sm text-text-subtle">
											Disabled: the create form is not built.
										</span>
									</div>
								}
								body="A client is the company the work is for. Adding one is the first step: engagements, requests and missions all hang off a client, and nothing can be delivered until one exists."
								className="px-0"
								title="No clients yet"
							/>
						}
						error={({ error, retry }) => {
							const shown = describeFailure(error.message);
							return (
								<ErrorState
									body={shown.body}
									className="px-0"
									code={error.message}
									retry={shown.canRetry ? retry : undefined}
									title={shown.title}
								/>
							);
						}}
						isEmpty={(d) => d.data.length === 0}
						loading={<SkeletonRows count={6} />}
						query={query}
					>
						{(data) => (
							<div className="flex flex-col gap-2">
								{/*
								 * A real `<fieldset>` rather than `role="group"`. The native
								 * element carries the grouping without an ARIA attribute
								 * standing in for it, and the legend names the group before the
								 * options are read.
								 */}
								<fieldset
									className="flex flex-wrap items-center gap-1 border-0 p-0"
									data-testid="clients-status-filter"
								>
									<legend className="sr-only">Filter by status</legend>
									{STATUS_FILTERS.map((option) => (
										<button
											aria-pressed={status === option}
											className={
												status === option
													? "interactive rounded-full bg-app-raised px-2.5 py-0.5 text-micro text-text"
													: "interactive rounded-full px-2.5 py-0.5 text-micro text-text-subtle"
											}
											data-testid={`clients-filter-${option}`}
											key={option}
											onClick={() => setStatus(option)}
											type="button"
										>
											{option}
										</button>
									))}
								</fieldset>

								{visible.length === 0 ? (
									<EmptyState
										action={
											<Button
												data-testid="clients-filter-clear"
												onClick={() => setStatus("all")}
												variant="secondary"
											>
												Show all clients
											</Button>
										}
										body={`No client has the status "${status}". The filter is hiding ${data.data.length} ${data.data.length === 1 ? "client" : "clients"}.`}
										className="px-0"
										title="Nothing matches this filter"
									/>
								) : (
									<table
										className="w-full border-collapse"
										data-testid="clients-table"
									>
										<thead>
											<tr>
												{(selectedId === undefined
													? COLUMNS
													: COMPACT_COLUMNS
												).map((col) => (
													<HeaderCell
														active={sortKey === col.key}
														dir={sortDir}
														key={col.key}
														label={col.label}
														onClick={() => toggleSort(col.key)}
													/>
												))}
											</tr>
										</thead>
										<tbody data-testid="clients-rows">
											{visible.map((client) => {
												const selected = client.id === selectedId;
												return (
													<tr
														// The selected row is marked by SURFACE, not by a
														// line, and `aria-current` carries the same fact to
														// anyone who cannot see the surface.
														aria-current={selected ? "true" : undefined}
														className={cn("group", selected && "bg-app-raised")}
														data-selected={selected}
														data-testid="client-row"
														key={client.id}
													>
														<td className={CELL}>
															{/*
															 * The link is the cell, stretched to the row, so
															 * the whole row is the target. The mission list
															 * settled this: "a link the width of a word is a
															 * link you miss with a thumb".
															 */}
															<Link
																className="block rounded-sm text-sm text-text"
																data-testid="client-row-link"
																params={{ clientId: client.id }}
																to="/clients/$clientId"
															>
																{client.name}
															</Link>
														</td>
														{/*
														 * THE FIVE BROWSING CELLS, hidden together with their
														 * headers when the pane is a switcher. A `<td>` left
														 * behind here would shift every remaining cell one
														 * column left of its heading, which is a table that
														 * reads as data rather than as broken.
														 */}
														{selectedId !== undefined ? null : (
															<>
																<td
																	className={cn(
																		CELL,
																		"text-micro text-text-subtle",
																	)}
																>
																	{/*
																	 * An em dash, not blank. Blank reads as a
																	 * rendering fault; the dash says the field is
																	 * empty on purpose.
																	 */}
																	{client.primaryContact ?? "—"}
																</td>
																<td className={CELL}>
																	<StatusBadge
																		data-testid="client-status"
																		tone={CLIENT_STATUS_TONE[client.status]}
																	>
																		{client.status}
																	</StatusBadge>
																</td>
																<td
																	className={cn(
																		CELL,
																		"text-micro tabular-nums",
																	)}
																	data-testid="client-requests"
																>
																	<Count n={client.openRequests} />
																</td>
																<td
																	className={cn(
																		CELL,
																		"text-micro tabular-nums",
																	)}
																	data-testid="client-missions"
																>
																	<Count n={client.activeMissions} />
																</td>
															</>
														)}
														{/*
														 * THE COLUMN THE RULING ASKED FOR. A client with
														 * blocked work has to look different before it is
														 * clicked, so this is the one number that carries a
														 * tone rather than sitting muted with the others.
														 */}
														<td
															className={cn(CELL, "text-micro tabular-nums")}
															data-testid="client-blocked"
														>
															{client.openBlockers > 0 ? (
																<StatusBadge
																	data-testid="client-blocked-badge"
																	tone="warn"
																>
																	{client.openBlockers}
																</StatusBadge>
															) : (
																<Count n={0} />
															)}
														</td>
														{selectedId !== undefined ? null : (
															<td
																className={cn(
																	CELL,
																	"text-micro text-text-subtle",
																)}
																data-testid="client-last-activity"
															>
																{client.lastActivityAt
																	? new Date(
																			client.lastActivityAt,
																		).toLocaleDateString()
																	: "—"}
															</td>
														)}
													</tr>
												);
											})}
										</tbody>
									</table>
								)}

								{/*
								 * The footer aggregate the reference carries. It counts what is
								 * SHOWN and says so when a filter is narrowing it — a total that
								 * silently means "of the ones you can see" is a number that
								 * disagrees with the nav badge later.
								 */}
								<p
									className="text-micro text-text-subtle"
									data-testid="clients-total"
								>
									{status === "all"
										? `Total: ${data.data.length} ${data.data.length === 1 ? "client" : "clients"}`
										: `Showing ${visible.length} of ${data.data.length} clients`}
								</p>
							</div>
						)}
					</Surface>
				)}
			</section>

			{/*
			 * The third pane, and it does not exist until a client is selected.
			 *
			 * Separated by tone and gap rather than a rule, per the operator's
			 * "every divider removed", and it scrolls independently so the table
			 * stays put while nine sections move past it.
			 *
			 * There is no index route behind this any more. `clients.index.tsx` was
			 * a "No client selected" placeholder and the operator called the pane
			 * itself the waste, not just its emptiness — so the pane goes rather
			 * than getting smaller, and the table takes the width it was holding.
			 */}
			{selectedId === undefined ? null : (
				<section
					aria-label="Client detail"
					className="min-w-0 flex-1 overflow-y-auto rounded-md bg-app-panel"
					data-testid="clients-detail-pane"
				>
					<Outlet />
				</section>
			)}
		</div>
	);
}
