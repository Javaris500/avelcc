import { expect, test } from "@playwright/test";

/**
 * The nav's contract, verified against the running app.
 *
 * Drives the real page: src/components/shell/sidebar.tsx renders
 * <NavTree groups={navGroups ?? NAV} />, so what is asserted here is the
 * component as a user meets it, not a harness approximation.
 */

/** Built items and the href each must carry. */
const BUILT: Record<string, string> = {
	Home: "/",
	Missions: "/missions",
	Clients: "/clients",
	"Agent templates": "/catalog/agents",
	Skills: "/catalog/skills",
	Sources: "/catalog/sources",
	Presets: "/presets",
	Playbooks: "/playbooks",
	Activity: "/activity",
	Repositories: "/settings/repositories",
	Connections: "/settings/connections",
	Account: "/settings/account",
};
const BUILT_LABELS = Object.keys(BUILT);
/**
 * Empty today: every route in the nav now exists. The unbuilt assertions below
 * are SKIPPED rather than left to pass over an empty set — a test that passes
 * over nothing is the assertion-free green suite CLAUDE.md warns about, and it
 * reports success for a branch it never touched.
 *
 * Nothing is held artificially unbuilt to keep them alive. That would be
 * inventing product state to keep a test green, which is the same refusal as
 * the fabricated badge count.
 *
 * They do NOT revive on their own, and an earlier version of this comment
 * claimed they did. The skip is keyed on THIS array, which is hand-maintained,
 * so an unbuilt item appearing in NAV leaves them skipped. Verified by
 * mutation: flipping one item back to unbuilt left all three skipped.
 *
 * What actually catches it is the drift guard at the bottom of this file — it
 * fails the moment these lists disagree with the rendered nav, and updating
 * them to clear that failure is what revives these three. Two steps, one of
 * them forced by a red test, rather than one automatic step.
 */
const UNBUILT: string[] = [];

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
	for (const label of [...BUILT_LABELS, ...UNBUILT]) {
		await expect(page.getByTestId(id(label))).toBeVisible();
	}
	for (const group of ["work", "library", "system"]) {
		await expect(page.getByTestId(`nav-group-${group}`)).toBeVisible();
	}
});

test("every built item is a real link and carries its href", async ({
	page,
}) => {
	for (const [label, href] of Object.entries(BUILT)) {
		const item = page.getByTestId(id(label));
		await expect(item).toHaveAttribute("data-built", "true");
		await expect(item).toHaveAttribute("href", href);
	}
});

test("an unbuilt item has no href and is marked disabled", async ({ page }) => {
	test.skip(UNBUILT.length === 0, "no unbuilt items exist today");
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
	test.skip(UNBUILT.length === 0, "no unbuilt items exist today");
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
	for (const label of BUILT_LABELS) {
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

test("icons render at the inline icon size, from lucide", async ({ page }) => {
	const svg = page.getByTestId("nav-missions").locator("svg");
	// Asserted as a computed size, not an attribute: the size comes from
	// --icon-inline, so this also proves the token resolves rather than
	// falling back to lucide's 24px default.
	await expect(svg).toHaveCSS("width", "14px");
	await expect(svg).toHaveCSS("height", "14px");
	await expect(svg).toHaveAttribute("stroke-width", "1.8");
	await expect(svg).toHaveAttribute("aria-hidden", "true");
	expect(await page.getByTestId("nav-tree").locator("svg").count()).toBe(
		BUILT_LABELS.length + UNBUILT.length,
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

/**
 * Ruling: an unbuilt item is an unavailable destination, not a disabled
 * control, so it does not take --opacity-disabled. At 35% it measured 1.71:1
 * dark and 1.56:1 light, and eleven of twelve items are in this state, so a
 * reader could not resolve the information architecture at all.
 */
test("a built icon never reads as unavailable", async ({ page }) => {
	for (const label of BUILT_LABELS) {
		const built = await page.getByTestId(id(label)).evaluate((el) => ({
			label: getComputedStyle(el).opacity,
			icon: getComputedStyle(el.querySelector("svg") as Element).opacity,
		}));
		expect(built.label).toBe("1");
		expect(built.icon, `${label} icon must not read as unavailable`).toBe(
			"0.9",
		);
	}
});

test("an unbuilt label stays legible while its icon carries the cue", async ({
	page,
}) => {
	test.skip(UNBUILT.length === 0, "no unbuilt items exist today");
	for (const label of UNBUILT) {
		const o = await page.getByTestId(id(label)).evaluate((el) => ({
			label: getComputedStyle(el).opacity,
			icon: getComputedStyle(el.querySelector("svg") as Element).opacity,
		}));
		expect(o.label, `${label} label must stay legible`).toBe("1");
		expect(o.icon, `${label} icon must carry the availability cue`).toBe(
			"0.35",
		);
	}
});

/**
 * `to="/"` matches every path if the matching is loose, so Home would render
 * aria-current="page" on every route — a nav that renders correctly and lies
 * about where you are. Asserted per route, and asserted as EXACTLY ONE item,
 * so a second highlighted row fails rather than passing because the one we
 * looked for happened to be present.
 *
 * The deep route also pins the other half: Missions must STAY current on a
 * child route, so nobody "fixes" this by making every link exact.
 */
const ROUTE_EXPECTATIONS: ReadonlyArray<readonly [string, string]> = [
	...Object.entries(BUILT).map(([label, href]) => [href, id(label)] as const),
	// A child route must keep its PARENT current, so nobody "fixes" a future
	// root-matching problem by making every link exact.
	["/missions/abc123/exports/new", "nav-missions"],
];

for (const [route, expected] of ROUTE_EXPECTATIONS) {
	test(`only ${expected} is current on ${route}`, async ({ page }) => {
		await page.goto(route);
		await expect(page.getByTestId("nav-tree")).toBeVisible();
		const current = await page.evaluate(() =>
			[...document.querySelectorAll("[data-testid^=nav-]")]
				.filter((el) => el.getAttribute("aria-current") === "page")
				.map((el) => el.getAttribute("data-testid")),
		);
		expect(current).toEqual([expected]);
	});
}

/**
 * Guards against the lists above drifting from the nav itself. Without this,
 * adding an item to NAV and forgetting the spec leaves every loop passing over
 * a set that silently no longer describes the product.
 */
test("the spec's item lists match the rendered nav exactly", async ({
	page,
}) => {
	const rendered = await page.evaluate(() =>
		[...document.querySelectorAll("[data-built]")].map((el) => ({
			testid: el.getAttribute("data-testid"),
			built: el.getAttribute("data-built"),
		})),
	);
	expect(rendered.length, "nav rendered no items at all").toBeGreaterThan(0);
	expect(
		rendered
			.filter((r) => r.built === "true")
			.map((r) => r.testid)
			.sort(),
	).toEqual(BUILT_LABELS.map(id).sort());
	expect(
		rendered
			.filter((r) => r.built === "false")
			.map((r) => r.testid)
			.sort(),
	).toEqual(UNBUILT.map(id).sort());
});

/**
 * Collapsed, the sidebar becomes an icon rail and the visible label goes away.
 * The icon is aria-hidden, so if the label were removed rather than hidden,
 * every item in the rail would have NO accessible name — a nav that is
 * unusable by screen reader and looks perfect in a screenshot.
 */
test("the collapsed rail keeps an accessible name on every item", async ({
	page,
}) => {
	await page.getByTestId("sidebar-collapse").click();
	await expect(page.getByTestId("nav-tree")).toHaveAttribute(
		"data-collapsed",
		"true",
	);

	for (const label of BUILT_LABELS) {
		await expect(
			page.getByRole("link", { name: label, exact: true }),
			`${label} must keep its accessible name in the rail`,
		).toHaveCount(1);
	}

	// Hidden visually, not removed: an sr-only label has a ~1px box.
	const widths = await page.evaluate(() =>
		[...document.querySelectorAll("[data-built] span")].map(
			(el) => el.getBoundingClientRect().width,
		),
	);
	expect(widths.length).toBeGreaterThan(0);
	expect(widths.every((w) => w <= 1)).toBe(true);
});
