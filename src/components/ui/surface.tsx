import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * The four-states generic.
 *
 * loading, empty, error and children are all REQUIRED. That is the entire
 * point: DAY-ONE-FRONTEND says "four states or it is not done. Enforce it by
 * making <Surface> require all four rather than by remembering." Making any of
 * them optional moves the guarantee from the compiler back into discipline,
 * and discipline is what this project is a defense against.
 *
 * Surface knows nothing about the contract. It is generic over whatever the
 * query returns, so it carries no domain types.
 */

type ErrorRender<TError> =
	| ReactNode
	| ((ctx: ErrorContext<TError>) => ReactNode);

export type ErrorContext<TError> = {
	error: TError;
	retry: () => void;
};

export type SurfaceProps<TData, TError = Error> = {
	query: UseQueryResult<TData, TError>;
	/** Content-shaped skeleton. Never a spinner. */
	loading: ReactNode;
	/** Designed, in brand voice. An empty state is a screen, not a blank. */
	empty: ReactNode;
	/** Mapped per error.code. Never parse message. */
	error: ErrorRender<TError>;
	children: (data: TData) => ReactNode;
	/**
	 * How to decide `data` is empty. The default covers the shapes that actually
	 * occur: nullish, an array, or an object with an `items` array. Anything
	 * else is considered non-empty, so pass this explicitly when that is wrong.
	 */
	isEmpty?: (data: TData) => boolean;
};

function defaultIsEmpty(data: unknown): boolean {
	if (data == null) return true;
	if (Array.isArray(data)) return data.length === 0;
	if (typeof data === "object" && "items" in data) {
		const items = (data as { items: unknown }).items;
		return Array.isArray(items) && items.length === 0;
	}
	return false;
}

export function Surface<TData, TError = Error>({
	query,
	loading,
	empty,
	error,
	children,
	isEmpty = defaultIsEmpty,
}: SurfaceProps<TData, TError>) {
	if (query.isPending) {
		return <div data-testid="surface-loading">{loading}</div>;
	}

	if (query.isError) {
		const rendered =
			typeof error === "function"
				? error({ error: query.error, retry: () => void query.refetch() })
				: error;
		return <div data-testid="surface-error">{rendered}</div>;
	}

	if (isEmpty(query.data)) {
		return <div data-testid="surface-empty">{empty}</div>;
	}

	return <div data-testid="surface-success">{children(query.data)}</div>;
}
