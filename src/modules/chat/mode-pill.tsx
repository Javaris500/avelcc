import type { LucideIcon } from "lucide-react";
import { ChevronDown, Eye, Pencil, Route } from "lucide-react";
import {
	CHAT_MODES,
	type ChatMode,
	type ChatModeId,
	modeById,
} from "#/modules/chat/modes";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "#/ui/dropdown-menu";
import { cn } from "#/utils/cn";

/**
 * The mode pill, which is the agent's permission gate.
 *
 * UI-PLAN section 10, and the most useful idea in either reference image.
 * Section 6 rules that read-only tools ship first and write tools do not ride
 * along; on its own that reads as a limitation. On the pill it is the product
 * saying what the agent is allowed to do, in a control the operator can see and
 * has to deliberately raise. Section 12's rule applied in the other direction:
 * never let a control do more than it appears to.
 *
 * `Act` IS DISABLED, WITH ITS REASON PRINTED IN THE MENU. Not hidden, not
 * silently inert. The reason is on the row rather than in a tooltip, because a
 * disabled control whose explanation is behind a hover is a disabled control
 * with no explanation, and the operator this is designed for is not technical.
 *
 * The mode morph in the reference is decoration and is not built. Section 10
 * says so itself: ship the send and stop swap, treat the mode and model morphs
 * as optional. The dropdown opens, which is the part that has to work.
 */

const ICON: Record<ChatModeId, LucideIcon> = {
	ask: Eye,
	plan: Route,
	act: Pencil,
};

/** Shared pill chrome, matching the top bar's `.ctl`. One vocabulary. */
const PILL =
	"interactive inline-flex items-center gap-2 rounded-full border border-[var(--elevation-border-rest)] bg-app-panel px-3 py-1.5 text-xs text-text-muted hover:border-[var(--elevation-border-raised)] hover:text-text max-md:min-h-11";

export function ModePill({
	mode,
	onChange,
}: {
	mode: ChatModeId;
	onChange: (mode: ChatModeId) => void;
}) {
	const current = modeById(mode);
	const Icon = ICON[current.id];

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label={`Agent mode: ${current.label}`}
				className={cn(PILL, "group")}
				data-mode={current.id}
				data-testid="chat-mode-pill"
			>
				<Icon aria-hidden="true" size={12} strokeWidth={2} />
				{current.label}
				<ChevronDown
					aria-hidden="true"
					className="opacity-70 transition-transform duration-[var(--duration-micro)] ease-[var(--ease-avel)] group-data-[state=open]:rotate-180 motion-reduce:transition-none"
					size={12}
					strokeWidth={2.4}
				/>
			</DropdownMenuTrigger>

			<DropdownMenuContent
				align="start"
				className="max-w-[42ch]"
				data-testid="chat-mode-menu"
				side="top"
			>
				<DropdownMenuLabel>What the agent may do</DropdownMenuLabel>
				{CHAT_MODES.map((entry) => (
					<ModeRow
						key={entry.id}
						mode={entry}
						onSelect={() => onChange(entry.id)}
						selected={entry.id === current.id}
					/>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function ModeRow({
	mode,
	selected,
	onSelect,
}: {
	mode: ChatMode;
	selected: boolean;
	onSelect: () => void;
}) {
	const Icon = ICON[mode.id];

	return (
		<DropdownMenuItem
			className="items-start"
			data-selected={selected}
			data-testid={`chat-mode-${mode.id}`}
			disabled={!mode.available}
			onSelect={mode.available ? onSelect : undefined}
		>
			<Icon aria-hidden="true" className="mt-0.5" size={14} strokeWidth={1.8} />
			<span className="flex flex-col gap-0.5">
				<span className="flex items-center gap-2">
					<span className="font-medium text-text">{mode.label}</span>
					<span className="font-mono text-micro text-text-subtle">
						{mode.tools}
					</span>
					{selected ? (
						<span
							aria-hidden="true"
							className="font-mono text-micro text-accent-text"
						>
							current
						</span>
					) : null}
				</span>
				<span className="text-xs leading-relaxed text-text-muted">
					{mode.summary}
				</span>
				<span className="text-xs leading-relaxed text-text-subtle">
					{mode.confirmation}
				</span>
				{/*
				  The reason lives on the row, always visible, never in a tooltip.
				  A mode you cannot yet select is honest; one that is greyed with
				  no explanation is the product refusing without saying why.
				*/}
				{mode.available ? null : (
					<span
						className="text-xs leading-relaxed text-gate-warn"
						data-testid={`chat-mode-${mode.id}-reason`}
					>
						{mode.unavailableReason}
					</span>
				)}
			</span>
		</DropdownMenuItem>
	);
}
