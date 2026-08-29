import { defineConfig, devices } from "@playwright/test";

/**
 * Browser verification, committed so it is a MECHANISM rather than an
 * attestation.
 *
 * Three of today's defects passed a green build: a stylesheet disabled by a
 * stray comment terminator, every dark-theme token tree-shaken away, and every
 * border in the app staying dark grey in light mode. None were visible to
 * tsc, vitest or the build. All three were found by driving the real page and
 * reading computed styles out of the DOM.
 *
 * CONVENTION: specs are named *.e2e.spec.ts and live BESIDE the code they
 * cover, inside that session's own mount. vitest includes only *.test.ts, so
 * the two suites never collide and no session needs a widened mount to write
 * a browser test for its own component.
 *
 *   src/components/nav/nav.e2e.spec.ts        session 3
 *   src/components/shell/shell.e2e.spec.ts    session 2
 *   src/routes/login.e2e.spec.ts              session 1
 */
export default defineConfig({
	testDir: "./src",
	testMatch: "**/*.e2e.spec.ts",
	// SERIAL, deliberately. Against this dev server parallel workers start runs
	// mid-rebuild and produce scattered "element not visible" failures that read
	// exactly like real defects. Confirmed twice, from two sessions: the same
	// specs pass serially. A suite that cries wolf gets ignored, and these are
	// the only checks that catch the defects a green build cannot see.
	fullyParallel: false,
	workers: 1,
	// A committed .only silently shrinks the suite to one test while still
	// reporting green.
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? "github" : "list",
	use: {
		baseURL: "http://localhost:3000",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: "pnpm dev",
		url: "http://localhost:3000",
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
