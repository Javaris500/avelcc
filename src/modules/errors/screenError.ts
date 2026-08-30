import type { Recovery } from "#/contract/errors/error-map";
import { presentError } from "#/contract/errors/error-map";
import { ERROR_CODES, type ErrorCode } from "#/contract/shared/errors";

/**
 * One place that decides how a failing screen presents a code, and — the part
 * that matters — whether it offers a RETRY at all.
 *
 * WHY THIS EXISTS. ERROR_MAP already carries a `recovery` for every ErrorCode,
 * and INTERNAL_ERROR's is `none` because retrying a server fault re-runs the
 * same fault. But a screen that passes `retry` to <ErrorState> unconditionally
 * renders the button anyway, and every screen here was doing exactly that.
 * Found live rather than reasoned about: a real INTERNAL_ERROR from a broken
 * mission read rendered "Try again" under copy that says the failure is ours
 * and nothing will change.
 *
 * So the affordance is derived from the map instead of from the call site. A
 * code that says it cannot be recovered by retrying does not get a retry
 * button, on any screen, without anyone having to remember.
 *
 * SCREENS SPEAK MORE THAN ONE VOCABULARY, which is why this takes a fallback.
 * A screen can receive an ErrorCode (INTERNAL_ERROR), a CrudCode (NOT_FOUND),
 * or one of the client-only labels a fetch helper raises when no envelope
 * arrived at all. Only the first has a map; the rest are the caller's to
 * describe, and the caller is the one that knows what its own read means.
 */
export type ScreenError = {
	code: string;
	title: string;
	body: string;
	/** False means render no retry, not "render a disabled one". */
	canRetry: boolean;
	/**
	 * The map's own recovery, for codes that have one. Returned rather than
	 * consumed here because a `link` or a `switch-target` needs a control this
	 * module cannot build — only the screen knows whether it can act on it.
	 * Absent for codes outside ERROR_CODES, which have no map entry.
	 */
	recovery?: Recovery;
};

function isErrorCode(code: string): code is ErrorCode {
	return (ERROR_CODES as readonly string[]).includes(code);
}

export function presentScreenError(
	code: string,
	fallback: { title: string; body: string; canRetry: boolean },
): ScreenError {
	if (!isErrorCode(code)) return { code, ...fallback };

	const presentation = presentError(code);
	return {
		code,
		title: presentation.title,
		body: presentation.body,
		/**
		 * `retry` ONLY, and that is the whole point: a `link` or a
		 * `switch-target` is a real recovery but it is NOT a retry, so it must
		 * never arrive as one. Those two travel out on `recovery` for a screen
		 * that can act on them, and ErrorState now has a slot to put them in.
		 */
		canRetry: presentation.recovery.kind === "retry",
		recovery: presentation.recovery,
	};
}
