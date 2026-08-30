import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { withMethodGuard } from "#/modules/http/shielded";

/**
 * An unhandled method must not fall through to the page renderer.
 *
 * WRITTEN BECAUSE IT SHIPPED, on every API route at once. A verb a route did
 * not implement was not matched by any handler, so the request fell through to
 * SSR and came back as `200 text/html` — an HTML page, with a SUCCESS status,
 * for a request that did nothing. `DELETE /api/missions` answered 200.
 *
 * A caller checking `res.ok` on a write believed it landed. That is the whole
 * severity: not that the response was wrong, but that it was wrong in the
 * direction of looking fine.
 *
 * NO TEST COULD HAVE CAUGHT IT, and that is the part worth keeping. Every test
 * in this suite calls the method its route implements, which is the natural
 * thing to write and leaves the complement of the API surface unexercised.
 * Found by a person probing verbs by hand during verification.
 */

function apiRouteFiles(): string[] {
	const root = path.resolve("src/routes/api");
	const out: string[] = [];
	const walk = (dir: string) => {
		for (const e of readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, e.name);
			if (e.isDirectory()) walk(full);
			else if (e.name.endsWith(".ts")) out.push(full);
		}
	};
	walk(root);
	return out;
}

describe("every API route guards its methods", () => {
	const files = apiRouteFiles();

	it("finds the routes it is checking", () => {
		// Non-empty guard: an empty scan makes the assertion below pass on
		// nothing, which is how a check like this quietly stops working.
		expect(files.length).toBeGreaterThan(10);
	});

	/**
	 * Derived from the directory rather than a list, so a NEW route is covered
	 * the moment it exists. A hardcoded set would leave exactly the untested
	 * gap this bug lived in — the sixteenth route was as vulnerable as the
	 * first, and a seventeenth would be too.
	 */
	it("wraps every handler block in withMethodGuard", () => {
		/**
		 * Matches the CALL SITE, not the identifier. The first version of this
		 * checked whether the file contained the string "withMethodGuard"
		 * anywhere — which the IMPORT line satisfies, so removing the actual
		 * call left the test green. Caught by a negative control, which is the
		 * only reason it is not still wrong: a check that answers a narrower
		 * question than the claim it supports.
		 */
		const unguarded = files
			.filter((f) => readFileSync(f, "utf8").includes("handlers:"))
			.filter(
				(f) => !/handlers:\s*withMethodGuard\(/.test(readFileSync(f, "utf8")),
			)
			.map((f) => path.relative(path.resolve("src/routes/api"), f));

		expect(
			unguarded,
			"API routes whose unhandled methods fall through to the page renderer",
		).toEqual([]);
	});
});

describe("withMethodGuard", () => {
	const ok = () => new Response("served");

	it("leaves the served methods alone", async () => {
		const g = withMethodGuard({ GET: ok });
		const res = await g.GET?.({ request: new Request("http://x/") });
		expect(res?.status).toBe(200);
		expect(await res?.text()).toBe("served");
	});

	it("answers 405 for a method the route does not serve", async () => {
		const g = withMethodGuard({ GET: ok });
		for (const m of ["POST", "PUT", "PATCH", "DELETE"] as const) {
			const res = await g[m]?.({ request: new Request("http://x/") });
			expect(res?.status).toBe(405);
		}
	});

	/**
	 * The header is the only machine-readable part of a 405, and the spec
	 * requires it. It is built from the methods actually served rather than
	 * from a constant, so a route that gains POST advertises it without anyone
	 * remembering to update a string.
	 */
	it("sets Allow from the methods actually served", async () => {
		const g = withMethodGuard({ GET: ok, POST: ok });
		const res = await g.DELETE?.({ request: new Request("http://x/") });
		expect(res?.headers.get("Allow")).toBe("GET, POST");
	});

	/**
	 * JSON, not HTML. Every other API response is an envelope, and a caller
	 * that parses the body must not receive a page — which is precisely what
	 * the fallthrough returned.
	 */
	it("returns the error envelope, not a page", async () => {
		const g = withMethodGuard({ GET: ok });
		const res = await g.POST?.({ request: new Request("http://x/") });
		expect(res?.headers.get("content-type")).toContain("application/json");
		const body = (await res?.json()) as {
			success: boolean;
			error: { code: string; requestId: string };
		};
		expect(body.success).toBe(false);
		expect(body.error.requestId).toBeTruthy();
	});
});
