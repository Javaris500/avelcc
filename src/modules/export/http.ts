import type { CrudCode, ErrorCode } from "#/contract/shared/errors";
import type { ExportResult } from "#/modules/export/service";

/**
 * The shared HTTP edge for the three export routes.
 *
 * One place that turns a service result into a response, so three handlers do
 * not each shape the envelope slightly differently.
 */

/** The success envelope. DATA-CONTRACTS-V2:78. */
export function exportResponse(
	result: ExportResult,
	created: 200 | 201,
): Response {
	if (result.ok) {
		return Response.json(
			{ success: true, data: result.export },
			{ status: created },
		);
	}
	const { code, status, detail, details } = result.failure;
	return errorResponse(status, code, detail, details);
}

export function errorResponse(
	status: number,
	code: ErrorCode,
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
 * A MALFORMED REQUEST BODY, ANSWERED IN THE CRUD VOCABULARY, DELIBERATELY.
 *
 * `export.preview` and `export.create` declare `422: errorEnvelope`, and
 * ERROR_CODES has NOTHING meaning "this body failed validation". Every code in
 * it describes something about a repository, a package or a delivery.
 *
 * The alternative was to reach for the nearest export code, and that is worse
 * than a vocabulary mismatch: BLAST_RADIUS_VIOLATION renders as "delivery would
 * write outside the permitted paths", which for a JSON syntax error tells an
 * operator their package is dangerous. A wrong answer that alarms is worse than
 * an honest one that does not typecheck against a doc.
 *
 * So a body that fails to parse is answered with CRUD_CODES' VALIDATION_FAILED,
 * on the reasoning that a request rejected at the schema boundary NEVER ENTERED
 * the export domain and therefore cannot be described by its vocabulary. This
 * is a KNOWN DEVIATION from the declared envelope, filed rather than hidden,
 * and it is the same root gap that produced IDEMPOTENCY_REPLAY and
 * GITHUB_REJECTED: ERROR_CODES was seeded from one document's table and keeps
 * meeting states that table never listed.
 */
export function validationFailed(message: string, details?: unknown): Response {
	const code: CrudCode = "VALIDATION_FAILED";
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
		{ status: 422 },
	);
}
