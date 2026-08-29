/**
 * The error code union. Both sides import this; nothing hand-writes a code.
 *
 * "Never parse `message`. Codes are the contract; messages change freely."
 *   — DAY-ONE-FRONTEND.md
 *
 * Seeded from the twelve codes in docs/BLAST-RADIUS.md's error table.
 */

export const ERROR_CODES = [
  'REPO_NOT_FOUND',
  'REPO_NO_ACCESS',
  'CONNECTION_REVOKED',
  'POLICY_FORBIDS_TARGET',
  'BRANCH_NOT_FOUND',
  'EMPTY_REPOSITORY',
  'TREE_TOO_LARGE',
  'BLAST_RADIUS_VIOLATION',
  'PREVIEW_STALE',
  'PREVIEW_REQUIRED',
  'DETERMINISM_VIOLATION',
  'EXTERNAL_GITHUB',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

/**
 * The six violation codes. Deliberately a SEPARATE union from ErrorCode.
 *
 * BLAST-RADIUS.md: "Gates concern work quality; violations concern writing
 * where you were not permitted." BLAST_RADIUS_VIOLATION is the error; these
 * are what it carries. Collapsing them would let a screen treat a path
 * traversal as an overridable gate failure, and it is explicitly not one.
 */
export const VIOLATION_CODES = [
  'PATH_OUTSIDE_ALLOWED',
  'PATH_TRAVERSAL',
  'SPECIAL_FILE_COLLISION',
  'CASE_COLLISION',
  'PROTECTED_PATH',
  'OWNERSHIP_VIOLATION',
] as const

export type ViolationCode = (typeof VIOLATION_CODES)[number]

/**
 * Exhaustiveness helper. Call it in the default branch of any switch over
 * ErrorCode: adding a thirteenth code then fails the build at every site that
 * has not handled it, rather than silently falling through at runtime.
 */
export function assertNever(value: never, context: string): never {
  throw new Error(`${context}: unhandled variant ${JSON.stringify(value)}`)
}

/** A code that is not overridable by gate_override, per BLAST-RADIUS.md. */
export function isOverridable(code: ErrorCode): boolean {
  return code !== 'BLAST_RADIUS_VIOLATION' && code !== 'DETERMINISM_VIOLATION'
}

/**
 * Auth codes. A SEPARATE union from ErrorCode on purpose.
 *
 * ErrorCode is export-scoped — it is the twelve codes from BLAST-RADIUS.md's
 * table. Collapsing auth into it would let a failed sign-in render through the
 * export error map, and would break ERROR_MAP's exhaustiveness guarantee by
 * mixing two vocabularies that no single screen handles together. Same
 * reasoning that keeps ViolationCode separate.
 */
export const AUTH_CODES = [
  'INVALID_CREDENTIALS',
  'OAUTH_NOT_CONFIGURED',
  'OAUTH_DENIED',
  'OAUTH_EXCHANGE_FAILED',
  'RATE_LIMITED',
  'SESSION_REQUIRED',
] as const

export type AuthCode = (typeof AUTH_CODES)[number]

/**
 * Gate vocabulary. Closed sets — `mandatory | warn` only, "there is no
 * skippable" (CLAUDE.md).
 */
export const GATE_POLICIES = ['mandatory', 'warn'] as const
export type GatePolicy = (typeof GATE_POLICIES)[number]

export const GATE_STATES = ['pass', 'block', 'warn', 'pending', 'stale'] as const
export type GateState = (typeof GATE_STATES)[number]

/**
 * How a gate reached its verdict. THE distinction this product exists to make.
 *
 * BLAST-RADIUS.md: "An attestation rendered identically to a mechanical pass
 * is the failure mode this project exists to prevent, appearing inside the
 * product." So it is a required field, not an optional flag — a gate cannot be
 * rendered without answering how it was decided.
 */
export const GATE_SOURCES = ['mechanical', 'attested'] as const
export type GateSource = (typeof GATE_SOURCES)[number]
