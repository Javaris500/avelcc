import type { StatusBadgeProps } from "#/ui/badge";

/**
 * Domain status to tone. One mapping, in one place.
 *
 * `src/ui/badge.tsx` already owns the TONES — the fill/soft/line triples, the
 * distinct glyph per tone, and the rule that "icons never carry meaning alone".
 * What did not exist anywhere is the decision that a revoked connection is
 * `block` and a proposed request is `pending`. That decision is domain
 * knowledge, not presentation, so it lives here and the badge stays
 * presentational.
 *
 * Declared per vocabulary rather than as one `Record<string, Tone>`, because
 * the vocabularies genuinely differ: `active` means a healthy client and a
 * healthy connection, but `closed` is a normal ending for an engagement and
 * `revoked` is a fault on a connection. Flattening them into one map would
 * force those two to share a tone.
 */

type Tone = NonNullable<StatusBadgeProps["tone"]>;

/**
 * `active` is deliberately `neutral`, not `pass`.
 *
 * Green means a check passed. A client being open for business is the ordinary
 * case, and toning every row green spends the one colour that should mean
 * something on the state that means nothing. `closed` is `stale` rather than
 * `block` for the same reason: it is a normal ending, not a failure.
 */
export const CLIENT_STATUS_TONE: Record<"active" | "closed", Tone> = {
	active: "neutral",
	closed: "stale",
};

/** Same vocabulary, same reasoning, and closing one is a lifecycle step. */
export const ENGAGEMENT_STATUS_TONE: Record<"active" | "closed", Tone> = {
	active: "neutral",
	closed: "stale",
};

/**
 * The request lifecycle, from `contract/intake.ts`.
 *
 * `proposed` is the only one that is `warn`-toned, and that is the point of the
 * whole section: a proposed request is the one state on this page that is
 * waiting on the operator to do something. `draft` is Canon still working.
 * `approved` passed and became a mission. `rejected` is a decision that was
 * made, not a failure that occurred — `stale`, never `block`, because nothing
 * went wrong when an operator said no.
 */
export const REQUEST_STATUS_TONE: Record<
	"draft" | "proposed" | "approved" | "rejected",
	Tone
> = {
	draft: "pending",
	proposed: "warn",
	approved: "pass",
	rejected: "stale",
};

/**
 * Connection health. `revoked` and `expired` both mean a delivery into this
 * repository will fail, which is why the repositories section shows them at
 * all.
 */
export const CONNECTION_STATUS_TONE: Record<
	"active" | "expired" | "revoked",
	Tone
> = {
	active: "pass",
	expired: "warn",
	revoked: "block",
};

/**
 * The nine export states from `contract/export.ts`.
 *
 * `done` IS THE ONLY ONE THAT GETS A TICK, and that is a decision about where
 * this map is read. The client page renders it in a section headed "Deliveries
 * — what actually shipped", so the tone answers "did this ship" and nothing
 * else.
 *
 * `previewed` is therefore `neutral`, not `pass`. A dry run is a real Export
 * row that is terminal at `previewed`, so it finished successfully — but it
 * finished WITHOUT DELIVERING, and a green tick beside it in a list of
 * deliveries says the opposite. Seen on screen against real data: six exports
 * rendered, three of them previews, and all six carried a tick.
 *
 * `pr-open` is `pending` rather than `warn` for the same reason read the other
 * way. An open pull request is the normal successful outcome of a GitHub
 * delivery and is waiting on a human to merge it. A warning glyph would report
 * the process working as a problem.
 */
export const DELIVERY_STATUS_TONE: Record<string, Tone> = {
	pending: "pending",
	rendering: "pending",
	verifying: "pending",
	previewing: "pending",
	previewed: "neutral",
	delivering: "pending",
	"pr-open": "pending",
	done: "pass",
	failed: "block",
};

/**
 * MISSION STATUS HAS NO TONE, AND THAT IS NOT AN OMISSION.
 *
 * `missions.status` is `text` with no vocabulary declared anywhere, and
 * `schema.ts` is explicit that "zero missions have run; any enum written today
 * would be a guess about states nobody has observed". `missions.index.tsx`
 * already renders it as a mono `Tag` rather than a coloured badge, on the
 * stated grounds that "a green 'draft' would be this screen inventing the
 * lifecycle the contract deliberately refuses to declare".
 *
 * This function exists so that reasoning is reachable from the client page
 * rather than rediscovered, and so nobody adds the map later without meeting
 * the argument against it. It always returns null. When the lifecycle is real,
 * this is the one place that changes.
 */
export function missionStatusTone(_status: string): Tone | null {
	return null;
}

/**
 * THE BLOCKED SIGNAL, in two scopes. UI-PLAN section 5: "a client with a
 * blocked mission should look different in the list, before you click."
 *
 * Deliberately NOT derived from `missions.status`. A blocker is its own table
 * with its own `blocker_status` enum, so "is this blocked" is a real question
 * with a real answer, and answering it by string-matching a mission status
 * column that has no vocabulary would be a guess dressed as a signal.
 *
 * The count is a server-side anti-join over unclosed blockers: closure is a NEW
 * ROW referencing the old one, so a blocker's own `status` column records only
 * what was true when it was written. Both counts were silently zero until the
 * telemetry tables had rows, because an empty table makes a working query and a
 * broken one give the same answer.
 */

/**
 * A MISSION with open blockers IS blocked. Work on it cannot proceed until
 * something is resolved, so this is a hard state and it gets the hard tone.
 * `block` carries the ✕ glyph, which is the right claim about a mission.
 */
export function missionBlockedTone(openBlockers: number): Tone {
	return openBlockers > 0 ? "block" : "neutral";
}

/**
 * A CLIENT with blocked missions is NOT itself blocked, and this is the
 * distinction that took two screens and a hardcoded literal to surface.
 *
 * Both call sites were reaching for one `blockedTone`, and the argument that
 * settled it is that they are asking different questions about different
 * entities. "This mission cannot proceed" is a fact about the mission. "One of
 * this client's missions cannot proceed" is a rollup, and nothing about the
 * client is broken — there is still work to look at, deliveries to read and a
 * brief to write.
 *
 * So it is `warn`, and the ⚠ against ✕ is the difference being said out loud.
 * Clicking a warned client through to a blocked mission is not a contradiction;
 * it is a summary resolving into the specific thing it was summarising.
 *
 * TWO REASONS BEYOND THE SEMANTICS. `block` is the GATE vocabulary — in this
 * product a block is a mandatory gate refusing a delivery — and a client is not
 * a gate. And in a list of clients, red spent on a rollup is red unavailable for
 * the thing that actually failed; the loudest colour on the screen should mean
 * the most specific thing, not the broadest.
 *
 * This is NOT the two-mappings failure the seam exists to prevent. That is one
 * state getting two colours in two files. This is two states, distinguished
 * once, here.
 */
export function clientBlockedTone(openBlockers: number): Tone {
	return openBlockers > 0 ? "warn" : "neutral";
}
