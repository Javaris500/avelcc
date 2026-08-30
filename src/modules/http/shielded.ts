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

/* ── method guards ───────────────────────────────────────────────────────── */

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

type Handler = (ctx: { request: Request }) => Response | Promise<Response>;

/**
 * Fills in every method a route does NOT serve with an explicit 405.
 *
 * WITHOUT THIS, AN UNHANDLED METHOD FELL THROUGH TO THE SSR RENDERER and
 * returned `200 text/html` — an HTML page, with a success status, for a request
 * that did nothing. `DELETE /api/missions` answered 200. Three things wrong at
 * once: the status says success, the body is HTML where every other API
 * response is JSON, and a caller checking only `res.ok` believes its write
 * landed. Found by avel-71 probing methods during verification, not by any
 * test — every test we have calls the method the route implements.
 *
 * A guard per route rather than one at the root, because the fallthrough is a
 * property of the ROUTER matching a path and finding no handler for the verb.
 * The path is matched correctly; there is nothing further up to intercept.
 *
 * `Allow` is set from the methods actually served, which is the header the
 * spec requires on a 405 and the only machine-readable part of this response.
 */
export function withMethodGuard(
	handlers: Partial<Record<HttpMethod, Handler>>,
): Partial<Record<HttpMethod, Handler>> {
	const served = HTTP_METHODS.filter((m) => handlers[m] !== undefined);
	const allow = served.join(", ");

	const guarded: Partial<Record<HttpMethod, Handler>> = { ...handlers };
	for (const m of HTTP_METHODS) {
		if (guarded[m] !== undefined) continue;
		guarded[m] = () =>
			Response.json(
				{
					success: false,
					error: {
						/**
						 * VALIDATION_FAILED is the nearest honest code and it is not a
						 * good fit — no vocabulary has one meaning "wrong method". The
						 * STATUS is the signal here and `Allow` is the machine-readable
						 * part; the code exists so a screen switching on it is not
						 * handed something undeclared. Filed with the other
						 * ERROR_CODES gaps.
						 */
						code: "VALIDATION_FAILED",
						message: `${m} is not served by this endpoint. Allowed: ${allow || "none"}.`,
						requestId: crypto.randomUUID(),
					},
				},
				{ status: 405, headers: { Allow: allow } },
			);
	}
	return guarded;
}
