import { Link, type LinkProps } from "@tanstack/react-router";
import {
	DEVICE_LABEL,
	type NavItem,
	type NavTreeProps,
} from "#/contract/ui/nav";
import { cn } from "#/utils/cn";

/** Stable across the shim and the seam, so testids do not move when session 2 migrates. */
function testId(label: string): string {
	return `nav-${label.toLowerCase().replace(/\s+/g, "-")}`;
}

/**
 * Icon size 15 and stroke-width 1.8 are the reference's values, not defaults.
 * Lucide is what TECH-STACK names; the reference's inline SVG paths are not
 * copied, only its weight.
 */
function Icon({ item }: { item: NavItem }) {
	const Glyph = item.icon;
	return (
		<Glyph
			aria-hidden="true"
			className={cn(
				"size-(--icon-inline) shrink-0",
				// The availability cue lives here rather than on the label.
				// Tone is fully spent carrying hierarchy — group label, unbuilt
				// item and built item occupy all three steps — so dimming the
				// label to signal availability would cost the legibility that
				// was just won. The icon is aria-hidden decoration, so dimming
				// it costs a screen reader nothing while giving a sighted
				// reader scanning the column an at-a-glance signal. It is a
				// luminance difference, not a hue one, so it survives colour
				// blindness. aria-disabled carries the same fact non-visually.
				item.built ? "opacity-90" : "opacity-[var(--opacity-disabled)]",
			)}
			strokeWidth={1.8}
		/>
	);
}

const ROW = "flex items-center rounded-sm py-1.5 text-xs";
/** Collapsed the row is a 40px icon target; expanded it is an icon plus label. */
const ROW_WIDTH = (collapsed: boolean) =>
	collapsed ? "justify-center px-0" : "gap-2.5 px-2";

function Row({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
	/**
	 * Collapsed, the label is hidden VISUALLY and kept in the accessibility
	 * tree. `display: none` would have removed it, and the row's only other
	 * content is an aria-hidden icon — which would have left every rail item
	 * with no accessible name at all.
	 */
	const label = (
		<span
			className={collapsed ? "sr-only" : "truncate"}
			title={DEVICE_LABEL[item.device]}
		>
			{item.label}
		</span>
	);

	/**
	 * Unbuilt: muted, no href, and removed from the tab order. Enforced by
	 * rendering a span with no tabindex rather than by styling a disabled link
	 * — an item that looks unfocusable while still taking tab focus is that
	 * claim being false.
	 *
	 * NOT --opacity-disabled. The patch's "disabled is opacity, not a colour"
	 * rule is about controls, where a disabled danger button must stay
	 * recognisably danger. An unbuilt item is not a disabled control, it is an
	 * unavailable destination, and eleven of twelve items are in this state:
	 * at 35% it measured 1.71:1 dark and 1.56:1 light, so a reader could not
	 * resolve the information architecture at all. Full opacity in text-subtle
	 * carries the distinction by tone, and the href and tabindex carry the
	 * rest.
	 */
	if (!item.built || !item.to) {
		return (
			<span
				aria-disabled="true"
				className={cn(ROW, ROW_WIDTH(collapsed), "text-text-muted")}
				data-built="false"
				data-testid={testId(item.label)}
				title="Not built yet"
			>
				<Icon item={item} />
				{label}
			</span>
		);
	}

	return (
		<Link
			activeProps={{ "aria-current": "page" }}
			className={cn(
				ROW,
				ROW_WIDTH(collapsed),
				"group interactive relative text-text",
				"aria-[current=page]:bg-app-raised aria-[current=page]:text-text",
			)}
			data-built="true"
			data-testid={testId(item.label)}
			to={item.to as LinkProps["to"]}
		>
			<Icon item={item} />
			{label}
			{item.badge ? (
				<span
					className="ml-auto font-mono text-micro text-text-muted"
					data-testid={`${testId(item.label)}-badge`}
				>
					{item.badge}
				</span>
			) : null}
			{/*
			  THE UNDERGLOW. The active item is lit from below rather than filled,
			  which is the one piece of personality the shell has. Two layers: a
			  hairline of accent along the bottom edge, brightest at the centre and
			  falling to nothing at both ends, and a soft bloom under it.

			  IT BREATHES. The operator asked for glow and pulse explicitly, so the
			  bloom pulses slowly rather than sitting still. It stays quiet enough
			  not to compete with the live dot: the dot is a hard blink reporting
			  that something is RUNNING, this is a slow swell reporting only where
			  you are. Different rhythms, different jobs.

			  Every animated layer carries motion-reduce:animate-none, and the
			  hairline never animates — so with motion reduced the active item is
			  still unmistakably lit, just still.

			  Colour comes from --color-accent, never a literal, so it follows the
			  theme and survives check-tokens.
			*/}
			<span
				aria-hidden="true"
				className={cn(
					"pointer-events-none absolute inset-x-0 bottom-0 opacity-0",
					"transition-opacity duration-[var(--duration-state)] ease-[var(--ease-avel)]",
					"group-aria-[current=page]:opacity-100 motion-reduce:transition-none",
					// A hover pre-light, so the glow reads as a property of the row
					// rather than a decoration that only exists when selected.
					"group-hover:opacity-40",
				)}
				data-testid="nav-underglow"
			>
				{/* The hairline. Static, and the part that survives reduced motion. */}
				<span className="absolute inset-x-2 bottom-0 h-px bg-[linear-gradient(to_right,transparent,var(--color-accent),transparent)]" />
				{/* The bloom, breathing. */}
				<span className="absolute inset-x-4 bottom-0 h-2 animate-pulse rounded-full bg-accent opacity-50 blur-md motion-reduce:animate-none" />
				{/* A wider, dimmer wash that bleeds past the row edges. */}
				<span className="-bottom-1 absolute inset-x-8 h-3 rounded-full bg-accent opacity-25 blur-lg motion-reduce:animate-none" />
			</span>
		</Link>
	);
}

/**
 * The whole interface between this session and the shell frame. Session 2
 * imports NavTree and slots it into the sidebar; nothing else crosses.
 */
export function NavTree({ groups, collapsed = false }: NavTreeProps) {
	return (
		<div
			className="flex flex-col gap-4"
			data-collapsed={collapsed ? "true" : "false"}
			data-testid="nav-tree"
		>
			{groups.map((group) => (
				<div key={group.label}>
					<p
						className={cn(
							"font-mono text-micro font-medium tracking-wide text-text-subtle uppercase",
							collapsed ? "sr-only" : "px-2 pb-1.5",
						)}
						data-testid={`nav-group-${group.label.toLowerCase()}`}
					>
						{group.label}
					</p>
					{group.items.map((item) => (
						<Row collapsed={collapsed} item={item} key={item.label} />
					))}
				</div>
			))}
		</div>
	);
}
