/**
 * TEST HARNESS — not shipped, not imported by the app.
 *
 * Renders <NavTree> in a real browser so its keyboard contract can be verified
 * against a real DOM. It exists because this session's mount is
 * src/components/nav/** : adding a route or a playwright.config.ts would be a
 * write outside it, and the app's own nav slot is still a placeholder owned by
 * another session. Documented workaround, filed as a blocker, not a shortcut.
 *
 * Delete this directory once sidebar.tsx renders <NavTree> and the spec can
 * drive the real page instead.
 */
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { Rocket } from "lucide-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { NAV } from "#/components/nav/nav";
import { NavTree } from "#/components/nav/nav-tree";

const rootRoute = createRootRoute({
	component: () => (
		<div style={{ padding: 16, width: 240 }}>
			<NavTree groups={NAV} />
			{/* Badge branch. NAV itself carries no badge: the real mission count
			    is zero and the seam says a zero badge is omitted. */}
			<div id="badge-fixture">
				<NavTree
					groups={[
						{
							label: "Probe",
							items: [
								{
									label: "Badge probe",
									to: "/missions",
									icon: Rocket,
									device: "capture",
									built: true,
									badge: 3,
								},
							],
						},
					]}
				/>
			</div>
			<Outlet />
		</div>
	),
});

const missionsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/missions",
	component: () => null,
});

const router = createRouter({
	routeTree: rootRoute.addChildren([missionsRoute]),
	history: createMemoryHistory({ initialEntries: ["/missions"] }),
});

const el = document.getElementById("root");
if (el) {
	createRoot(el).render(
		<StrictMode>
			<RouterProvider router={router} />
		</StrictMode>,
	);
}
