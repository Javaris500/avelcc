import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";

import {
	isEndpointAbsent,
	presentCatalogError,
} from "#/modules/catalog/queries";
import { SkeletonRows } from "#/ui/skeleton";
import { ErrorState } from "#/ui/states";
import { Surface } from "#/ui/surface";

/**
 * THE FOUR STATES, PLUS THE FIFTH ONE THAT MATTERS HERE.
 *
 * `Surface` requires loading, empty, error and children, and requires them at
 * the type level so the guarantee sits with the compiler rather than with
 * whoever is writing the screen. All three catalog screens go through this so
 * the four are decided once.
 *
 * NOT-BUILT IS SPLIT OUT OF ERROR. An endpoint nobody has written yet is not a
 * fault, and rendering it as one puts a red code and a "Try again" in front of
 * an operator who did nothing wrong and can do nothing about it. It is also not
 * empty: "No skills yet" in front of a catalog nothing has ever queried is the
 * screen asserting an emptiness it never checked, which is the same defect
 * `client/ui/scaffold.tsx` calls out for counts.
 *
 * The treatment matches what the pre-flight screen already established for this
 * exact case: "Not built. <why>", quiet, in `text-text-subtle`, with
 * `data-built={false}` so a test can assert the state rather than the copy.
 * A second vocabulary for the same idea is the thing this split exists to
 * avoid.
 */
export function CatalogSurface<TData extends { data: unknown[] }>({
	query,
	noun,
	empty,
	children,
	loadingRows = 6,
	"data-testid": testId,
}: {
	query: UseQueryResult<TData, Error>;
	/** Plain-words name of what was being read. Goes into every failure line. */
	noun: string;
	empty: ReactNode;
	children: (data: TData) => ReactNode;
	loadingRows?: number;
	"data-testid": string;
}) {
	return (
		<Surface
			empty={empty}
			error={({ error, retry }) => {
				if (isEndpointAbsent(error)) {
					const shown = presentCatalogError(error, noun);
					return (
						<div
							/*
							 * QUIET, BUT NOT UNSTYLED. The copy and the tone were right
							 * and are unchanged; what was missing is that it had no
							 * surface at all, so it rendered as prose floating in an
							 * empty pane and read as a page that failed to load rather
							 * than a state somebody designed. metric-stat.tsx names the
							 * same trap: being correct is not the same as looking
							 * deliberate.
							 *
							 * A DASHED border is the whole idea. Every solid border in
							 * this app bounds something real; dashed is the convention
							 * for a placeholder, so the container says "this is where it
							 * will be" without adding a word or raising the volume. The
							 * fill recesses toward the desktop tone by half, which is
							 * gentle in both themes and needs no per-theme value.
							 */
							className="rounded-md border border-[var(--elevation-border-rest)] border-dashed bg-[color-mix(in_oklab,var(--color-app-bg)_50%,transparent)] px-5 py-6"
							data-built="false"
							data-testid={`${testId}-not-built`}
						>
							<p className="max-w-[68ch] text-sm leading-relaxed text-text-subtle">
								Not built. {shown.body}
							</p>
						</div>
					);
				}
				// The affordance comes from the error map, not from this call site:
				// a code whose recovery is `none` must not be handed a retry.
				const shown = presentCatalogError(error, noun);
				return (
					<ErrorState
						body={shown.body}
						code={shown.code}
						retry={shown.canRetry ? retry : undefined}
						title={shown.title}
					/>
				);
			}}
			// The query resolves the ENVELOPE, not the array, so the default
			// heuristic cannot see the rows.
			isEmpty={(page) => page.data.length === 0}
			loading={
				<div className="px-4">
					<SkeletonRows count={loadingRows} />
				</div>
			}
			query={query}
		>
			{children}
		</Surface>
	);
}
