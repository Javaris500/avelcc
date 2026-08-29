import { expect, test } from "@playwright/test";

/**
 * The nav's contract, verified against the running app.
 *
 * Drives the real page: src/components/shell/sidebar.tsx renders
 * <NavTree groups={navGroups ?? NAV} />, so what is asserted here is the
 * component as a user meets it, not a harness approximation.
 */

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

/** The gate reads a script-readable cookie. Setting it is the whole sign-in. */
test.beforeEach(async ({ context, page }) => {
	await context.addCookies([
		{
			name: "avel_operator",
			value: "javaris@avelco.dev",
			domain: "localhost",
			path: "/",
		},
	]);
	await page.goto("/missions");
	await expect(page.getByTestId("nav-tree")).toBeVisible();
});

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

test("tabbing the real page reaches every built item and skips every unbuilt one", async ({
	page,
}) => {
	const seen = new Set<string>();
	for (let i = 0; i < 40; i += 1) {
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
	expect(await page.getByTestId("nav-tree").locator("svg").count()).toBe(
		BUILT.length + UNBUILT.length,
	);
});

/**
 * The real mission count is zero — _app/missions.tsx resolves to an empty
 * list — and the seam says a zero badge is omitted rather than rendered as
 * "0". The badge-present branch has no vehicle on the real page because no
 * item legitimately carries a count yet; see the session report.
 */
test("no badge renders while the real count is zero", async ({ page }) => {
	await expect(page.getByTestId("nav-missions-badge")).toHaveCount(0);
});

test("every interactive element in the sidebar carries a data-testid", async ({
	page,
}) => {
	const missing = await page
		.getByTestId("sidebar")
		.evaluate((root) =>
			[...root.querySelectorAll("a, button, [tabindex]:not([tabindex='-1'])")]
				.filter((el) => !el.getAttribute("data-testid"))
				.map((el) => el.tagName),
		);
	expect(missing).toEqual([]);
});
