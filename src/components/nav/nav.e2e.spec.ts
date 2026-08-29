import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, type Page, test } from "@playwright/test";

/**
 * The nav's contract, verified in a real browser.
 *
 * MOUNT NOTE. This session may write only src/components/nav/**, so:
 *   - the spec lives beside the component instead of in e2e/
 *   - there is no playwright.config.ts, because the repo root is not in scope
 *   - the component is mounted from an in-mount harness rather than a route
 * All three are documented workarounds, filed as blockers, not absorbed. Run:
 *
 *   npx playwright test src/components/nav/nav.e2e.spec.ts --browser=chromium
 *
 * WHY A HARNESS. src/components/shell/sidebar.tsx renders an empty `nav-slot`
 * placeholder and says NavTree replaces it. That file is session 2's mount, so
 * this session cannot wire the nav into the running app. The harness mounts the
 * real component in a real browser with a real router so the keyboard contract
 * is verified against a real DOM rather than asserted.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const OUT = path.join(process.env.TMPDIR ?? "/tmp", "avel-nav-harness");

let bundle = "";

test.beforeAll(async () => {
	const { build } = await import("vite");
	const react = (await import("@vitejs/plugin-react")).default;
	await build({
		configFile: false,
		root: ROOT,
		logLevel: "error",
		plugins: [react()],
		resolve: { alias: { "#": path.join(ROOT, "src") } },
		// React reads this at module scope; an IIFE bundle has no process shim.
		define: { "process.env.NODE_ENV": '"production"' },
		build: {
			outDir: OUT,
			emptyOutDir: true,
			minify: false,
			target: "es2022",
			lib: {
				entry: path.join(HERE, "__harness__/harness.tsx"),
				formats: ["iife"],
				name: "NavHarness",
				fileName: () => "harness.js",
			},
		},
	});
	bundle = await (await import("node:fs/promises")).readFile(
		path.join(OUT, "harness.js"),
		"utf8",
	);
});

async function mount(page: Page) {
	await page.setContent(`<!doctype html><div id="root"></div>`);
	await page.addScriptTag({ content: bundle });
	await expect(page.getByTestId("nav-tree").first()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
	await mount(page);
});

const BUILT = ["Missions"];
const UNBUILT = [
	"Clients",
	"Intake",
	"Agent templates",
	"Skills",
	"Sources",
	"Presets",
	"Playbooks",
	"Activity",
	"Repositories",
	"Connections",
	"Account",
];

const id = (label: string) => `nav-${label.toLowerCase().replace(/\s+/g, "-")}`;

test("every item and group transcribed from ROUTES.md renders", async ({
	page,
}) => {
	for (const label of [...BUILT, ...UNBUILT]) {
		await expect(page.getByTestId(id(label))).toBeVisible();
	}
	for (const group of ["work", "library", "system"]) {
		await expect(page.getByTestId(`nav-group-${group}`)).toBeVisible();
	}
});

test("a built item is a real link and carries its href", async ({ page }) => {
	const missions = page.getByTestId("nav-missions");
	await expect(missions).toHaveAttribute("data-built", "true");
	await expect(missions).toHaveAttribute("href", "/missions");
});

test("an unbuilt item has no href and is marked disabled", async ({ page }) => {
	for (const label of UNBUILT) {
		const item = page.getByTestId(id(label));
		await expect(item).toHaveAttribute("data-built", "false");
		await expect(item).toHaveAttribute("aria-disabled", "true");
		expect(await item.getAttribute("href")).toBeNull();
	}
});

/**
 * THE CLAIM THE DIMMING MAKES. A dimmed item that still takes tab focus is
 * that claim being false, which is the failure CLAUDE.md opens with: it looks
 * finished and is not.
 */
test("no unbuilt item is in the tab order", async ({ page }) => {
	for (const label of UNBUILT) {
		const tabIndex = await page
			.getByTestId(id(label))
			.evaluate((el) => (el as HTMLElement).tabIndex);
		expect(tabIndex, `${label} must not be focusable`).toBe(-1);
	}
});

test("tabbing reaches every built item and skips every unbuilt one", async ({
	page,
}) => {
	const seen = new Set<string>();
	for (let i = 0; i < 30; i += 1) {
		await page.keyboard.press("Tab");
		const testid = await page.evaluate(
			() => document.activeElement?.getAttribute("data-testid") ?? null,
		);
		if (testid) seen.add(testid);
	}
	for (const label of BUILT) {
		expect([...seen], `${label} must be keyboard reachable`).toContain(
			id(label),
		);
	}
	for (const label of UNBUILT) {
		expect([...seen], `${label} must be skipped`).not.toContain(id(label));
	}
});

test("the active item is marked aria-current=page", async ({ page }) => {
	await expect(page.getByTestId("nav-missions")).toHaveAttribute(
		"aria-current",
		"page",
	);
	await expect(page.getByTestId("nav-clients")).not.toHaveAttribute(
		"aria-current",
		"page",
	);
});

test("icons render at the reference weight, from lucide", async ({ page }) => {
	const svg = page.getByTestId("nav-missions").locator("svg");
	await expect(svg).toHaveAttribute("width", "15");
	await expect(svg).toHaveAttribute("height", "15");
	await expect(svg).toHaveAttribute("stroke-width", "1.8");
	await expect(svg).toHaveAttribute("aria-hidden", "true");
	expect(
		await page.getByTestId("nav-tree").first().locator("svg").count(),
	).toBe(BUILT.length + UNBUILT.length);
});

test("a badge renders when present and is omitted when the count is zero", async ({
	page,
}) => {
	const probe = page.getByTestId("nav-badge-probe-badge");
	await expect(probe).toBeVisible();
	await expect(probe).toHaveText("3");
	// NAV carries no badge: the real mission count is zero, and the seam says
	// a zero badge is omitted rather than rendered as "0".
	await expect(page.getByTestId("nav-missions-badge")).toHaveCount(0);
});

test("every interactive element carries a data-testid", async ({ page }) => {
	const missing = await page.evaluate(() =>
		[...document.querySelectorAll("a, button, [tabindex]:not([tabindex='-1'])")]
			.filter((el) => !el.getAttribute("data-testid"))
			.map((el) => el.tagName),
	);
	expect(missing).toEqual([]);
});
