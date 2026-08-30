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
	params?: Record<string, string>;
	label: string;
	note: string;
	state: "built" | "partial";
};

const ENTRIES: Entry[] = [
	{
		to: "/login",
		label: "Sign in",
		note: "GitHub OAuth seam and email/password. The gate is real; the identity source is a stub.",
		state: "built",
	},
	{
		to: "/missions",
		label: "Missions",
		note: "The app shell, sidebar and nav. The list renders its designed empty state — nothing has been captured.",
		state: "built",
	},
	{
		to: "/missions/$missionId/exports/new",
		params: { missionId: "01J8Z4K2QW3E5R7T9Y1V3J5P7A" },
		label: "Pre-flight",
		note: "Gates only, read from the golden fixture's playbook. Every gate reads not run, because none have.",
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
			<div className="mx-auto flex max-w-[64ch] flex-col gap-8 px-6 py-16">
				<header className="flex items-start justify-between gap-4">
					<div className="flex flex-col gap-3">
						<Wordmark />
						<h1 className="font-display text-title font-semibold tracking-[-0.01em]">
							Command Center
						</h1>
						<p className="text-sm leading-relaxed text-text-muted">
							Turns a client brief into a deterministic package — mission,
							roster, conventions — then renders, freezes, gates and delivers
							it. Nothing ships past a gate it did not pass.
						</p>
					</div>
					{/* Only on the door. Inside the shell the sidebar footer owns the
					    toggle, and two useTheme instances would desync the moment
					    either one was pressed. */}
					<Button
						data-testid="home-theme"
						onClick={onToggle}
						size="sm"
						variant="ghost"
					>
						{theme === "dark" ? "Light" : "Dark"}
					</Button>
				</header>

				<div className="flex flex-col gap-2">
					<p className="font-mono text-micro tracking-wider text-text-subtle uppercase">
						What is built
					</p>
					{ENTRIES.map((e) => (
						<Link
							className="interactive flex flex-col gap-1 rounded-md border border-[var(--elevation-border-rest)] bg-app-panel p-4"
							data-testid={`home-link-${e.label.toLowerCase().replace(/\s+/g, "-")}`}
							key={e.label}
							params={e.params as never}
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
							<span className="text-sm leading-relaxed text-text-muted">
								{e.note}
							</span>
						</Link>
					))}
				</div>

				<p className="border-t border-[var(--elevation-border-rest)] pt-4 text-sm leading-relaxed text-text-subtle">
					Not signed in. Missions and pre-flight are behind the session gate —
					it refuses rather than redirecting, which is deliberate.
				</p>
			</div>
		</div>
	);
}
