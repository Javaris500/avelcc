import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { readSession, signOut } from "#/modules/auth/session";
import { ChatHome } from "#/modules/chat/home";
import { NAV } from "#/modules/nav";
import { Shell } from "#/modules/shell/shell";
import { Wordmark } from "#/modules/shell/wordmark";
import { useTheme } from "#/modules/theme/use-theme";
import { StatusBadge } from "#/ui/badge";
import { Button } from "#/ui/button";

/**
 * Home.
 *
 * UI-PLAN decision 1: chat replaces home. `/` is a conversation with the
 * Command Center agent, because every other nav item is a noun you browse and
 * this is where you start when you do not yet know which noun you want.
 *
 * ONE ENDPOINT, TWO STATES, AND THE SPLIT IS KEPT. This route is deliberately
 * OUTSIDE the session gate. It used to redirect to /missions, which for a
 * signed-out visitor bounced straight into the hard-refusal screen, so the
 * first thing anyone saw was "this request was refused" rather than a front
 * door. UI-PLAN section 8 rules on what home is for an operator and is silent
 * on what it is for a visitor, so the front door stays as it was:
 *
 *   signed in  -> the chat, inside the shell
 *   signed out -> the bare door, an index of what is actually built
 *
 * Putting the chat on the signed-out side would be worse than the redirect it
 * replaced. A conversation with an agent nobody is authenticated to is a
 * control that cannot work, offered as the first thing a visitor sees.
 */
export const Route = createFileRoute("/")({
	ssr: false,
	staticData: { device: "capture" as const },
	component: Home,
});

type Entry = {
	to: string;
	label: string;
	note: string;
	state: "built" | "partial";
};

/**
 * THE DOOR STATES WHAT IS BUILT, so every claim on it has to be true.
 *
 * The pre-flight entry used to deep-link a hardcoded id,
 * `01J8Z4K2QW3E5R7T9Y1V3J5P7A`. That is a ULID and `missions.id` is a uuid, so
 * it matched no row and the front door's third link was a 404 — the one link
 * most likely to be clicked by someone evaluating whether any of this works.
 * It now points at the list, which is honest and cannot rot: the operator picks
 * a mission that exists rather than the door guessing one.
 *
 * The notes were stale in the same direction. Two of them said nothing had been
 * captured, which stopped being true when the corpus landed.
 */
const ENTRIES: Entry[] = [
	{
		to: "/login",
		label: "Sign in",
		note: "GitHub OAuth seam and email/password. The gate is real; the identity source is a stub.",
		state: "built",
	},
	{
		to: "/clients",
		label: "Clients",
		note: "Client detail with its engagements, missions, deliveries, roster, repositories, cost and an append-only activity feed.",
		state: "built",
	},
	{
		to: "/missions",
		label: "Missions",
		note: "The app shell, sidebar and nav, over real missions. Zero have run end to end through the platform.",
		state: "partial",
	},
	{
		to: "/catalog/agents",
		label: "Catalog",
		note: "Agent templates, skills and their sources. Seven agents seeded from a live project.",
		state: "built",
	},
	{
		to: "/missions",
		label: "Pre-flight",
		note: "Gates read from the playbook, blast radius against a real tree. Open a mission to reach it.",
		state: "partial",
	},
];

function Home() {
	const { theme, toggle } = useTheme();
	const navigate = useNavigate();
	const session = readSession();

	// Signed in: the chat, inside the shell, so the nav is where it belongs.
	if (session) {
		return (
			<Shell
				breadcrumb="No run in progress"
				navGroups={NAV}
				onSignOut={() => {
					signOut();
					void navigate({ to: "/login" });
				}}
				session={session}
			>
				<ChatHome />
			</Shell>
		);
	}

	// Signed out: a bare front door. No shell, because the shell implies an
	// authenticated context that does not exist yet, and the gate refusing hard
	// should never be the first screen.
	return (
		<div
			className={`app min-h-screen bg-app-bg text-text${theme === "light" ? " light" : ""}`}
			data-testid="home"
			data-theme={theme}
		>
			<FrontDoor onToggle={toggle} theme={theme} />
		</div>
	);
}

/**
 * The signed-out door. An index of what is actually built, not a dashboard.
 * DAY-ONE-FRONTEND forbids a dashboard and it is right to: two missions is not
 * a trend, and zero have run.
 */
function FrontDoor({
	theme,
	onToggle,
}: {
	theme: "dark" | "light";
	onToggle: () => void;
}) {
	return (
		<div data-testid="home-body">
			{/* Keyboard users land on the link list without walking the header
			    first. Visually hidden until focused, which is the only state it
			    needs to exist in. */}
			<a
				className="sr-only rounded-sm bg-app-panel px-3 py-2 text-sm focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
				href="#what-is-built"
			>
				Skip to what is built
			</a>

			<main className="mx-auto flex max-w-[64ch] flex-col gap-8 px-6 py-16">
				<header className="flex items-start justify-between gap-4">
					<div className="flex min-w-0 flex-col gap-3">
						<Wordmark />
						<h1 className="font-display text-title font-semibold tracking-[-0.01em] text-balance">
							Command Center
						</h1>
						<p className="max-w-[58ch] text-sm leading-relaxed text-text-muted text-pretty">
							Turns a client brief into a deterministic package — mission,
							roster, conventions — then renders, freezes, gates and delivers
							it. Nothing ships past a gate it did not pass.
						</p>
					</div>
					{/* Only on the door. Inside the shell the sidebar footer owns the
					    toggle, and two useTheme instances would desync the moment
					    either one was pressed.

					    `aria-label` names the DESTINATION, not the current state: the
					    visible word is "Light", and a screen reader announcing only
					    that leaves it ambiguous whether it reports or switches. */}
					<Button
						aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
						className="shrink-0"
						data-testid="home-theme"
						onClick={onToggle}
						size="sm"
						variant="ghost"
					>
						{theme === "dark" ? "Light" : "Dark"}
					</Button>
				</header>

				<section
					aria-labelledby="what-is-built"
					className="flex flex-col gap-2"
				>
					<h2
						className="font-mono text-micro tracking-wider text-text-subtle uppercase"
						id="what-is-built"
					>
						What is built
					</h2>
					{/* A list, because it is one. Screen readers announce the count,
					    which is the first thing someone evaluating this wants. */}
					<ul className="flex list-none flex-col gap-2 p-0">
						{ENTRIES.map((e) => (
							<li key={e.label}>
								<Link
									className="interactive flex flex-col gap-1 rounded-md border border-[var(--elevation-border-rest)] bg-app-panel p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] motion-reduce:transition-none"
									data-testid={`home-link-${e.label.toLowerCase().replace(/\s+/g, "-")}`}
									to={e.to as never}
								>
									<span className="flex items-center gap-2">
										<span className="font-display text-sm font-semibold">
											{e.label}
										</span>
										<StatusBadge
											data-testid={`home-state-${e.label.toLowerCase()}`}
											tone={e.state === "built" ? "pass" : "warn"}
										>
											{e.state}
										</StatusBadge>
									</span>
									<span className="text-sm leading-relaxed text-text-muted text-pretty">
										{e.note}
									</span>
								</Link>
							</li>
						))}
					</ul>
				</section>

				{/*
				  No rule above this. The front door is outside the shell, so the
				  operator's no-rules ruling does not strictly reach it, but the
				  reason does: the column's own gap already separates the footer
				  from the list, and the line was doing nothing the gap was not.
				*/}
				<p className="text-sm leading-relaxed text-text-subtle text-pretty">
					Not signed in. Everything above is behind the session gate — it
					refuses rather than redirecting, which is deliberate.
				</p>
			</main>
		</div>
	);
}
