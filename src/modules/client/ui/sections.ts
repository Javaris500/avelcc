/**
 * The client page's section model.
 *
 * UI-PLAN section 5 rules that client detail is a masthead plus nine sections
 * on ONE SCROLLING PAGE, not tabs, because "hidden state is the failure mode to
 * design against for this operator". The rail needs the same list the page
 * renders, and the two drifting apart is how a rail ends up pointing at an
 * anchor that no longer exists. So the list is data, declared once, and both
 * the rail and the page map over it.
 *
 * COUNT: ten entries below — the masthead plus sections 1 to 9. UI-PLAN
 * section 2 calls this "a ten-section page" and section 5 calls it "nine
 * sections"; both are describing this list, counting the masthead differently.
 * Nine are numbered. `SECTIONS.length` is ten. Neither number is written as a
 * literal anywhere in this module.
 */

/**
 * THREE STATES, NOT TWO.
 *
 * UI-PLAN says "empty sections still render, with a reason. An absent section
 * looks the same as one you scrolled past." That is right, and it is one
 * distinction short.
 *
 *   not-built  no query exists. We do not know whether there is anything here.
 *   empty      a query ran and returned nothing. We know there is nothing here.
 *   populated  there is something here.
 *
 * A section that prints "No deliveries yet" when nothing ever asked the
 * database is a screen inventing a fact. That is the "looks finished but isn't"
 * failure CLAUDE.md is written against, and it is worse than an unbuilt section
 * because it is indistinguishable from a working one.
 *
 * The pre-flight screen already settled this. It renders unbuilt sections as
 * "Not built. <why>" beside real ones, with `data-built={false}`, rather than
 * omitting them — "the operator should see the shape of the decision they will
 * eventually make. They are NOT faked: no invented file counts, no green
 * ticks." This follows that precedent rather than opening a second one.
 */
export type SectionBuildState = "not-built" | "empty" | "populated";

export type ClientSection = {
	/** The anchor. Used as the DOM id and as the rail's href fragment. */
	id: string;
	/** 1 to 9, or null for the masthead, which is not a numbered section. */
	n: number | null;
	/** The section heading. */
	title: string;
	/** The rail's label. Shorter, because the rail is narrow. */
	railLabel: string;
	/**
	 * One plain sentence, shown under the heading.
	 *
	 * UI-PLAN section 12 rule 5: "Name the jargon once, where it is first met.
	 * `roster entry`, `playbook`, `preset` and `cut` each need one plain
	 * sentence at first encounter, on the section header, rather than in a
	 * glossary nobody opens." This is that slot. It is not decoration and it is
	 * not a subtitle to be trimmed for density — for an operator who is not
	 * technical it is the only place these words are ever defined.
	 */
	blurb: string;
	/**
	 * What to say when the query ran and returned nothing.
	 *
	 * UI-PLAN section 12 rule 4: "Empty states say why. 'No requests yet.
	 * Requests are how new work starts' beats 'Nothing here.'" Written per
	 * section because the reason differs — an empty roster and an empty cost
	 * ledger are empty for unrelated reasons, and one shared string would say
	 * nothing true about either.
	 */
	emptyBody: string;
};

/**
 * Order is the page order and the rail order. It is deliberate, not
 * alphabetical: Requests first because an open request is the thing that needs
 * a decision, Activity last because it is the log you consult rather than read.
 *
 * ENGAGEMENTS SITS AT 2 AND IS THE SPINE. `client_id` exists in exactly one
 * place in the schema — `engagements.clientId` — so every section below it is
 * reached through an engagement, and a client with no engagement can hold no
 * work at all. It keeps the plan's position in the running order because that
 * is the reading order, but nothing below it exists without it.
 */
export const SECTIONS: ClientSection[] = [
	{
		id: "overview",
		n: null,
		title: "Overview",
		railLabel: "Overview",
		blurb:
			"Who this client is, and the state of the work in four numbers. Blocked work surfaces here so it is visible without scrolling.",
		emptyBody: "",
	},
	{
		id: "requests",
		n: 1,
		title: "Requests",
		railLabel: "Requests",
		blurb:
			"A request is how new work starts: what was asked, before anyone has agreed to do it. Approving one creates a mission. Nothing is executable until you approve it.",
		emptyBody:
			"No open requests. A request is how new work starts, and approving one is what creates a mission.",
	},
	{
		id: "engagements",
		n: 2,
		title: "Engagements",
		railLabel: "Engagements",
		blurb:
			"An engagement is one body of contracted work. It groups the missions, the repositories and the credentials that belong to it. Closing one revokes its connections.",
		emptyBody:
			"No engagements. This is the one that matters: missions, requests and deliveries all attach to an engagement, so until there is one there is nowhere for work to live.",
	},
	{
		id: "missions",
		n: 3,
		title: "Missions",
		railLabel: "Missions",
		blurb:
			"Every mission for this client, across all of its engagements. A mission is the unit of work that gets dispatched, gated and delivered.",
		emptyBody:
			"No missions yet. A mission comes from approving a request, so that is where one starts.",
	},
	{
		id: "deliveries",
		n: 4,
		title: "Deliveries",
		railLabel: "Deliveries",
		blurb:
			"What actually shipped, and where it went. Target, status and the package hash it went out as.",
		emptyBody:
			"Nothing has shipped yet. A delivery is recorded when a mission is exported to a repository or packaged as a zip.",
	},
	{
		id: "roster",
		n: 5,
		title: "Roster",
		railLabel: "Roster",
		blurb:
			"A roster entry is one agent assigned to one mission. This is which agents have worked this client, and how often.",
		emptyBody:
			"No agents have worked this client. A roster is assigned when a mission is created.",
	},
	{
		id: "repositories",
		n: 6,
		title: "Repositories",
		railLabel: "Repos",
		blurb:
			"The repositories work is delivered into, and whether each credential still resolves. A revoked or expired one will fail the next delivery.",
		emptyBody:
			"No repositories are connected to this client's engagements. Work can still be packaged as a zip, but nothing can be delivered to a repository.",
	},
	{
		id: "brief",
		n: 7,
		title: "Brief & documents",
		railLabel: "Brief",
		blurb:
			"The source material a mission brief is built from. The call notes and documents the work was derived from, kept so the interpretation can be checked against what was actually said.",
		emptyBody: "",
	},
	{
		id: "cost",
		n: 8,
		title: "Cost",
		railLabel: "Cost",
		blurb: "Effort and spend against this client, one row per recorded charge.",
		emptyBody:
			"No cost has been recorded. Entries are written as agents and operators do work against a mission.",
	},
	{
		id: "activity",
		n: 9,
		title: "Activity",
		railLabel: "Activity",
		blurb:
			"Everything that happened, newest first. This is a log: the database refuses to change or delete a row once written, so there is nothing here to edit.",
		emptyBody:
			"Nothing has happened yet. Dispatches, completions, findings and blockers all appear here as they are recorded.",
	},
];

/**
 * Sections 5 to 9 are read-only in the first cut, per UI-PLAN section 5: "That
 * is deliberate. It makes the page answer questions immediately, without
 * waiting on write paths that do not exist."
 *
 * Worth being precise about what that sentence covers, because it reads as a
 * bigger carve-out than it is. Only ONE section on this page has a write path
 * at all — Requests, whose approval materialises a mission. Sections 2, 3 and 4
 * are as read-only as 5 to 9; they are simply not called out. So this is not a
 * split between a writable half and a read-only half. It is one write, in
 * section 1, and nine sections that read.
 */
export const READ_ONLY_IN_FIRST_CUT = SECTIONS.filter(
	(s) => s.n !== null && s.n >= 2,
).map((s) => s.id);
