import type { CrudCode, ErrorCode } from "#/contract/shared/errors";

/**
 * The last-resort wrapper and the error envelope, shared.
 *
 * Both already existed as private copies inside `missions.$id.ts` and
 * `missions.$id.roster.ts`. Adding four more routes would have made six, and
 * six copies of a catch block is how two routes come to disagree about what a
 * database failure looks like — which is the shape of the defect that produced
 * INTERNAL_ERROR in the first place: two routes with no catch at all, returning
 * `unhandled: true` and nothing for a screen to switch on.
 *
 * Extracted rather than duplicated, and the two existing copies are left alone
 * because they are not this session's files. They are byte-equivalent to this
 * and can collapse onto it whenever their owner wants.
 */

/**
 * Any throw becomes the contract's envelope.
 *
 * The caught error goes to the SERVER LOG and never into the response. An
 * exception message can carry a connection string, a column name, or a row's
 * contents; the caller gets a request id to quote instead, which is the whole
 * reason INTERNAL_ERROR's copy is generic.
 */
export async function shielded(
	what: string,
	fn: () => Promise<Response>,
): Promise<Response> {
	try {
		return await fn();
	} catch (error) {
		const requestId = crypto.randomUUID();
		console.error(`[${requestId}] ${what} failed:`, error);
		return Response.json(
			{
				success: false,
				error: {
					code: "INTERNAL_ERROR",
					message:
						"Something failed on our side. Quote the request id when reporting it.",
					requestId,
				},
			},
			{ status: 500 },
		);
	}
}

/** The error envelope. DATA-CONTRACTS-V2:78. */
export function crudError(
	status: number,
	code: ErrorCode | CrudCode,
	message: string,
	details?: unknown,
): Response {
	return Response.json(
		{
			success: false,
			error: {
				code,
				message,
				...(details === undefined ? {} : { details }),
				requestId: crypto.randomUUID(),
			},
		},
		{ status },
	);
}

/**
 * A malformed body is 422 VALIDATION_FAILED, which is a CrudCode.
 *
 * `details` is field-keyed so a form can mark the offending inputs. The
 * frontend switches on `code`; `details` is what it renders.
 */
export function validationFailed(message: string, details?: unknown): Response {
	return crudError(422, "VALIDATION_FAILED", message, details);
}

/**
 * NOT_FOUND, and unlike the export routes this one has an honest code for it.
 * `exports.$id.ts` answers REPO_NOT_FOUND because `export.get` declares only
 * the export-scoped envelope; the client and engagement contracts declare
 * `crudErrorEnvelope`, whose vocabulary contains the word for this.
 */
export function notFound(message: string): Response {
	return crudError(404, "NOT_FOUND", message);
}
