import { expect, type Page, test } from "@playwright/test";

/**
 * The shell frame, verified in a real browser.
 *
 * Every number here was measured in a scratchpad script first. Committing it
 * is the point: a scratchpad run is an attestation, and this project's
 * recurring failure is a claim standing in for a mechanism. Three of today's
 * defects passed a green build — a stylesheet killed by a stray comment
 * terminator, tree-shaken dark tokens, and every border staying dark grey in
 * light mode. None were visible to tsc, vitest, or the build.
 *
 * Values come from avel-cc-shell.html, the design reference.
 */

/** The display cookie the client gate reads. Not the httpOnly session cookie. */
const OPERATOR = "javaris@avelco.dev";

/** Reference `:root` — the values the dark theme must resolve to. */
const DARK = {
	pageBg: "rgb(26, 29, 35)", // --bg        #1a1d23
	sidebarBg: "rgb(42, 46, 54)", // --surface   #2a2e36
	switcherBg: "rgb(57, 62, 70)", // --surface-2 #393e46
	text: "rgb(238, 238, 238)", // --text      #eeeeee
	border: "rgb(74, 80, 88)", // --border    #4a5058
	gatePass: "rgb(34, 197, 94)", // --pass      #22c55e
};

/** Reference `.light`. */
const LIGHT = {
	border: "rgb(229, 231, 235)", // --border    #e5e7eb
	panel: "rgb(255, 255, 255)", // --color-app-panel  #ffffff
	raised: "rgb(238, 238, 238)", // --color-app-raised #eeeeee, correction 5
	text: "rgb(26, 29, 35)", // --text      #1a1d23
	gatePass: "rgb(21, 128, 61)", // --pass      #15803d
};

async function gotoApp(page: Page) {
	await page.context().addCookies([
		{
			name: "avel_operator",
			value: OPERATOR,
			domain: "localhost",
			path: "/",
		},
	]);
	await page.goto("/missions");
	await expect(page.getByTestId("app-shell")).toBeVisible();
}

/** Computed style of one testid, read out of the live DOM. */
function styleOf(page: Page, testId: string, prop: string) {
	return page.evaluate(
		([id, name]) => {
			const el = document.querySelector(`[data-testid="${id}"]`);
			if (!el) throw new Error(`no [data-testid="${id}"]`);
			return getComputedStyle(el).getPropertyValue(name);
		},
		[testId, prop] as const,
	);
}

/**
 * A computed style, POLLED until it settles.
 *
 * Backgrounds and borders transition (--duration-micro, and 200ms on body), so
 * reading immediately after the theme flips catches a mid-transition value. A
 * first draft of this spec did exactly that and read rgb(250,250,250) for a
 * switcher that settles at rgb(255,255,255) — a passing-then-failing assertion
 * that had nothing to do with the thing under test. Polling removes the race
 * without hardcoding a sleep.
 */
function expectStyle(page: Page, testId: string, prop: string) {
	return expect.poll(() => styleOf(page, testId, prop), {
		message: `${testId} ${prop}`,
		timeout: 5_000,
	});
}

async function toggleToLight(page: Page) {
	await page.getByTestId("control-theme").click();
	await expect(page.getByTestId("app-shell")).toHaveAttribute(
		"data-theme",
		"light",
	);
}

test.describe("shell structure", () => {
	test("renders every element of the frame exactly once", async ({ page }) => {
		await gotoApp(page);

		for (const id of [
			"app-shell",
			"app-window",
			"sidebar",
			"brand-mark",
			"wordmark",
			"sidebar-collapse",
			"workspace-switcher",
			"search-trigger",
			"search-hint",
			"nav-slot",
			"account",
			"main-pane",
			"topbar",
			"live-pill",
			"live-dot",
			"control-theme",
			"control-gates",
			"control-target",
			"main",
		]) {
			await expect(page.getByTestId(id), `[${id}]`).toHaveCount(1);
		}
	});

	test("matches the reference frame geometry", async ({ page }) => {
		await gotoApp(page);

		// .page — a 26px mat on all four sides.
		await expectStyle(page, "app-shell", "padding").toBe("26px");

		// .app — 238px + 1fr, capped, radius-lg, clipping its corners.
		const side = await page.getByTestId("sidebar").boundingBox();
		expect(side?.width).toBe(238);
		await expectStyle(page, "app-window", "max-width").toBe("1440px");
		await expectStyle(page, "app-window", "border-top-left-radius").toBe(
			"14px",
		);
		await expectStyle(page, "app-window", "overflow").toBe("hidden");

		// .scroll — the main pane takes the scrollbar, not the page.
		await expectStyle(page, "main", "overflow-y").toBe("auto");
	});

	test("pins the account block to the sidebar floor", async ({ page }) => {
		await gotoApp(page);

		const side = await page.getByTestId("sidebar").boundingBox();
		const acct = await page.getByTestId("account").boundingBox();
		if (!side || !acct) throw new Error("sidebar or account not laid out");
		const gap = side.y + side.height - (acct.y + acct.height);

		// Reference: `margin-top:auto` on .foot, 12px padding above it.
		expect(gap).toBeGreaterThanOrEqual(0);
		expect(gap).toBeLessThanOrEqual(24);
	});

	test("gives the nav a scroll container and nothing else", async ({
		page,
	}) => {
		await gotoApp(page);

		// The frame owns the container; session 3 owns what goes in it.
		const slot = page.getByTestId("nav-slot");
		await expectStyle(page, "nav-slot", "overflow-y").toBe("auto");
		expect(Number(await slot.getAttribute("data-nav-groups"))).toBeGreaterThan(
			0,
		);
	});
});

test.describe("theme", () => {
	test("puts .light on the shell wrapper and never on <html> or <body>", async ({
		page,
	}) => {
		await gotoApp(page);

		const where = async () =>
			page.evaluate(() => ({
				html: document.documentElement.classList.contains("light"),
				body: document.body.classList.contains("light"),
				shell: !!document
					.querySelector('[data-testid="app-shell"]')
					?.classList.contains("light"),
			}));

		expect(await where()).toEqual({ html: false, body: false, shell: false });

		await toggleToLight(page);

		// The landing shares this stylesheet. A .light that reaches <html>
		// re-themes it. The reference's own script does exactly that and is the
		// one behaviour of its not copied.
		expect(await where()).toEqual({ html: false, body: false, shell: true });
	});

	test("carries .app, so tabular-nums and the contrast fix apply", async ({
		page,
	}) => {
		await gotoApp(page);

		await expect(page.getByTestId("app-shell")).toHaveClass(/\bapp\b/);
		await expectStyle(page, "app-shell", "font-variant-numeric").toContain(
			"tabular-nums",
		);
	});

	test("resolves the reference's dark values", async ({ page }) => {
		await gotoApp(page);

		await expectStyle(page, "app-shell", "background-color").toBe(DARK.pageBg);
		await expectStyle(page, "sidebar", "background-color").toBe(DARK.sidebarBg);
		await expectStyle(page, "workspace-switcher", "background-color").toBe(
			DARK.switcherBg,
		);
		await expectStyle(page, "app-shell", "color").toBe(DARK.text);
		await expectStyle(page, "live-dot", "background-color").toBe(DARK.gatePass);
	});

	test("actually repaints in light — the patch landed", async ({ page }) => {
		await gotoApp(page);
		const darkBg = await styleOf(page, "app-shell", "background-color");

		await toggleToLight(page);

		await expectStyle(page, "app-shell", "background-color").not.toBe(darkBg);
		await expectStyle(page, "app-shell", "color").toBe(LIGHT.text);
		// DAY-ONE: "if the light-mode semantics still read #22c55e, the patch did
		// not land."
		await expectStyle(page, "live-dot", "background-color").toBe(
			LIGHT.gatePass,
		);
	});

	test("survives a reload", async ({ page }) => {
		await gotoApp(page);
		await toggleToLight(page);

		await page.reload();
		await expect(page.getByTestId("app-shell")).toHaveAttribute(
			"data-theme",
			"light",
		);
	});
});

/**
 * REGRESSION GUARD for the border defect.
 *
 * `--elevation-border-rest: var(--color-border)` was declared once in
 * `@theme static`, so it landed on `:root`. CSS substitutes var() inside a
 * custom property at computed-value time on the DECLARING element, so `:root`
 * froze the dark value and `.light` redefining `--color-border` never
 * re-resolved the alias. Every border in the app painted dark grey in light
 * mode. Nothing in tsc, vitest or the build could see it.
 *
 * These assert the PAINTED colour, not the token, because the token was
 * correct the whole time.
 */
test.describe("borders follow the theme", () => {
	const BORDERED = [
		["app-window", "border-top-color"],
		["sidebar", "border-right-color"],
		["topbar", "border-bottom-color"],
		["workspace-switcher", "border-top-color"],
	] as const;

	test("every frame border is the dark border in dark", async ({ page }) => {
		await gotoApp(page);

		for (const [id, prop] of BORDERED) {
			await expectStyle(page, id, prop).toBe(DARK.border);
		}
	});

	test("every frame border is the light border in light", async ({ page }) => {
		await gotoApp(page);
		await toggleToLight(page);

		for (const [id, prop] of BORDERED) {
			await expectStyle(page, id, prop).toBe(LIGHT.border);
		}
	});

	test("the switcher is distinguishable from the sidebar in light", async ({
		page,
	}) => {
		await gotoApp(page);
		await toggleToLight(page);

		// RESOLVED, and this test now guards the resolution.
		//
		// Light --color-app-raised was #ffffff, identical to --color-app-panel, so
		// the switcher's fill carried no separation from the sidebar it sits on
		// and a 1px hairline was doing all the work for a control the operator is
		// meant to click. Correction 5 took the reference's #eeeeee.
		//
		// The reference never relied on either alone: it uses a distinct fill AND
		// a border, and the two together are what make a control read as one.
		// These three assert both halves are present. A revert of either — the
		// fill back to white, or the elevation-border alias back to frozen — fails
		// here rather than shipping a control nobody can see.
		await expectStyle(page, "sidebar", "background-color").toBe(LIGHT.panel);
		await expectStyle(page, "workspace-switcher", "background-color").toBe(
			LIGHT.raised,
		);
		await expectStyle(page, "workspace-switcher", "border-top-color").toBe(
			LIGHT.border,
		);
	});
});

/**
 * The type scale, enforced on the chrome this session owns.
 *
 * tokens.css defines six steps and no half-pixels. Before it existed every
 * component picked its own pixel value with nothing to be wrong against, and
 * matching the reference faithfully propagated its 9.5/10.5/12.5px prototype
 * ramp. This pins the shell chrome to the scale so it cannot drift back one
 * arbitrary value at a time.
 *
 * Scoped to testids this mount renders. The nav and the routes are other
 * sessions' and are theirs to pin.
 */
test.describe("type scale", () => {
	const SCALE_PX = [11, 12, 13, 14, 15, 19];

	const CHROME = [
		"wordmark",
		"search-hint",
		"workspace-switcher",
		"search-trigger",
		"account",
		"live-pill",
		"control-theme",
		"control-gates",
		"control-target",
	];

	test("renders every chrome element at an on-scale size", async ({ page }) => {
		await gotoApp(page);

		for (const id of CHROME) {
			const px = await page.evaluate((testId) => {
				const el = document.querySelector(`[data-testid="${testId}"]`);
				if (!el) throw new Error(`no [data-testid="${testId}"]`);
				return Number.parseFloat(getComputedStyle(el).fontSize);
			}, id);

			expect(SCALE_PX, `${id} renders ${px}px`).toContain(px);
		}
	});
});

test.describe("robustness", () => {
	test("does not overflow horizontally at 1440 or at 900", async ({ page }) => {
		await gotoApp(page);

		for (const width of [1440, 900]) {
			await page.setViewportSize({ width, height: 900 });
			const { scrollW, clientW } = await page.evaluate(() => ({
				scrollW: document.documentElement.scrollWidth,
				clientW: document.documentElement.clientWidth,
			}));
			expect(
				scrollW,
				`no horizontal overflow at ${width}px`,
			).toBeLessThanOrEqual(clientW);
		}
	});

	test("renders and toggles without a console error", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (m) => {
			if (m.type() === "error") errors.push(m.text());
		});
		page.on("pageerror", (e) => errors.push(String(e)));

		await gotoApp(page);
		await toggleToLight(page);
		await page.reload();
		await expect(page.getByTestId("app-shell")).toBeVisible();

		expect(errors).toEqual([]);
	});
});
