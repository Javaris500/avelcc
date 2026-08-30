/**
 * The error code union. Both sides import this; nothing hand-writes a code.
 *
 * "Never parse `message`. Codes are the contract; messages change freely."
 *   — DAY-ONE-FRONTEND.md
 *
 * Seeded from the twelve codes in docs/BLAST-RADIUS.md's error table, plus
 * IDEMPOTENCY_REPLAY and GITHUB_REJECTED — each commented where it is declared.
 *
 * NO COUNT IS WRITTEN DOWN HERE ON PURPOSE. Two rounds of adding a code left
 * stale "twelve codes" prose scattered across the source and the docs, some of
 * it inside the very file being edited. The union is the count; anything that
 * needs one reads it from here.
 */

export const ERROR_CODES = [
	"REPO_NOT_FOUND",
	"REPO_NO_ACCESS",
	"CONNECTION_REVOKED",
	"POLICY_FORBIDS_TARGET",
	"BRANCH_NOT_FOUND",
	"EMPTY_REPOSITORY",
	"TREE_TOO_LARGE",
	"BLAST_RADIUS_VIOLATION",
	"PREVIEW_STALE",
	"PREVIEW_REQUIRED",
	"DETERMINISM_VIOLATION",
	"EXTERNAL_GITHUB",
	/**
	 * Not from BLAST-RADIUS.md's table. Neither is GITHUB_REJECTED below.
	 *
	 * That document's contract sketch names IDEMPOTENCY_REPLAY on `export.create`'s
	 * 409 and the contract copied the line, but the code was never added here — so
	 * the response was typed with an envelope that could not express the one thing
	 * it was declared to say. That is the same defect errors.ts already records
	 * about roster.ts naming PRECONDITION_FAILED in a comment, found a second time
	 * on a route that had not been implemented yet.
	 *
	 * It belongs in THIS union rather than CRUD_CODES: a replayed key on
	 * `export.create` is a statement about a delivery, reaches the pre-flight
	 * screen, and is handled beside PREVIEW_STALE — not about a Command Center
	 * resource, which is what CRUD_CODES scopes.
	 *
	 * Meaning: this idempotency key already produced an Export, and no second
	 * delivery was performed. It is NOT a failure. The original export's id
	 * travels in the envelope's `details`, because an operator's next question is
	 * always "then where is the one that ran?".
	 */
	"IDEMPOTENCY_REPLAY",
	/**
	 * GitHub understood the request and REFUSED it.
	 *
	 * The distinction from EXTERNAL_GITHUB is retryability, and it is the whole
	 * reason this code exists. EXTERNAL_GITHUB means GitHub failed to answer — a
	 * timeout, a rate limit, an outage — so nothing was written and trying again
	 * is the correct move, which is what its copy tells the operator.
	 *
	 * An unprocessable request is the opposite: the same bytes will be refused
	 * identically forever. Routing it through EXTERNAL_GITHUB promised a retry
	 * that could never work, which is worse than having no code at all, because
	 * the operator burns attempts on the advice we gave them.
	 *
	 * The write gateway maps every 422 it can recognise to something specific —
	 * a non-fast-forward becomes PREVIEW_STALE, a missing ref becomes
	 * BRANCH_NOT_FOUND, an existing ref becomes a marker the caller branches on.
	 * This is the fallthrough for the ones it cannot name, and reaching it
	 * usually means AVEL built a request GitHub does not accept: our bug, not
	 * the operator's, which is why it presents as loud.
	 */
	"GITHUB_REJECTED",
	/**
	 * THE LAST RESORT, and the only code here that describes US rather than a
	 * repository, a package or a delivery.
	 *
	 * Every other code names something specific that went wrong out in the
	 * world. This one means a route threw and we do not know why. It exists
	 * because there was no such code at all, so an unhandled failure escaped as
	 * a framework 500 with `unhandled: true` and no envelope — nothing for a
	 * screen to switch on, which is the one guarantee the error contract makes.
	 * Two mission routes were doing exactly that.
	 *
	 * ITS COPY MUST NEVER CARRY SERVER TEXT. An exception message can hold a
	 * connection string, a column name, a row's contents. This is the single
	 * code most likely to be handed a raw error and asked to render it, so the
	 * detail goes to the log and the operator gets a request id to quote. That
	 * is what makes an allowlist the right default for rendering server
	 * messages: a code added later shows curated copy until someone decides its
	 * server text is fit to display, and this one never is.
	 */
	"INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * The six violation codes. Deliberately a SEPARATE union from ErrorCode.
 *
 * BLAST-RADIUS.md: "Gates concern work quality; violations concern writing
 * where you were not permitted." BLAST_RADIUS_VIOLATION is the error; these
 * are what it carries. Collapsing them would let a screen treat a path
 * traversal as an overridable gate failure, and it is explicitly not one.
 */
export const VIOLATION_CODES = [
	"PATH_OUTSIDE_ALLOWED",
	"PATH_TRAVERSAL",
	"SPECIAL_FILE_COLLISION",
	"CASE_COLLISION",
	"PROTECTED_PATH",
	"OWNERSHIP_VIOLATION",
] as const;

export type ViolationCode = (typeof VIOLATION_CODES)[number];

/**
 * Exhaustiveness helper. Call it in the default branch of any switch over
 * ErrorCode: adding ANY code then fails the build at every site that has not
 * handled it, rather than silently falling through at runtime.
 */
export function assertNever(value: never, context: string): never {
	throw new Error(`${context}: unhandled variant ${JSON.stringify(value)}`);
}

/**
 * Codes a gate_override must never clear, for three different reasons.
 *
 * A set rather than a chain of !== because the list has grown past the point
 * where a boolean expression documents itself, and because each entry is here
 * for its own reason rather than as more of the same:
 *
 *   BLAST_RADIUS_VIOLATION · DETERMINISM_VIOLATION
 *     The two BLAST-RADIUS.md names. Real refusals, where a justification must
 *     not be allowed to buy passage. "A justification does not make a path
 *     traversal acceptable."
 *
 *   IDEMPOTENCY_REPLAY
 *     Not a refusal at all. The delivery already happened and there is nothing
 *     for an override to permit — a gate override expresses an operator
 *     accepting risk in their own work, and it cannot make a completed write
 *     un-happen.
 *
 *   GITHUB_REJECTED
 *     Not ours to override. GitHub refused the request; our opinion about
 *     whether it should have is not part of the exchange, and an override would
 *     re-send bytes that will be refused identically.
 */
const NON_OVERRIDABLE: ReadonlySet<ErrorCode> = new Set([
	"BLAST_RADIUS_VIOLATION",
	"DETERMINISM_VIOLATION",
	"IDEMPOTENCY_REPLAY",
	"GITHUB_REJECTED",
]);

/** A code that is not overridable by gate_override. See NON_OVERRIDABLE. */
export function isOverridable(code: ErrorCode): boolean {
	return !NON_OVERRIDABLE.has(code);
}

/**
 * Auth codes. A SEPARATE union from ErrorCode on purpose.
 *
 * ErrorCode is export-scoped — BLAST-RADIUS.md's table, plus the codes added
 * since. Collapsing auth into it would let a failed sign-in render through the
 * export error map, and would break ERROR_MAP's exhaustiveness guarantee by
 * mixing two vocabularies that no single screen handles together. Same
 * reasoning that keeps ViolationCode separate.
 */
export const AUTH_CODES = [
	"INVALID_CREDENTIALS",
	"OAUTH_NOT_CONFIGURED",
	"OAUTH_DENIED",
	"OAUTH_EXCHANGE_FAILED",
	"RATE_LIMITED",
	"SESSION_REQUIRED",
] as const;

export type AuthCode = (typeof AUTH_CODES)[number];

/**
 * CRUD codes. A SEPARATE union again, for the reason AUTH_CODES and
 * VIOLATION_CODES are separate: ErrorCode is export-scoped — the codes
 * from BLAST-RADIUS.md's delivery flow — and "this mission does not exist" or
 * "this field failed validation" is not one of them. The Command Center's own
 * resource routes (mission · roster · playbook) speak this vocabulary.
 *
 * Collapsing them into ErrorCode would route a mission 404 through the export
 * error map, which has no case for it and asserts exhaustiveness over a set it
 * does not belong to. The contracts previously typed these responses with the
 * export envelope and had NO code to put in them — roster.ts even named
 * PRECONDITION_FAILED in a comment while the enum could not express it.
 */
export const CRUD_CODES = [
	"NOT_FOUND",
	"VALIDATION_FAILED",
	/** A hard precondition the request did not meet — e.g. the roster hard block. */
	"PRECONDITION_FAILED",
	"FORBIDDEN",
] as const;

export type CrudCode = (typeof CRUD_CODES)[number];

/**
 * Gate vocabulary. Closed sets — `mandatory | warn` only, "there is no
 * skippable" (CLAUDE.md).
 */
export const GATE_POLICIES = ["mandatory", "warn"] as const;
export type GatePolicy = (typeof GATE_POLICIES)[number];

export const GATE_STATES = [
	"pass",
	"block",
	"warn",
	"pending",
	"stale",
] as const;
export type GateState = (typeof GATE_STATES)[number];

/**
 * How a gate reached its verdict. THE distinction this product exists to make.
 *
 * BLAST-RADIUS.md: "An attestation rendered identically to a mechanical pass
 * is the failure mode this project exists to prevent, appearing inside the
 * product." So it is a required field, not an optional flag — a gate cannot be
 * rendered without answering how it was decided.
 */
export const GATE_SOURCES = ["mechanical", "attested"] as const;
export type GateSource = (typeof GATE_SOURCES)[number];
