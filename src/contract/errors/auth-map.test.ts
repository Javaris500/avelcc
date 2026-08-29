import { describe, expect, it } from "vitest";

import { AUTH_ERROR_MAP } from "#/contract/errors/auth-map";
import { AUTH_CODES, ERROR_CODES } from "#/contract/shared/errors";

describe("auth error map", () => {
	it("covers every auth code, with none left over", () => {
		expect(Object.keys(AUTH_ERROR_MAP).sort()).toEqual([...AUTH_CODES].sort());
	});

	it("stays a separate vocabulary from the export codes", () => {
		for (const a of AUTH_CODES) {
			expect(ERROR_CODES).not.toContain(
				a as unknown as (typeof ERROR_CODES)[number],
			);
		}
	});

	it("never reveals which half of the credential was wrong", () => {
		const { title, body } = AUTH_ERROR_MAP.INVALID_CREDENTIALS;
		const text = `${title} ${body}`.toLowerCase();
		// A message naming the email alone is a user-enumeration oracle.
		expect(text).not.toMatch(
			/no account|unknown email|email not found|user not found/,
		);
		expect(text).toContain("do not match");
	});

	it("names both env vars when OAuth is unconfigured, so the fix is actionable", () => {
		const { body } = AUTH_ERROR_MAP.OAUTH_NOT_CONFIGURED;
		expect(body).toContain("GITHUB_CLIENT_ID");
		expect(body).toContain("GITHUB_CLIENT_SECRET");
	});
});
