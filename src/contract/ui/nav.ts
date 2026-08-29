import type { LucideIcon } from "lucide-react";

/**
 * THE SEAM between the shell frame and the nav tree.
 *
 * The sidebar contains the nav, so two sessions building those separately
 * would collide on the same rendered result. This file is what stops that:
 * session 2 owns the frame and imports NavTree, session 3 owns the nav data
 * and the component. Neither can change this shape unilaterally.
 *
 * Same argument DATA-CONTRACTS-V2.md:48 makes for the API contract — "the
 * contract lives where neither the backend nor the frontend can edit it
 * unilaterally without the other noticing."
 *
 * OWNED BY SESSION 1. Sessions 2 and 3 import from here and do not edit it.
 * If either needs a shape this does not describe, that is a change request,
 * not a local interface.
 */

/** Per-route device class. ROUTES.md owns which route carries which. */
export type Device = "capture" | "construction" | "approve";

export type NavItem = {
	label: string;
	/** Absent when built is false. An unbuilt item is not navigable. */
	to?: string;
	icon: LucideIcon;
	device: Device;
	/**
	 * False renders the item dimmed, unfocusable and without an href. A nav
	 * item linking to a route that does not exist is "looks finished but isn't"
	 * shipping inside the product, which is the thing CLAUDE.md opens with.
	 */
	built: boolean;
	/** Count pill, as the reference shows on Missions. Omitted when zero. */
	badge?: number;
};

export type NavGroup = {
	label: string;
	items: NavItem[];
};

export type NavTreeProps = {
	groups: NavGroup[];
	/** Reserved for the collapsed rail. Not built today. */
	collapsed?: boolean;
};

export const DEVICE_LABEL: Record<Device, string> = {
	capture: "Works on a phone",
	construction: "Desktop only",
	approve: "Read and approve",
};
