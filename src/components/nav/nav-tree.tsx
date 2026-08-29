import { Link, type LinkProps } from "@tanstack/react-router";

import { cn } from "#/components/cn";
import {
	DEVICE_LABEL,
	type NavItem,
	type NavTreeProps,
} from "#/contract/ui/nav";

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
			className="size-(--icon-inline) shrink-0 opacity-90"
			strokeWidth={1.8}
		/>
	);
}

const ROW = "flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-xs";

function Row({ item }: { item: NavItem }) {
	const label = (
		<span className="truncate" title={DEVICE_LABEL[item.device]}>
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
				className={cn(ROW, "text-text-subtle")}
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
				"interactive text-text-muted",
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
					className="ml-auto font-mono text-micro text-text-subtle"
					data-testid={`${testId(item.label)}-badge`}
				>
					{item.badge}
				</span>
			) : null}
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
						className="px-2 pb-1.5 font-mono text-micro font-medium tracking-wide text-text-muted uppercase"
						data-testid={`nav-group-${group.label.toLowerCase()}`}
					>
						{group.label}
					</p>
					{group.items.map((item) => (
						<Row item={item} key={item.label} />
					))}
				</div>
			))}
		</div>
	);
}
