import type { ErrorCode, ViolationCode } from "#/contract/shared/errors";

/** Success and error shapes. Both sides import these. */

export type Violation = {
	code: ViolationCode;
	path: string;
	detail: string;
};

export type ErrorEnvelope = {
	success: false;
	error: {
		code: ErrorCode;
		/** Human-readable, may change freely. NEVER parse this. */
		message: string;
		/** Present on BLAST_RADIUS_VIOLATION. */
		violations?: Violation[];
		/** Present on PREVIEW_STALE and DETERMINISM_VIOLATION. */
		detail?: Record<string, string>;
	};
};

export type SuccessEnvelope<T> = {
	success: true;
	data: T;
};

export type Envelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

export function isError<T>(e: Envelope<T>): e is ErrorEnvelope {
	return e.success === false;
}
