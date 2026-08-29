import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { Button } from "#/ui/button";
import { SkeletonRows } from "#/ui/skeleton";
import { EmptyState, ErrorState } from "#/ui/states";
import { Surface } from "#/ui/surface";

export const Route = createFileRoute("/_app/missions/")({
	staticData: { device: "capture" as const },
	component: Missions,
});

/**
 * The smallest real loop, minus the data.
 *
 * This screen exists today to prove the four-state machinery renders inside the
 * shell. It deliberately resolves to an empty list: there is no contract yet,
 * so there is no Mission shape, so nothing here hand-writes one. The row
 * renderer arrives with mission.list, not before it.
 */
function Missions() {
	const query = useQuery<never[]>({
		queryKey: ["missions"],
		queryFn: async () => [],
	});

	return (
		<div className="px-6 py-5">
			<h1
				className="font-display text-lg font-semibold"
				data-testid="page-title"
			>
				Missions
			</h1>

			{/* The only other built route today. Linked so it is reachable rather
			    than needing the URL typed. */}
			<p className="pt-1 pb-3 text-sm text-text-muted">
				The pre-flight screen is partly built:{" "}
				<Link
					className="text-accent-text hover:text-accent-hover"
					data-testid="link-preflight"
					params={{ missionId: "01J8Z4K2QW3E5R7T9Y1V3J5P7A" }}
					to="/missions/$missionId/exports/new"
				>
					gates, from the golden fixture
				</Link>
			</p>

			<Surface
				empty={
					<EmptyState
						action={
							<Button data-testid="missions-empty-cta" variant="primary">
								Capture a mission
							</Button>
						}
						body="Nothing has been captured yet. A mission starts as a brief — client, type, sprint — and everything downstream is derived from it. Capture the first one from a phone, mid-conversation, and refine it later."
						title="No missions yet"
					/>
				}
				error={({ error, retry }) => (
					<ErrorState
						body={error.message}
						code="UNKNOWN"
						retry={retry}
						title="The mission list could not be read."
					/>
				)}
				loading={<SkeletonRows count={6} />}
				query={query}
			>
				{(missions) => <div data-testid="mission-rows">{missions.length}</div>}
			</Surface>
		</div>
	);
}
