import {
	Activity,
	BookMarked,
	Bookmark,
	Building2,
	GitBranch,
	House,
	Inbox,
	Layers,
	Library,
	Plug,
	Rocket,
	UserCog,
	Users,
} from "lucide-react";

import type { NavGroup } from "#/contract/ui/nav";

/**
 * The sidebar model. Item set and placement transcribed from ROUTES.md, which
 * owns the information architecture; the visual treatment comes from
 * avel-cc-shell.html, which owns nothing about which items exist.
 *
 * Where the two disagree, ROUTES.md wins and the divergence is reported rather
 * than reconciled here. See the session report: the reference carries a
 * `Terminal` item with no route behind it, hoists Roster and Exports to top
 * level when ROUTES.md nests both under /missions/:id, and offers single
 * `Catalog` and `Settings` entries where ROUTES.md has only leaves.
 *
 * `built: false` is the honest default. Only routes that exist on disk are
 * marked built, checked against src/routes/ rather than against ROUTES.md's
 * status line — a nav item linking to a route that does not exist is "looks
 * finished but isn't" shipping inside the product.
 *
 * `device` mirrors the route metadata for the sidebar glyph. The route's own
 * staticData stays authoritative.
 */
export const NAV: NavGroup[] = [
	{
		label: "Work",
		items: [
			{
				label: "Home",
				to: "/",
				icon: House,
				device: "capture",
				built: true,
			},
			{
				label: "Missions",
				to: "/missions",
				icon: Rocket,
				device: "capture",
				built: true,
			},
			{
				label: "Clients",
				icon: Building2,
				device: "construction",
				built: false,
			},
			{ label: "Intake", icon: Inbox, device: "capture", built: false },
		],
	},
	{
		label: "Library",
		items: [
			{
				label: "Agent templates",
				icon: Users,
				device: "construction",
				built: false,
			},
			{ label: "Skills", icon: Library, device: "construction", built: false },
			{ label: "Sources", icon: Layers, device: "construction", built: false },
			{
				label: "Presets",
				icon: Bookmark,
				device: "construction",
				built: false,
			},
			{
				label: "Playbooks",
				icon: BookMarked,
				device: "construction",
				built: false,
			},
		],
	},
	{
		label: "System",
		items: [
			{ label: "Activity", icon: Activity, device: "capture", built: false },
			{
				label: "Repositories",
				icon: GitBranch,
				device: "construction",
				built: false,
			},
			{
				label: "Connections",
				icon: Plug,
				device: "construction",
				built: false,
			},
			{ label: "Account", icon: UserCog, device: "capture", built: false },
		],
	},
];
