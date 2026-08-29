import { z } from "zod";

import { CRUD_CODES, ERROR_CODES } from "#/contract/shared/errors";

/**
 * The response envelope. DATA-CONTRACTS-V2:78.
 *
 *   success:  { success: true,  data: T, meta?: {...} }
 *   error:    { success: false, error: { code, message, details?, requestId } }
 *
 * "The frontend switches on `error.code`. It never parses `message`." That is
 * why `code` is a zod enum over the union rather than a string: a response
 * carrying an undeclared code fails validation at the boundary instead of
 * reaching a screen that has no case for it.
 */

export const errorCode = z.enum(ERROR_CODES);
export const crudErrorCode = z.enum(CRUD_CODES);

/**
 * The error envelope, parameterised by its code vocabulary. Two vocabularies
 * exist — the export-scoped ERROR_CODES and the resource-scoped CRUD_CODES —
 * and they are deliberately not one set (see contract/shared/errors.ts). The
 * shape around the code is identical, so it is single-sourced here.
 */
function envelopeFor<C extends z.ZodTypeAny>(code: C) {
	return z.object({
		success: z.literal(false),
		error: z.object({
			code,
			/** Human-readable, changes freely, NEVER parsed. */
			message: z.string(),
			/** Structured payload for codes that carry one, e.g. violations. */
			details: z.unknown().optional(),
			/** Correlates a failure with a server log without a screenshot. */
			requestId: z.string(),
		}),
	});
}

/** Export-scoped: the twelve BLAST-RADIUS codes. */
export const errorEnvelope = envelopeFor(errorCode);
export type ErrorEnvelope = z.infer<typeof errorEnvelope>;

/** Resource-scoped: the Command Center's own mission/roster/playbook routes. */
export const crudErrorEnvelope = envelopeFor(crudErrorCode);
export type CrudErrorEnvelope = z.infer<typeof crudErrorEnvelope>;

/** Wraps a data schema in the success envelope. */
export function success<T extends z.ZodTypeAny>(data: T) {
	return z.object({
		success: z.literal(true),
		data,
		meta: z.record(z.string(), z.unknown()).optional(),
	});
}

/** Success wrapper for a paginated list, with the page cursor in `meta`. */
export function successList<T extends z.ZodTypeAny>(item: T) {
	return z.object({
		success: z.literal(true),
		data: z.array(item),
		meta: z.object({
			total: z.number().int().nonnegative(),
			nextCursor: z.string().nullable(),
		}),
	});
}
