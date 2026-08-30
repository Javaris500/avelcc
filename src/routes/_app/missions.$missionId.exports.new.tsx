import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { presentError } from "#/contract/errors/error-map";
import { ERROR_CODES, type ErrorCode } from "#/contract/shared/errors";
import { FULL_BUILD_GATES } from "#/contract/shared/playbook";
import {
	BlastRadius,
	type BlastRadiusView,
} from "#/modules/blast/blast-radius";
import { presentScreenError } from "#/modules/errors/screenError";
import { GateRow } from "#/modules/gate";
import { usePageHeader } from "#/modules/shell/use-page-header";
import { Tag } from "#/ui/badge";
import { Button } from "#/ui/button";
import { SkeletonRows } from "#/ui/skeleton";
import { ErrorState } from "#/ui/states";
import { Surface } from "#/ui/surface";

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

	/**
	 * The first query in this app that reads something real. The rendered side is
	 * the golden fixture on disk; the remote side is one live GitHub Trees call.
	 * No database, no auth, no export engine — which is exactly the demo
	 * DAY-ONE-FRONTEND asked for: "the actual mechanism, running in a browser".
	 */
	const blast = useQuery<BlastRadiusView>({
		queryKey: ["blast-radius", "octocat", "Spoon-Knife", "main"],
		queryFn: async () => {
			const res = await fetch("/api/preflight/blast-radius");
			const body = await res.json();
			if (!body.success) throw new Error(body.error.code);
			return body.data as BlastRadiusView;
		},
		// A tree is immutable for a given commit sha, so refetching on focus
		// spends rate limit for an identical answer.
		refetchOnWindowFocus: false,
		retry: false,
	});

	/**
	 * This route has NO NAV ENTRY, so before it claimed a title the header fell
	 * back to the generic and read "AVEL" above the pre-flight screen. A route
	 * off the nav is exactly the case the fallback cannot serve, and exactly the
	 * case where claiming costs one call.
	 *
	 * `definition` rather than `subtitle`: the mission id is not a count, and
	 * "pre-flight" is jargon that earns one plain sentence in front of an
	 * operator deciding whether to ship someone else's code.
	 */
	usePageHeader({
		title: "Pre-flight",
		definition:
			"What delivery would do to the repository, before anything is written.",
	});

	return (
		<div className="flex max-w-[68ch] flex-col gap-4 px-6 py-5">
			<div className="flex flex-col gap-1">
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

			<Section n={4} title="Blast radius">
				<Surface
					query={blast}
					loading={<SkeletonRows count={5} />}
					empty={
						<NotBuilt what="The tree read returned nothing to classify." />
					}
					error={({ error, retry }) => {
						// Codes are the contract; messages change freely. Nothing here
						// parses a message — the query throws the CODE.
						const code = ERROR_CODES.includes(error.message as ErrorCode)
							? (error.message as ErrorCode)
							: "EXTERNAL_GITHUB";
						// The fallback is unreachable here — `code` is coerced into
						// ERROR_CODES above, so the map always answers — but it is the
						// argument the signature asks for, and it stays honest if that
						// coercion ever stops being total.
						const mapped = presentError(code);
						const shown = presentScreenError(code, {
							title: mapped.title,
							body: mapped.body,
							canRetry: false,
						});
						/**
						 * A `link` recovery becomes a real link. Every code that carries
						 * one — REPO_NO_ACCESS, CONNECTION_REVOKED — used to render as no
						 * action, so an operator was told which credential was wrong and
						 * given nowhere to go.
						 *
						 * `switch-target` is deliberately still unrendered: it means
						 * "deliver a zip instead", and no screen can yet change an
						 * export's target. A button that cannot do what it says is worse
						 * than an absent one.
						 */
						const action =
							shown.recovery?.kind === "link" ? (
								<Link
									className="text-sm text-accent-text hover:text-accent-hover"
									data-testid="error-action-link"
									to={shown.recovery.to}
								>
									{shown.recovery.label}
								</Link>
							) : null;
						return (
							<ErrorState
								action={action}
								body={shown.body}
								code={shown.code}
								retry={shown.canRetry ? retry : undefined}
								title={shown.title}
							/>
						);
					}}
				>
					{(data) => <BlastRadius data={data} />}
				</Surface>
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
