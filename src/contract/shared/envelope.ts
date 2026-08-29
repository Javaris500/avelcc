import { z } from "zod";

import { ERROR_CODES } from "#/contract/shared/errors";

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

export const errorEnvelope = z.object({
	success: z.literal(false),
	error: z.object({
		code: errorCode,
		/** Human-readable, changes freely, NEVER parsed. */
		message: z.string(),
		/** Structured payload for codes that carry one, e.g. violations. */
		details: z.unknown().optional(),
		/** Correlates a failure with a server log without a screenshot. */
		requestId: z.string(),
	}),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelope>;

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
