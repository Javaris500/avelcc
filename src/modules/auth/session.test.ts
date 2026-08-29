import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { OPERATOR_COOKIE, SESSION_COOKIE } from "#/modules/auth/oauth";

/**
 * These pin an invariant that a silent edit already broke once today.
 *
 * The OAuth callback sets `avel_session` httpOnly so a server can trust it.
 * The client gate reads a DIFFERENT cookie, because script cannot read an
 * httpOnly one. Point them at the same name and every OAuth sign-in succeeds
 * on the server and then bounces at the client gate — with no error, because
 * nothing failed. The page would just refuse to let you in.
 */
describe("session cookie split", () => {
	it("keeps the trusted and display cookies distinct", () => {
		expect(SESSION_COOKIE).not.toBe(OPERATOR_COOKIE);
	});

	it("has the client gate reading the DISPLAY cookie, never the httpOnly one", () => {
		const src = readFileSync("src/modules/auth/session.ts", "utf8");
		const match = src.match(/const COOKIE = ["']([a-z_]+)["']/);
		expect(match?.[1]).toBe(OPERATOR_COOKIE);
		expect(match?.[1]).not.toBe(SESSION_COOKIE);
	});

	it("marks only the trusted cookie httpOnly", async () => {
		const { cookie } = await import("#/modules/auth/oauth");
		expect(cookie(SESSION_COOKIE, "x", { httpOnly: true })).toContain(
			"HttpOnly",
		);
		expect(cookie(OPERATOR_COOKIE, "x")).not.toContain("HttpOnly");
	});

	it("always sets SameSite and Path, so the cookie is not sent cross-site", async () => {
		const { cookie } = await import("#/modules/auth/oauth");
		expect(cookie("t", "x")).toContain("SameSite=Lax");
		expect(cookie("t", "x")).toContain("Path=/");
	});
});
