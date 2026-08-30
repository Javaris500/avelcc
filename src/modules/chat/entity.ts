import type { StatusBadgeProps } from "#/ui/badge";

/**
 * The view model behind `InlineEntityCard`, and the parser that produces one
 * from a tool result.
 *
 * UI-PLAN section 7 calls the card the seam between the chat and the product:
 * "when the agent mentions a mission it must render as the mission." This file
 * is the half of that seam that can be wrong, so it is the half that is tested.
 *
 * PROP-DRIVEN AND CONTRACT-FREE, following `Surface` and `ErrorState`. The card
 * must not learn what a mission is. A tool result is JSON off the wire that a
 * model chose to emit, so parsing it into a narrow shape at the boundary is
 * what stops one malformed row taking down the whole conversation.
 *
 * `status` IS FREE TEXT AND THAT IS DELIBERATE. `contract/mission.ts:51` types
 * mission status as `z.string()` and its own comment records that as a gap
 * rather than a vocabulary. Inventing an enum here would be inventing product
 * state to make a component tidier, so the card takes the label the server
 * gave and a separate `tone` for the colour.
 */

/** Derived from the badge, so the two cannot drift. */
export type EntityTone = NonNullable<StatusBadgeProps["tone"]>;

/**
 * `satisfies` makes this exhaustive at compile time: a seventh tone on the
 * badge fails to build here rather than silently failing to validate.
 */
const TONES = {
	pass: true,
	block: true,
	warn: true,
	pending: true,
	stale: true,
	neutral: true,
} satisfies Record<EntityTone, true>;

/**
 * The three entities the first cut of the read-only tools returns. Adding a
 * fourth is a change here and a case in `hrefFor`, in one commit, so a card can
 * never render a kind it has no route for.
 */
export const ENTITY_KINDS = ["mission", "client", "export"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export type EntityFact = { label: string; value: string };

export type EntityRef = {
	kind: EntityKind;
	id: string;
	title: string;
	/** As the server wrote it. Never mapped, never title-cased. */
	status?: string;
	tone: EntityTone;
	/** Up to three. A card inside a message is a pointer, not a detail view. */
	facts: EntityFact[];
};

const MAX_FACTS = 3;

function str(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() !== ""
		? value.trim()
		: undefined;
}

function isTone(value: unknown): value is EntityTone {
	return typeof value === "string" && value in TONES;
}

function isKind(value: unknown): value is EntityKind {
	return ENTITY_KINDS.includes(value as EntityKind);
}

/**
 * Returns null rather than a placeholder card. A card reading "unknown mission"
 * that links nowhere is the dead-control rule again, because it looks like the
 * seam working. The message falls back to rendering the raw tool result, which
 * at least tells whoever is debugging what actually came back.
 */
export function toEntityRef(value: unknown): EntityRef | null {
	if (typeof value !== "object" || value === null) return null;
	const raw = value as Record<string, unknown>;

	const kind = raw.kind;
	if (!isKind(kind)) return null;

	const id = str(raw.id);
	if (!id) return null;

	const title = str(raw.title) ?? str(raw.name);
	if (!title) return null;

	return {
		kind,
		id,
		title,
		status: str(raw.status),
		// An unrecognised tone becomes neutral rather than reaching the badge,
		// where an unknown cva variant renders as no classes and no background.
		tone: isTone(raw.tone) ? raw.tone : "neutral",
		facts: toFacts(raw.facts),
	};
}

function toFacts(value: unknown): EntityFact[] {
	if (!Array.isArray(value)) return [];
	const facts: EntityFact[] = [];
	for (const entry of value) {
		if (facts.length === MAX_FACTS) break;
		if (typeof entry !== "object" || entry === null) continue;
		const row = entry as Record<string, unknown>;
		const label = str(row.label);
		const factValue = str(row.value);
		if (!label || !factValue) continue;
		facts.push({ label, value: factValue });
	}
	return facts;
}

/**
 * Where the card navigates, or null when there is nowhere to send them.
 * Client detail and delivery detail are UI-PLAN section 5 and are not built, so
 * those kinds render as a static card rather than as a link to a 404. Same
 * reasoning as the nav's `built: false` branch.
 */
export function hrefFor(ref: EntityRef): string | null {
	switch (ref.kind) {
		case "mission":
			return `/missions/${ref.id}`;
		case "client":
		case "export":
			return null;
	}
}

/** Several tool results in one turn may name the same row. Render it once. */
export function dedupeEntities(refs: EntityRef[]): EntityRef[] {
	const seen = new Set<string>();
	return refs.filter((ref) => {
		const key = `${ref.kind}:${ref.id}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/**
 * Everything card-shaped in one tool result.
 *
 * A read-only tool returns one row, a list of rows, or an envelope with an
 * `items` array. All three occur across `src/contract/`, so the message renderer
 * should not have to know which one a given tool chose. Anything that does not
 * parse is dropped here and the raw result is still rendered by the caller, so
 * a shape this does not recognise degrades to visible JSON rather than to
 * nothing.
 */
export function entitiesFromToolOutput(output: unknown): EntityRef[] {
	const single = toEntityRef(output);
	if (single) return [single];

	const rows = Array.isArray(output)
		? output
		: typeof output === "object" &&
				output !== null &&
				Array.isArray((output as { items?: unknown }).items)
			? (output as { items: unknown[] }).items
			: [];

	const refs: EntityRef[] = [];
	for (const row of rows) {
		const ref = toEntityRef(row);
		if (ref) refs.push(ref);
	}
	return dedupeEntities(refs);
}
