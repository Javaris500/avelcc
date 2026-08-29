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
