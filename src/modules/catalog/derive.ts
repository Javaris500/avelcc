import type { AgentTemplateRow, SkillRow } from "#/contract/catalog";

/**
 * THE THREE QUESTIONS THE CATALOG ASKS OF A ROW, answered in one place.
 *
 * These are NOT in `src/contract/catalog.ts` and should not be. The contract
 * owns the shape that crosses the wire; these are screen logic derived from it,
 * and a predicate in the contract would be a rule the server does not enforce
 * masquerading as part of the schema.
 *
 * They live together rather than inside the view that first needed them because
 * two of them are read by two screens each: the skills page counts skills whose
 * revocation left something holding them, and the agents page marks which of a
 * template's skills is the one. A second definition of either is how the two
 * screens end up disagreeing about what the problem is.
 *
 * The shapes these read were declared locally in this module until `a0ef4dd`,
 * because no contract or endpoint existed. Both exist now, the local
 * declaration is deleted, and the views import from `#/contract/catalog`. The
 * gap that mattered is closed: a screen can no longer disagree with the route
 * that feeds it without one of them failing to compile.
 */

export function isRevoked(row: { revokedAt: string | null }): boolean {
	return row.revokedAt !== null;
}

/**
 * THE CONDITION THAT CAUSED A REAL BUG, named once so three screens cannot
 * disagree about what it is: a skill withdrawn from the catalog that something
 * still carries. Anything holding it will still render it into a package,
 * because nothing downstream re-checks the catalog at render time.
 *
 * An inactive roster entry still counts. `active` gates dispatch, not the
 * render, so an inactive entry holding a revoked skill is the same exposure.
 */
export function danglingAttachments(skill: SkillRow): number {
	if (!isRevoked(skill)) return 0;
	return (
		skill.attachedTo.templates.length + skill.attachedTo.rosterEntries.length
	);
}

/**
 * MODEL CONTEXT STORED ON AN AGENT THAT CANNOT RECEIVE IT.
 *
 * `render.ts` emits identity.md and depth.md only for `runtime === 'model'`.
 * A human or code template whose markdown columns are populated is carrying
 * text that nothing will ever render, and the catalog is the only screen that
 * can say so.
 *
 * Whitespace-only counts as absent. `identity_md` is NOT NULL, so every
 * non-model row necessarily holds a string, and treating `""` as content would
 * flag every human agent ever created.
 */
export function strandedModelContext(template: AgentTemplateRow): boolean {
	if (template.runtime === "model") return false;
	return (
		template.identityMd.trim().length > 0 ||
		(template.depthMd ?? "").trim().length > 0
	);
}
