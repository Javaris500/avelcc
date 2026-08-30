import { afterEach, describe, expect, it, vi } from "vitest";

import { shielded, withMethodGuard } from "#/modules/http/shielded";

/**
 * The wrapper six API routes depend on, and until now nothing tested it.
 *
 * That absence is how the archive route stayed unwrapped through a whole round
 * of work: every test we have calls a route the way it is meant to be called,
 * so nothing ever asked what happens when the handler throws. These tests ask.
 *
 * Two properties matter more than the status code. The caught error's MESSAGE
 * must never reach the response, because an exception can carry a connection
 * string or a row's contents. And the requestId in the response must be the one
 * written to the log, or "quote the request id" is advice that leads nowhere.
 */

afterEach(() => {
	vi.restoreAllMocks();
});

const ok = () => Response.json({ success: true, data: "fine" });

describe("shielded", () => {
	it("passes a successful response through untouched", async () => {
		const res = await shielded("test", async () => ok());
		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ success: true, data: "fine" });
	});

	it("turns a throw into the contract's envelope, not a framework 500", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const res = await shielded("test", async () => {
			throw new Error("boom");
		});

		expect(res.status).toBe(500);
		const body = await res.json();
		expect(body.success).toBe(false);
		expect(body.error.code).toBe("INTERNAL_ERROR");
		// The defect this replaced: an unhandled throw answered with
		// `{"status":500,"unhandled":true}` and nothing to switch on.
		expect(body).not.toHaveProperty("unhandled");
	});

	it("NEVER puts the caught error's message in the response", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		// The shape of a real leak: a driver error quoting the connection string.
		const secret = "postgres://user:hunter2@db.example/neondb";
		const res = await shielded("test", async () => {
			throw new Error(`connect ECONNREFUSED ${secret}`);
		});

		const text = await res.text();
		expect(text).not.toContain(secret);
		expect(text).not.toContain("hunter2");
		expect(text).not.toContain("ECONNREFUSED");
	});

	it("logs the same requestId it returns, so quoting it finds the failure", async () => {
		const logged: unknown[][] = [];
		vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
			logged.push(args);
		});

		const res = await shielded("archive read", async () => {
			throw new Error("boom");
		});
		const body = await res.json();

		expect(logged).toHaveLength(1);
		const line = String(logged[0]?.[0]);
		expect(line).toContain(body.error.requestId);
		// And it names WHICH call failed, so a log line is attributable.
		expect(line).toContain("archive read");
	});

	it("catches a rejection as well as a synchronous throw", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const res = await shielded("test", () => Promise.reject(new Error("nope")));
		expect(res.status).toBe(500);
	});

	it("catches a thrown non-Error, which a driver can produce", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const res = await shielded("test", async () => {
			// Not an Error instance: a driver or a library can throw anything.
			throw "a bare string";
		});
		expect(res.status).toBe(500);
		const body = await res.json();
		expect(body.error.code).toBe("INTERNAL_ERROR");
	});
});

describe("withMethodGuard", () => {
	const req = (method: string) =>
		({ request: new Request("http://x/api/thing", { method }) }) as {
			request: Request;
		};

	it("leaves a served method alone", async () => {
		const guarded = withMethodGuard({ GET: () => ok() });
		const res = await guarded.GET?.(req("GET"));
		expect(res?.status).toBe(200);
	});

	it("answers an unserved method 405 rather than 200 with an HTML page", async () => {
		// The defect: an unhandled verb fell through to the SSR renderer and
		// returned `200 text/html`, so a caller checking only res.ok believed its
		// write had landed.
		const guarded = withMethodGuard({ GET: () => ok() });
		const res = await guarded.POST?.(req("POST"));

		expect(res?.status).toBe(405);
		expect(res?.headers.get("content-type")).toContain("application/json");
	});

	it("sets Allow to exactly the methods served", async () => {
		const guarded = withMethodGuard({ GET: () => ok(), POST: () => ok() });
		const res = await guarded.DELETE?.(req("DELETE"));

		// The only machine-readable part of a 405, and the spec requires it.
		expect(res?.headers.get("Allow")).toBe("GET, POST");
	});

	it("fills in every method a route does not serve", () => {
		const guarded = withMethodGuard({ GET: () => ok() });
		for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE"] as const) {
			expect(guarded[m]).toBeDefined();
		}
	});
});
