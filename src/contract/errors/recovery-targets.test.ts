import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ERROR_MAP } from "#/contract/errors/error-map";
import { ERROR_CODES } from "#/contract/shared/errors";

/**
 * Every `link` recovery must point at a route that exists.
 *
 * WRITTEN BECAUSE TWO DID NOT. REPO_NO_ACCESS and CONNECTION_REVOKED both
 * offered "Open connections" and navigated to `/login`, while
 * `settings.connections.tsx` had existed the whole time. The label named one
 * destination and the href named another.
 *
 * It stayed invisible because NOTHING RENDERED THE RECOVERY. A wrong target in
 * a table that no screen reads costs nothing and shows nothing; it becomes a
 * real defect the moment a screen honours it, which is exactly when it is least
 * expected — the map had been "working" for weeks. Found by avel-71 wiring
 * ErrorState's action slot, not by anyone reading this file.
 *
 * The check derives the route list from `createFileRoute()` calls on disk
 * rather than from a hardcoded set, so adding a route needs no edit here and
 * DELETING one turns the recoveries that depended on it red.
 */

function registeredRoutes(): Set<string> {
	const root = path.resolve("src/routes");
	const found = new Set<string>();

	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
				continue;
			}
			if (!entry.name.endsWith(".tsx")) continue;
			for (const m of readFileSync(full, "utf8").matchAll(
				/createFileRoute\("([^"]+)"\)/g,
			)) {
				// Routes register under the `_app` pathless layout; a link href
				// does not carry it. Normalise so the two are comparable.
				const declared = (m[1] as string).replace(/^\/_app/, "");
				found.add(declared === "" ? "/" : declared.replace(/\/$/, "") || "/");
			}
		}
	};

	walk(root);
	return found;
}

describe("error map recovery targets", () => {
	const routes = registeredRoutes();

	it("finds the routes it is checking against", () => {
		// A non-empty guard: an empty set would make every assertion below pass
		// vacuously, which is the failure mode of any check that scans the disk.
		expect(routes.size).toBeGreaterThan(5);
		expect(routes).toContain("/settings/connections");
	});

	it("points every link recovery at a route that exists", () => {
		const broken = ERROR_CODES.flatMap((code) => {
			const r = ERROR_MAP[code].recovery;
			if (r.kind !== "link") return [];
			return routes.has(r.to) ? [] : [`${code} -> ${r.to}`];
		});

		expect(
			broken,
			"link recoveries pointing at routes that do not exist",
		).toEqual([]);
	});

	/**
	 * The half a route check cannot see. "Open connections" navigating to a real
	 * page that happens to be the sign-in screen would pass the check above —
	 * the target existed, it was simply the wrong one. So the two codes whose
	 * label promises connections are pinned to the connections route by name.
	 */
	it("sends the connection failures to connections, not to sign-in", () => {
		for (const code of ["REPO_NO_ACCESS", "CONNECTION_REVOKED"] as const) {
			const r = ERROR_MAP[code].recovery;
			expect(r.kind).toBe("link");
			if (r.kind !== "link") continue;
			expect(r.label.toLowerCase()).toContain("connection");
			expect(r.to).toBe("/settings/connections");
		}
	});
});
