import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";
import { SkeletonRows } from "#/components/ui/skeleton";
import { EmptyState, ErrorState } from "#/components/ui/states";
import { Surface } from "#/components/ui/surface";

export const Route = createFileRoute("/_app/missions")({
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
