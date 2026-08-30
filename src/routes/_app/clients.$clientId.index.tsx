import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { z } from "zod";

import { clientDetail, clientSchema } from "#/contract/client";
import { success } from "#/contract/shared/envelope";
import {
	DefinitionListShell,
	SectionRailShell,
	SectionShell,
} from "#/modules/client/ui/scaffold";
import { SECTIONS } from "#/modules/client/ui/sections";
import {
	blockedTone,
	CLIENT_STATUS_TONE,
	CONNECTION_STATUS_TONE,
	DELIVERY_STATUS_TONE,
	ENGAGEMENT_STATUS_TONE,
} from "#/modules/client/ui/status";
import { usePageHeader } from "#/modules/shell/use-page-header";
import { StatusBadge, Tag } from "#/ui/badge";
import { Button } from "#/ui/button";
import { SkeletonRows } from "#/ui/skeleton";
import { EmptyState, ErrorState } from "#/ui/states";
import { Surface } from "#/ui/surface";

/**
 * Client detail. New route — UI-PLAN section 5 records that none existed.
 *
 * ONE SCROLLING PAGE, NOT TABS. Decision 3 in UI-PLAN's table, and the reason
 * is worth keeping in view: tabs hide state, and hidden state is the failure
 * mode to design against for an operator who is not technical. A tab they never
 * open is a blocked mission they never see.
 *
 * EVERY SECTION RENDERS, INCLUDING THE EMPTY ONES. "An absent section looks the
 * same as one you scrolled past." And an empty one says WHY it is empty, per
 * section 12 rule 4, in words about the work rather than about the schema.
 *
 * TWO READS. `client.get` for who they are; `client.detail` for everything that
 * happened, in ONE round trip rather than nine — the sections are read-only in
 * the first cut, so nothing invalidates independently and a request per section
 * would be nine waterfalls on the page whose whole purpose is answering the
 * question immediately.
 */
export const Route = createFileRoute("/_app/clients/$clientId/")({
	staticData: { device: "construction" as const },
	component: ClientDetail,
});

const clientResponse = success(clientSchema);
const detailResponse = success(clientDetail);
type ClientResponse = z.infer<typeof clientResponse>;
type DetailResponse = z.infer<typeof detailResponse>;
type Detail = DetailResponse["data"];

const SHAPE_MISMATCH = "SHAPE_MISMATCH";
const httpFailure = (status: number) => `HTTP_${status}`;

async function fetchParsed<T>(
	url: string,
	schema: { safeParse: (v: unknown) => { success: boolean; data?: T } },
): Promise<T> {
	const res = await fetch(url);
	const body = await res.json().catch(() => null);

	// Codes are the contract; messages change freely. Nothing here parses one.
	if (body?.success === false) throw new Error(body.error.code);
	if (!res.ok || body === null) throw new Error(httpFailure(res.status));

	const parsed = schema.safeParse(body);
	if (!parsed.success || parsed.data === undefined) {
		throw new Error(SHAPE_MISMATCH);
	}
	return parsed.data;
}

/**
 * `client.get` and `client.detail` both declare 200 and 404. NOT_FOUND is the
 * case this screen exists to handle well: a client id in a URL that no longer
 * resolves is the likeliest way an operator arrives here in a failed state,
 * because a soft-deleted client is filtered from every read while its links
 * stay in everyone's history.
 */
function describeFailure(code: string): {
	title: string;
	body: string;
	canRetry: boolean;
} {
	switch (code) {
		case "NOT_FOUND":
			return {
				title: "There is no client at this address.",
				body: "It may have been deleted, or the link may be wrong. Nothing was loaded.",
				canRetry: false,
			};
		case SHAPE_MISMATCH:
			return {
				title: "The client could not be read.",
				body: "The endpoint answered, but the body did not match the client contract. The screen and the route have drifted apart, and rendering it anyway would be a guess.",
				canRetry: false,
			};
		default:
			return {
				title: "The client could not be read.",
				body: "The request did not complete, so nothing was loaded. This screen only reads, so nothing was written either.",
				canRetry: true,
			};
	}
}

/**
 * A date in the operator's locale, not an ISO string.
 *
 * `createdAt` is row-insert time and is labelled "Added", never "Client since".
 * They are different claims, and the mission list already refuses the same
 * substitution: "never substitute updatedAt, which is row-edit time and not
 * audited activity".
 */
function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

/** One row in a section list. Shared so nine sections do not each invent one. */
function Row({
	children,
	testId,
}: {
	children: React.ReactNode;
	testId: string;
}) {
	return (
		<li
			className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-1.5"
			data-testid={testId}
		>
			{children}
		</li>
	);
}

function Name({ children }: { children: React.ReactNode }) {
	return <span className="text-sm text-text">{children}</span>;
}

function Meta({ children }: { children: React.ReactNode }) {
	return <span className="text-micro text-text-subtle">{children}</span>;
}

/**
 * THE MASTHEAD METRICS.
 *
 * `metrics: null` IS NOT four zeroes, and the two render differently because
 * they are different facts. Null means the client has no engagement, so there
 * is nowhere for a mission to live and counting them would measure something
 * that cannot exist. Zeroes mean engagements exist and nothing has happened in
 * them yet. Only one of those is a prompt to act, and collapsing them would
 * make "nothing can be here" look like "nothing is here yet".
 *
 * `MetricStat` is avel-71's and has not landed; this is the plain version, and
 * the four figures are the plan's four: missions, blocked, deliveries, spend.
 */
function Metrics({ metrics }: { metrics: Detail["metrics"] }) {
	if (metrics === null) {
		return (
			<p
				className="text-sm text-text-muted"
				data-testid="client-metrics-unavailable"
			>
				No engagement yet, so there are no numbers to show. Missions, deliveries
				and cost all attach to an engagement, which means nothing can exist for
				this client until one does. This is not the same as zero.
			</p>
		);
	}

	const stats: { label: string; value: string; blocked?: boolean }[] = [
		{ label: "Missions", value: String(metrics.missions) },
		{
			label: "Blocked",
			value: String(metrics.blockedMissions),
			blocked: metrics.blockedMissions > 0,
		},
		{ label: "Deliveries", value: String(metrics.deliveries) },
		{
			/*
			 * A decimal STRING on the wire, never a number, because money does not
			 * round-trip as a float. Rendered verbatim rather than reformatted: a
			 * currency formatter here would parse it back to a float and undo the
			 * exact thing the string type is protecting.
			 *
			 * NULL READS AS "NOT LOGGED", NOT AS AN EM DASH. The dash was
			 * ambiguous between "nothing spent", "not yet entered" and "we do not
			 * know" — and here it is the third. Mission 001's cost row exists with
			 * every measure null: no model, no tokens, no usd. That row is the
			 * corpus deliberately recording that slice 0's spend is permanently
			 * unrecoverable, so a dash that reads as "coming soon" would quietly
			 * promise a number nobody can ever supply.
			 */
			label: "Spend",
			value: metrics.spendUsd === null ? "Not logged" : `$${metrics.spendUsd}`,
		},
	];

	return (
		<dl className="flex flex-wrap gap-6" data-testid="client-metrics">
			{stats.map((s) => (
				<div className="flex flex-col gap-0.5" key={s.label}>
					<dt className="text-micro text-text-subtle uppercase">{s.label}</dt>
					<dd
						className={
							s.blocked
								? "font-display text-lg font-semibold text-gate-block"
								: "font-display text-lg font-semibold text-text"
						}
						data-testid={`client-metric-${s.label.toLowerCase()}`}
					>
						{s.value}
					</dd>
				</div>
			))}
		</dl>
	);
}

function ClientDetail() {
	const { clientId } = Route.useParams();

	const client = useQuery<ClientResponse>({
		queryKey: ["client", clientId],
		queryFn: () => fetchParsed(`/api/clients/${clientId}`, clientResponse),
		retry: false,
	});

	const detail = useQuery<DetailResponse>({
		queryKey: ["client-detail", clientId],
		queryFn: () =>
			fetchParsed(`/api/clients/${clientId}/detail`, detailResponse),
		// Nothing to detail if the client itself did not resolve.
		enabled: client.isSuccess,
		retry: false,
	});

	/**
	 * THE ROUTE CLAIMS THE HEADER, so the shell renders "Clients > CounselOS"
	 * rather than a nav-derived "Clients". This is what makes the breadcrumb earn
	 * its line — until the title differed from its parent the breadcrumb
	 * suppressed itself, because repeating one word twice is not a trail.
	 *
	 * Called HERE, at the top level, and not inside the `Surface` render prop
	 * below. That prop is a function React calls conditionally, so a hook in it
	 * would run on some renders and not others. `undefined` while loading is the
	 * honest value and the header shows nothing rather than a placeholder name.
	 */
	const c = client.data?.data;
	const d = detail.data?.data;

	usePageHeader({
		title: c?.name,
		/*
		 * Section 2: "One line of orienting context. Counts, status, last
		 * activity." Built only from what has actually loaded — a subtitle
		 * asserting "0 engagements" while the detail read is still in flight
		 * would be wrong for the length of the request and right afterwards,
		 * which is the worst kind of wrong to debug.
		 */
		subtitle:
			c === undefined
				? undefined
				: d === undefined
					? c.status
					: [
							c.status,
							`${d.engagements.length} ${d.engagements.length === 1 ? "engagement" : "engagements"}`,
							`${d.openRequests} open ${d.openRequests === 1 ? "request" : "requests"}`,
							...(d.metrics && d.metrics.blockedMissions > 0
								? [
										`${d.metrics.blockedMissions} blocked ${d.metrics.blockedMissions === 1 ? "mission" : "missions"}`,
									]
								: []),
						].join(" · "),
	});

	return (
		<div className="flex flex-col gap-4 px-6 py-5">
			<Surface
				empty={
					/*
					 * Unreachable in practice: `client.get` answers 404 rather than an
					 * empty success. Supplied because `Surface` requires all four states,
					 * and required precisely so this case cannot be skipped.
					 */
					<ErrorState
						body="The request succeeded but carried no client. Nothing was loaded."
						code="EMPTY_RESPONSE"
						title="There is no client at this address."
					/>
				}
				error={({ error, retry }) => {
					const shown = describeFailure(error.message);
					return (
						<ErrorState
							action={
								<Link
									className="text-sm text-accent-text hover:text-accent-hover"
									data-testid="client-back-link"
									to="/clients"
								>
									Back to clients
								</Link>
							}
							body={shown.body}
							code={error.message}
							retry={shown.canRetry ? retry : undefined}
							title={shown.title}
						/>
					);
				}}
				isEmpty={(d) => d.data === null}
				loading={<SkeletonRows count={6} />}
				query={client}
			>
				{(data) => {
					const c = data.data;
					const d = detail.data?.data;

					/**
					 * THE PRIMARY ACTION, AND WHY IT IS STILL DISABLED.
					 *
					 * A request attaches to an ENGAGEMENT: `intakes.engagement_id` is
					 * not-null and `POST /intakes` requires it. avel-96 has ruled that
					 * `New request` opens an engagement picker — preselected at one,
					 * chosen at several, offering to create one at zero. That picker is
					 * not built, so the button stays disabled with the reason beside it
					 * rather than opening nothing.
					 *
					 * The reason is written from what the operator can see, and it
					 * changes with the count: "no engagement" is a different problem
					 * from "several, and this button cannot know which".
					 */
					const engagementCount = d?.engagements.length;
					const requestReason = detail.isError
						? "Disabled: this client's engagements could not be read, so there is nothing to attach a request to."
						: engagementCount === undefined
							? "Disabled: the engagements for this client have not loaded."
							: engagementCount === 0
								? "Disabled: a request belongs to an engagement, and this client has none yet."
								: "Disabled: choosing which engagement the request belongs to is not built yet.";

					return (
						<>
							{/*
							 * The panel header. NO BREADCRUMB: under the three-pane ruling
							 * the clients table is on screen to the left with this client's
							 * row marked selected, so `Clients >` would link back to
							 * something already visible. UI-PLAN section 2 says a breadcrumb
							 * earns its place "only where nesting is real", and beside its
							 * own list it is not.
							 *
							 * Module actions — New request and Share — sit here, left of the
							 * shell's core actions.
							 */}
							<div className="flex flex-wrap items-center gap-3">
								{/*
								 * NO TITLE HERE. The route claims the header above, which
								 * now carries the client's name as the page's only h1 — so
								 * printing it again would be the duplicate this page had
								 * before, moved rather than removed. The status stays,
								 * because the header's subtitle carries it as a word and the
								 * chip carries it as a tone.
								 */}
								<StatusBadge
									data-testid="client-status"
									tone={CLIENT_STATUS_TONE[c.status]}
								>
									{c.status}
								</StatusBadge>
								<div className="flex flex-wrap items-center gap-2 sm:ml-auto">
									<Button
										data-testid="client-new-request"
										disabled
										title={requestReason}
										variant="primary"
									>
										New request
									</Button>
									{/*
									 * SHARE IS DISABLED AND WILL STAY THAT WAY FOR A WHILE.
									 * This product is explicitly single-operator — UI-PLAN
									 * section 12: "No sharing, no permissions, no collaboration
									 * affordances" — so there is nobody to share with and no
									 * permission model to share under. Rendered because the
									 * ruling names it a module action; disabled because nothing
									 * behind it exists.
									 */}
									<Button
										data-testid="client-share"
										disabled
										title="Sharing is not built. AVEL is single-operator today, so there is nobody to share with yet."
										variant="secondary"
									>
										Share
									</Button>
								</div>
							</div>
							{/*
							 * The reason the primary is disabled, in full. It is on the
							 * button's `title` too, but a tooltip is not an answer on its
							 * own — this is the one control on the page an operator will
							 * actually try to press.
							 */}
							<p
								className="text-sm text-text-subtle"
								data-testid="client-new-request-reason"
							>
								{requestReason}
							</p>

							{/*
							 * The rail is sticky and the page scrolls past it. On a narrow
							 * screen it stacks above the content rather than being hidden:
							 * losing it on a phone would leave section 9 reachable only by
							 * scrolling through eight.
							 */}
							{/*
							 * NOT RENDERED WHEN THE SECTIONS FAILED TO LOAD. Every rail
							 * item is an anchor to a section id, and when the detail read
							 * errors those sections are replaced by a single error state —
							 * so all ten links point at elements that are not on the page
							 * and do nothing at all when clicked. Ten dead links is the
							 * failure UI-PLAN section 12 rule 6 names, arrived at by
							 * accident rather than by design, which is how it is likeliest
							 * to ship.
							 */}
							<div className="flex flex-col gap-4 md:flex-row md:items-start">
								{detail.isError ? null : (
									<SectionRailShell
										className="md:sticky md:top-4 md:w-40 md:shrink-0"
										items={SECTIONS.map((s) => ({
											id: s.id,
											label: s.railLabel,
										}))}
									/>
								)}

								{/*
								 * No extra `HeadingLevel` here. The shell header owns the h1
								 * and the panel prints no title of its own, so the section
								 * headings are already the first level beneath it. Wrapping
								 * would push all nine a level deeper than the structure they
								 * actually have.
								 */}
								<div className="flex min-w-0 flex-1 flex-col gap-4">
									<Sections client={c} detail={detail} />
								</div>
							</div>
						</>
					);
				}}
			</Surface>
		</div>
	);
}

/**
 * The nine sections plus the masthead.
 *
 * Split out so the detail query gets its own `Surface` rather than being
 * `data?.thing` at forty call sites. The client identity has already resolved
 * by the time this renders, so a failure here degrades the sections and leaves
 * the name, status and notes on screen — a client whose history cannot be read
 * is still a client you can look at.
 */
function Sections({
	client,
	detail,
}: {
	client: z.infer<typeof clientSchema>;
	detail: ReturnType<typeof useQuery<DetailResponse>>;
}) {
	const section = (id: string) => {
		const found = SECTIONS.find((s) => s.id === id);
		// Not reachable: every id below is a literal from SECTIONS. Thrown rather
		// than defaulted so a renamed anchor fails loudly instead of rendering a
		// section with no heading.
		if (!found) throw new Error(`Unknown client section: ${id}`);
		return found;
	};

	const overview = section("overview");

	return (
		<Surface
			empty={
				<p className="text-sm text-text-subtle">
					The detail read returned nothing.
				</p>
			}
			error={({ error, retry }) => (
				<ErrorState
					body="The client is readable but its history is not, so the sections below are missing rather than empty. Nothing was written."
					code={error.message}
					retry={retry}
					title="This client's work could not be read."
				/>
			)}
			isEmpty={(d) => d.data === null}
			loading={<SkeletonRows count={8} />}
			query={detail}
		>
			{(res) => {
				const d = res.data;

				/** Populated when there are rows, empty when the read says there are none. */
				const stateOf = (n: number) =>
					n === 0 ? ("empty" as const) : ("populated" as const);

				return (
					<>
						{/* ── masthead ─────────────────────────────────────────── */}
						<SectionShell
							blurb={overview.blurb}
							id={overview.id}
							n={overview.n}
							state="populated"
							title={overview.title}
						>
							<div className="flex flex-col gap-4">
								<Metrics metrics={d.metrics} />
								<DefinitionListShell
									items={[
										{
											label: "Primary contact",
											value: client.primaryContact,
										},
										{ label: "Status", value: client.status },
										{
											label: "Added",
											value: formatDate(client.createdAt),
										},
										{
											label: "Last activity",
											value:
												d.lastActivityAt === null
													? "Nothing recorded"
													: formatDate(d.lastActivityAt),
										},
									]}
									testId="client-facts"
								/>
								{/*
								 * Rendered as plain text, NOT as markdown. `notes_md` is
								 * markdown by name and nothing in this app renders markdown
								 * yet, so piping it through a renderer that does not exist
								 * would be inventing a capability. `whitespace-pre-wrap` at
								 * least keeps the author's line breaks.
								 */}
								{client.notesMd === null ? (
									<p
										className="text-sm text-text-subtle"
										data-testid="client-notes-empty"
									>
										No notes. Notes are where you record who these people are
										and how the relationship works.
									</p>
								) : (
									<p
										className="max-w-[68ch] text-sm leading-relaxed whitespace-pre-wrap text-text-muted"
										data-testid="client-notes"
									>
										{client.notesMd}
									</p>
								)}
							</div>
						</SectionShell>

						{/* ── 1 · requests ─────────────────────────────────────── */}
						{/*
						 * PARTIALLY BUILT, and split rather than called one or the other.
						 * `clientDetail` carries `openRequests` as a COUNT and no rows, and
						 * there is no intake list endpoint yet, so the page can say how
						 * many are waiting but cannot name one or link to its review. The
						 * count is real and is shown; the list says what is missing.
						 */}
						<SectionShell
							blurb={section("requests").blurb}
							count={d.openRequests}
							id="requests"
							n={1}
							state={d.openRequests === 0 ? "empty" : "populated"}
							title="Requests"
						>
							{d.openRequests === 0 ? (
								<EmptyState
									body={section("requests").emptyBody}
									className="px-0 py-4"
									title="No open requests"
								/>
							) : (
								<p
									className="text-sm text-text-subtle"
									data-testid="requests-rows-not-built"
								>
									{d.openRequests}{" "}
									{d.openRequests === 1 ? "request is" : "requests are"} waiting
									on a decision. Listing them needs the intake read, which is
									not built — so the count is real and the rows are not shown
									rather than guessed.
								</p>
							)}
						</SectionShell>

						{/* ── 2 · engagements ──────────────────────────────────── */}
						<SectionShell
							blurb={section("engagements").blurb}
							count={d.engagements.length}
							id="engagements"
							n={2}
							state={stateOf(d.engagements.length)}
							title="Engagements"
						>
							{d.engagements.length === 0 ? (
								<EmptyState
									body={section("engagements").emptyBody}
									className="px-0 py-4"
									title="No engagements"
								/>
							) : (
								<ul data-testid="client-engagements">
									{d.engagements.map((e) => (
										<Row key={e.id} testId="engagement-row">
											<Name>{e.name}</Name>
											<StatusBadge
												data-testid="engagement-status"
												tone={ENGAGEMENT_STATUS_TONE[e.status]}
											>
												{e.status}
											</StatusBadge>
											<Meta>
												{e.missionCount}{" "}
												{e.missionCount === 1 ? "mission" : "missions"}
											</Meta>
											<Meta>started {formatDate(e.startedAt)}</Meta>
										</Row>
									))}
								</ul>
							)}
						</SectionShell>

						{/* ── 3 · missions ─────────────────────────────────────── */}
						<SectionShell
							blurb={section("missions").blurb}
							count={d.missions.length}
							id="missions"
							n={3}
							state={stateOf(d.missions.length)}
							title="Missions"
						>
							{d.missions.length === 0 ? (
								<EmptyState
									body={section("missions").emptyBody}
									className="px-0 py-4"
									title="No missions"
								/>
							) : (
								<ul data-testid="client-missions">
									{d.missions.map((m) => (
										<Row key={m.id} testId="mission-row">
											<Link
												className="interactive rounded-sm text-sm text-text"
												data-testid="mission-link"
												params={{ missionId: m.id }}
												to="/missions/$missionId"
											>
												{/*
												 * A null title reads as unnamed and is deliberately
												 * not bold. Blank looks like a rendering fault, and
												 * "Untitled" would be a name the schema never gave
												 * it.
												 */}
												{m.title ?? "Unnamed mission"}
											</Link>
											{/*
											 * A mono Tag, NOT a coloured badge. `missions.status` is
											 * text with no vocabulary declared anywhere, so there is
											 * no state to map a tone onto and a green "draft" would
											 * invent the lifecycle the contract refuses to declare.
											 * `missionStatusTone` in status.ts holds the argument.
											 */}
											<Tag data-testid="mission-status">{m.status}</Tag>
											<Meta>sprint {m.sprintN}</Meta>
											{m.cut === null ? null : <Meta>{m.cut}</Meta>}
											{/*
											 * THE BLOCKED SIGNAL. Rendered only when there is one —
											 * a permanent "0 blockers" chip on every row would make
											 * the one row that matters no louder than the rest.
											 */}
											{m.openBlockers === 0 ? null : (
												<StatusBadge
													className="sm:ml-auto"
													data-testid="mission-blocked"
													tone={blockedTone(m.openBlockers)}
												>
													{m.openBlockers}{" "}
													{m.openBlockers === 1 ? "blocker" : "blockers"}
												</StatusBadge>
											)}
										</Row>
									))}
								</ul>
							)}
						</SectionShell>

						{/* ── 4 · deliveries ───────────────────────────────────── */}
						<SectionShell
							blurb={section("deliveries").blurb}
							count={d.deliveries.length}
							id="deliveries"
							n={4}
							state={stateOf(d.deliveries.length)}
							title="Deliveries"
						>
							{d.deliveries.length === 0 ? (
								<EmptyState
									body={section("deliveries").emptyBody}
									className="px-0 py-4"
									title="Nothing delivered yet"
								/>
							) : (
								<ul data-testid="client-deliveries">
									{d.deliveries.map((x) => (
										<Row key={x.id} testId="delivery-row">
											<Name>{x.targetKind}</Name>
											<StatusBadge
												data-testid="delivery-status"
												tone={DELIVERY_STATUS_TONE[x.status] ?? "neutral"}
											>
												{x.status}
											</StatusBadge>
											<Meta>{formatDate(x.createdAt)}</Meta>
											{/*
											 * The package hash, truncated for the row. Mono, and
											 * shortened in the display only — the full value stays
											 * in the title so it can still be read and copied.
											 */}
											{x.snapshotSha256 === null ? null : (
												<Tag
													data-testid="delivery-hash"
													title={x.snapshotSha256}
												>
													{x.snapshotSha256.slice(0, 12)}
												</Tag>
											)}
										</Row>
									))}
								</ul>
							)}
						</SectionShell>

						{/* ── 5 · roster ───────────────────────────────────────── */}
						<SectionShell
							blurb={section("roster").blurb}
							count={d.roster.length}
							id="roster"
							n={5}
							state={stateOf(d.roster.length)}
							title="Roster"
						>
							{d.roster.length === 0 ? (
								<EmptyState
									body={section("roster").emptyBody}
									className="px-0 py-4"
									title="No agents yet"
								/>
							) : (
								<ul data-testid="client-roster">
									{d.roster.map((r) => (
										<Row key={r.agentTemplateId} testId="roster-row">
											<Name>{r.name}</Name>
											<Tag data-testid="roster-slug">{r.slug}</Tag>
											<Meta>{r.kind}</Meta>
											<Meta>
												{r.missionCount}{" "}
												{r.missionCount === 1 ? "mission" : "missions"}
											</Meta>
										</Row>
									))}
								</ul>
							)}
						</SectionShell>

						{/* ── 6 · repositories ─────────────────────────────────── */}
						<SectionShell
							blurb={section("repositories").blurb}
							count={d.repositories.length}
							id="repositories"
							n={6}
							state={stateOf(d.repositories.length)}
							title="Repositories"
						>
							{d.repositories.length === 0 ? (
								<EmptyState
									body={section("repositories").emptyBody}
									className="px-0 py-4"
									title="No repositories connected"
								/>
							) : (
								<ul data-testid="client-repositories">
									{d.repositories.map((r) => (
										<Row key={r.id} testId="repository-row">
											<Name>{r.label}</Name>
											<Tag data-testid="repository-scope">
												{r.scopeType}:{r.scopeValue}
											</Tag>
											<StatusBadge
												className="sm:ml-auto"
												data-testid="repository-status"
												tone={CONNECTION_STATUS_TONE[r.status]}
											>
												{r.status}
											</StatusBadge>
										</Row>
									))}
								</ul>
							)}
						</SectionShell>

						{/* ── 7 · brief & documents ────────────────────────────── */}
						{/*
						 * NOT BUILT, and the only section still in that state. A brief
						 * belongs to a mission, and which documents belong to a CLIENT
						 * rather than to one of its missions is not modelled anywhere. An
						 * empty state here would claim there are no documents, which this
						 * page has no way to know.
						 */}
						<SectionShell
							blurb={section("brief").blurb}
							id="brief"
							n={7}
							notBuiltReason="A brief belongs to a mission. Which documents belong to a client, rather than to one of its missions, is not modelled yet — so this cannot say there are none."
							state="not-built"
							title="Brief & documents"
						/>

						{/* ── 8 · cost ─────────────────────────────────────────── */}
						<SectionShell
							blurb={section("cost").blurb}
							count={d.cost.length}
							id="cost"
							n={8}
							state={stateOf(d.cost.length)}
							title="Cost"
						>
							{d.cost.length === 0 ? (
								<EmptyState
									body={section("cost").emptyBody}
									className="px-0 py-4"
									title="No cost recorded"
								/>
							) : (
								<ul data-testid="client-cost">
									{d.cost.map((entry) => (
										<Row key={entry.id} testId="cost-row">
											<Name>{entry.actorRef}</Name>
											<Meta>{entry.actorKind}</Meta>
											{entry.outcome === null ? null : (
												<Meta>{entry.outcome}</Meta>
											)}
											{entry.occurredOn === null ? null : (
												<Meta>{entry.occurredOn}</Meta>
											)}
											{/* Verbatim, for the reason the masthead gives. */}
											<span
												className="font-mono text-sm text-text sm:ml-auto"
												data-testid="cost-usd"
											>
												{entry.usd === null ? "—" : `$${entry.usd}`}
											</span>
										</Row>
									))}
								</ul>
							)}
						</SectionShell>

						{/* ── 9 · activity ─────────────────────────────────────── */}
						{/*
						 * `Timeline` is avel-71's and has not landed; this is the plain
						 * list it replaces. No edit or delete affordance, and that is
						 * structural rather than an omission: the telemetry tables refuse
						 * UPDATE and DELETE by database trigger, so a control offering
						 * either would be a control that cannot work.
						 */}
						<SectionShell
							blurb={section("activity").blurb}
							count={d.activity.length}
							id="activity"
							n={9}
							state={stateOf(d.activity.length)}
							title="Activity"
						>
							{d.activity.length === 0 ? (
								<EmptyState
									body={section("activity").emptyBody}
									className="px-0 py-4"
									title="Nothing has happened yet"
								/>
							) : (
								<ul data-testid="client-activity">
									{d.activity.map((e) => (
										<Row key={`${e.kind}-${e.id}`} testId="activity-row">
											<Tag data-testid="activity-kind">{e.kind}</Tag>
											<Name>{e.label}</Name>
											<Meta>{formatDate(e.at)}</Meta>
										</Row>
									))}
								</ul>
							)}
						</SectionShell>
					</>
				);
			}}
		</Surface>
	);
}
