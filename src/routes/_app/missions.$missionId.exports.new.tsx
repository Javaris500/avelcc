import { createFileRoute } from "@tanstack/react-router";
import { FULL_BUILD_GATES } from "#/contract/shared/playbook";
import { GateRow } from "#/modules/gate";
import { Tag } from "#/ui/badge";
import { Button } from "#/ui/button";

/**
 * The pre-flight screen. ROUTES.md calls it "the screen that carries the
 * product": preconditions -> gates -> verification -> blast radius -> one button.
 *
 * ONLY SECTION 2 IS BUILT. The other three are shown as declared-and-unbuilt
 * rather than omitted, because the operator should see the shape of the
 * decision they will eventually make. They are NOT faked: no invented file
 * counts, no green ticks. An unbuilt section says it is unbuilt.
 */
export const Route = createFileRoute("/_app/missions/$missionId/exports/new")({
	staticData: { device: "construction" as const },
	component: PreFlight,
});

function Section({
	n,
	title,
	children,
	built = true,
}: {
	n: number;
	title: string;
	children: React.ReactNode;
	built?: boolean;
}) {
	return (
		<section
			className="rounded-md border border-[var(--elevation-border-rest)] bg-app-panel"
			data-built={built}
			data-testid={`preflight-section-${n}`}
		>
			<header className="flex items-center gap-2 border-b border-[var(--elevation-border-rest)] px-4 py-2">
				<span className="font-mono text-micro text-text-subtle">{n}</span>
				<h2 className="font-display text-sm font-semibold tracking-wide uppercase">
					{title}
				</h2>
			</header>
			{children}
		</section>
	);
}

function NotBuilt({ what }: { what: string }) {
	return (
		<p className="px-4 py-3 text-sm text-text-subtle" data-testid="not-built">
			Not built. {what}
		</p>
	);
}

function PreFlight() {
	const { missionId } = Route.useParams();

	return (
		<div className="flex max-w-[68ch] flex-col gap-4 px-6 py-5">
			<div className="flex flex-col gap-1">
				<h1
					className="font-display text-title font-semibold"
					data-testid="page-title"
				>
					Pre-flight
				</h1>
				<p className="flex items-center gap-2 text-sm text-text-muted">
					mission <Tag data-testid="preflight-mission">{missionId}</Tag>
				</p>
			</div>

			<Section n={1} title="Preconditions" built={false}>
				<NotBuilt what="Needs mission.getWithRoster, which the contract does not define yet." />
			</Section>

			<Section n={2} title="Gates">
				<div data-testid="gate-list">
					{FULL_BUILD_GATES.map((g) => (
						<GateRow key={g.name} {...g} />
					))}
				</div>
				<p className="px-4 py-3 text-sm leading-relaxed text-text-subtle">
					Every gate reads <span className="font-mono">not run</span> because
					zero missions have run. <span className="font-mono">alignment</span>{" "}
					is marked attested: nothing mechanical checks it, so it is warn-toned
					even when it passes.
				</p>
			</Section>

			<Section n={3} title="Verification" built={false}>
				<NotBuilt what="Needs the export engine to produce a verification record." />
			</Section>

			<Section n={4} title="Blast radius" built={false}>
				<NotBuilt what="computeBlastRadius is built and tested; this needs a gateway read of a real repository tree." />
			</Section>

			{/* Disabled by STATE, never by styling. Nothing has been previewed, so
			    there is nothing to deliver — and the attribute says so. */}
			<div className="flex items-center gap-3">
				<Button data-testid="preflight-deliver" disabled variant="primary">
					Deliver
				</Button>
				<span className="text-sm text-text-subtle">
					Disabled: no preview has been computed.
				</span>
			</div>
		</div>
	);
}
