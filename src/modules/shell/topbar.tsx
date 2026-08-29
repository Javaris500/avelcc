import { ChevronDown, PanelLeft } from "lucide-react";
import { type ReactNode, type RefObject, useState } from "react";
import { FULL_BUILD_GATES } from "#/contract/shared/playbook";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "#/ui/dropdown-menu";
import { cn } from "#/utils/cn";

/**
 * Top bar: run state on the left, right-aligned pill controls.
 *
 * Everything here is about the CURRENT VIEW's data. Per-operator preferences —
 * theme, sidebar collapse — live in the sidebar footer beside the account,
 * because they belong to the operator rather than to what is on screen.
 *
 * Every control opens something. A chevron that opens nothing is the product
 * telling the operator a menu exists when it does not.
 */

/**
 * Delivery targets. Closed vocabulary from DATA-CONTRACTS-V2.md:275
 * (`target_kind 'zip' | 'github_pr' | 'github_push'`). Not invented, and not
 * extendable here — a fourth target is a contract change.
 */
const TARGETS = ["zip", "github_pr", "github_push"] as const;
type Target = (typeof TARGETS)[number];

const GATE_FILTER_ALL = "All gates";

/** Shared pill chrome. Reference `.ctl`. */
const CTL =
	"interactive inline-flex items-center gap-2 rounded-full border border-[var(--elevation-border-rest)] bg-app-panel px-3 py-1.5 text-xs text-text-muted hover:border-[var(--elevation-border-raised)] hover:text-text max-md:min-h-11";

function Chevron() {
	return (
		<ChevronDown
			aria-hidden="true"
			className="opacity-70 transition-transform duration-[var(--duration-micro)] group-data-[state=open]:rotate-180"
			size={12}
			strokeWidth={2.4}
		/>
	);
}

/** A pill that opens a real menu. aria-expanded comes from Radix. */
function MenuControl({
	label,
	testId,
	children,
}: {
	label: string;
	testId: string;
	children: ReactNode;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger className={cn(CTL, "group")} data-testid={testId}>
				{label}
				<Chevron />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" data-testid={`${testId}-menu`}>
				{children}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function TopBar({
	breadcrumb,
	activity = "idle",
	onOpenNav,
	navTriggerRef,
}: {
	breadcrumb: string;
	/**
	 * Supplied only below the compact breakpoint, where the sidebar is a
	 * drawer. Distinct from sidebar-collapse, which is a desktop control for
	 * the rail and means a different thing.
	 */
	onOpenNav?: () => void;
	/** Held by the shell so the drawer can hand focus back on close. */
	navTriggerRef?: RefObject<HTMLButtonElement | null>;
	/**
	 * Whether a run is actually in progress. Defaults to idle, because zero
	 * missions have run. The dot only pulses when something is happening — an
	 * animation next to "No run in progress" reads as activity where there is
	 * none.
	 */
	activity?: "idle" | "running";
}) {
	const [gateFilter, setGateFilter] = useState<string>(GATE_FILTER_ALL);
	const [target, setTarget] = useState<Target>("github_pr");
	const running = activity === "running";

	return (
		<header
			className="flex flex-wrap items-center gap-3 border-b border-[var(--elevation-border-rest)] px-6 py-3.5"
			data-testid="topbar"
		>
			{onOpenNav ? (
				<button
					aria-label="Open navigation"
					className="interactive -ml-2 flex size-11 shrink-0 items-center justify-center rounded-sm text-text-muted md:hidden"
					data-testid="nav-drawer-trigger"
					onClick={onOpenNav}
					ref={navTriggerRef}
					type="button"
				>
					<PanelLeft aria-hidden="true" size={18} strokeWidth={1.8} />
				</button>
			) : null}

			{/* Reports state, does not act on it. A span, not a button. */}
			<span
				className="inline-flex items-center gap-2 rounded-full border border-[var(--elevation-border-rest)] bg-app-panel px-3 py-1 text-xs text-text-muted"
				data-activity={activity}
				data-testid="live-pill"
			>
				<span
					aria-hidden="true"
					className={cn(
						"size-1.5 rounded-full",
						running ? "animate-pulse bg-gate-pass" : "bg-text-subtle",
					)}
					data-testid="live-dot"
				/>
				{breadcrumb}
			</span>

			<span aria-hidden="true" className="flex-1" data-testid="topbar-spacer" />

			<MenuControl label={gateFilter} testId="control-gates">
				<DropdownMenuLabel>Filter by gate</DropdownMenuLabel>
				<DropdownMenuItem
					data-testid="gate-option-all"
					onSelect={() => setGateFilter(GATE_FILTER_ALL)}
				>
					{GATE_FILTER_ALL}
				</DropdownMenuItem>
				{/* The five real gates, from the golden fixture's playbook. */}
				{FULL_BUILD_GATES.map((gate) => (
					<DropdownMenuItem
						data-testid={`gate-option-${gate.name}`}
						key={gate.name}
						onSelect={() => setGateFilter(gate.name)}
					>
						<span className="font-mono">{gate.name}</span>
						<span className="ml-auto text-micro text-text-subtle">
							{gate.policy}
						</span>
					</DropdownMenuItem>
				))}
			</MenuControl>

			<MenuControl label={target} testId="control-target">
				<DropdownMenuLabel>Delivery target</DropdownMenuLabel>
				{TARGETS.map((kind) => (
					<DropdownMenuItem
						data-testid={`target-option-${kind}`}
						key={kind}
						onSelect={() => setTarget(kind)}
					>
						<span className="font-mono">{kind}</span>
						{kind === target ? (
							<span className="ml-auto text-micro text-text-subtle">
								current
							</span>
						) : null}
					</DropdownMenuItem>
				))}
			</MenuControl>
		</header>
	);
}
