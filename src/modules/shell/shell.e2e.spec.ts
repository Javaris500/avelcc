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

/** A custom property as the shell wrapper resolves it. */
function tokenOf(page: Page, name: string) {
	return page.evaluate((prop) => {
		const el = document.querySelector('[data-testid="app-shell"]');
		if (!el) throw new Error("no app-shell");
		return getComputedStyle(el).getPropertyValue(prop).trim();
	}, name);
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
			"workspace-switcher",
			"search-trigger",
			"search-hint",
			"sidebar-collapse",
			"sidebar-footer",
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
		// DELIBERATE DIVERGENCE from the reference, at the operator's request.
		// avel-cc-shell.html caps at 1440 because it is a prototype shown at one
		// size; a tool discarding 44% of a 2560px screen is a different problem.
		// --frame-max is now 100%.
		await expectStyle(page, "app-window", "max-width").toBe("100%");
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
		// The idle dot is neutral, so gate-pass is asserted on the token itself.
		// That is the more direct form of DAY-ONE's check anyway: it asks whether
		// the semantic colour resolves per theme, not whether one dot uses it.
		expect(await tokenOf(page, "--color-gate-pass")).toBe("#22c55e");
	});

	test("actually repaints in light — the patch landed", async ({ page }) => {
		await gotoApp(page);
		const darkBg = await styleOf(page, "app-shell", "background-color");

		await toggleToLight(page);

		await expectStyle(page, "app-shell", "background-color").not.toBe(darkBg);
		await expectStyle(page, "app-shell", "color").toBe(LIGHT.text);
		// DAY-ONE: "if the light-mode semantics still read #22c55e, the patch did
		// not land."
		expect(await tokenOf(page, "--color-gate-pass")).toBe("#15803d");
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

/**
 * THE WIRING.
 *
 * Five controls in this shell rendered an affordance and did nothing: a
 * chevron that opened no menu, and an "F" hint for a shortcut that did not
 * exist. That is "looks finished but isn't" inside the product, which is the
 * failure mode this codebase exists to prevent, so these assert behaviour
 * rather than presence. An onClick that fires is a claim like any other.
 */
test.describe("wired controls", () => {
	test("workspace switcher opens a menu with one real workspace", async ({
		page,
	}) => {
		await gotoApp(page);
		const trigger = page.getByTestId("workspace-switcher");

		await expect(trigger).toHaveAttribute("aria-expanded", "false");
		await trigger.click();

		await expect(page.getByTestId("workspace-menu")).toBeVisible();
		await expect(trigger).toHaveAttribute("aria-expanded", "true");
		// One workspace. CLIENTS is unbuilt, so a second would be invented.
		await expect(page.getByTestId("workspace-option-current")).toBeVisible();
	});

	test("gate filter offers the five real gates and nothing invented", async ({
		page,
	}) => {
		await gotoApp(page);
		await page.getByTestId("control-gates").click();
		await expect(page.getByTestId("control-gates-menu")).toBeVisible();

		// From FULL_BUILD_GATES, transcribed from the golden fixture's playbook.
		for (const gate of [
			"phase1-close",
			"alignment",
			"qa",
			"security",
			"acceptance",
		]) {
			await expect(page.getByTestId(`gate-option-${gate}`)).toBeVisible();
		}

		await page.getByTestId("gate-option-alignment").click();
		await expect(page.getByTestId("control-gates")).toContainText("alignment");
	});

	test("target offers the closed vocabulary and selection sticks", async ({
		page,
	}) => {
		await gotoApp(page);
		await page.getByTestId("control-target").click();

		for (const kind of ["zip", "github_pr", "github_push"]) {
			await expect(page.getByTestId(`target-option-${kind}`)).toBeVisible();
		}

		await page.getByTestId("target-option-zip").click();
		await expect(page.getByTestId("control-target")).toContainText("zip");
	});

	test("account sign-out is a named action, not a bare click", async ({
		page,
	}) => {
		await gotoApp(page);
		await page.getByTestId("account").click();

		await expect(page.getByTestId("account-menu")).toBeVisible();
		await expect(page.getByTestId("account-sign-out")).toBeVisible();
		// The only irreversible control in the shell now says what it does.
		await expect(page.getByTestId("account-sign-out")).toContainText(
			"Sign out",
		);
	});

	test("the collapse control does what its icon promises", async ({ page }) => {
		await gotoApp(page);
		const toggle = page.getByTestId("sidebar-collapse");

		// It used to render an affordance with no onClick. Now it collapses.
		await expect(toggle).toHaveAttribute("aria-expanded", "true");
		await toggle.click();
		await expect(page.getByTestId("sidebar")).toHaveAttribute(
			"data-collapsed",
			"true",
		);
		await expect(toggle).toHaveAttribute("aria-expanded", "false");
	});
});

test.describe("search", () => {
	test("the trigger opens a real focused input", async ({ page }) => {
		await gotoApp(page);
		await page.getByTestId("search-trigger").click();

		await expect(page.getByTestId("search-input")).toBeFocused();
	});

	test("the advertised F shortcut actually opens it", async ({ page }) => {
		await gotoApp(page);

		// The hint is rendered, so it has to work.
		await page.keyboard.press("f");
		await expect(page.getByTestId("search-input")).toBeFocused();
	});

	test("F is not stolen from someone already typing", async ({ page }) => {
		await gotoApp(page);
		await page.getByTestId("search-trigger").click();
		await expect(page.getByTestId("search-input")).toBeFocused();

		await page.keyboard.type("off");

		// If the handler swallowed it, the f characters never reach the field.
		await expect(page.getByTestId("search-input")).toHaveValue("off");
	});

	test("Escape closes it and returns focus to the trigger", async ({
		page,
	}) => {
		await gotoApp(page);
		await page.getByTestId("search-trigger").click();
		await expect(page.getByTestId("search-input")).toBeFocused();

		await page.keyboard.press("Escape");

		// The trigger is conditionally rendered, so this only works if focus is
		// restored AFTER it remounts.
		await expect(page.getByTestId("search-trigger")).toBeFocused();
	});

	test("says there is nothing to search rather than inventing results", async ({
		page,
	}) => {
		await gotoApp(page);
		await page.getByTestId("search-trigger").click();
		await page.keyboard.type("meridian");

		await expect(page.getByTestId("search-empty")).toBeVisible();
	});
});

test.describe("keyboard and focus", () => {
	test("Escape closes a menu and returns focus to its trigger", async ({
		page,
	}) => {
		await gotoApp(page);
		await page.getByTestId("workspace-switcher").click();
		await expect(page.getByTestId("workspace-menu")).toBeVisible();

		await page.keyboard.press("Escape");

		await expect(page.getByTestId("workspace-menu")).toHaveCount(0);
		await expect(page.getByTestId("workspace-switcher")).toBeFocused();
	});

	test("the skip link is the first tab stop and moves focus to the content", async ({
		page,
	}) => {
		await gotoApp(page);
		await page.keyboard.press("Tab");

		await expect(page.getByTestId("skip-to-content")).toBeFocused();
		// sr-only until focused, then a real visible target.
		await expect(page.getByTestId("skip-to-content")).toBeVisible();

		await page.keyboard.press("Enter");
		await expect(page.getByTestId("main")).toBeFocused();
	});

	test("every control shows a focus ring when tabbed to", async ({ page }) => {
		await gotoApp(page);

		// Verified by tabbing, not by reading the stylesheet.
		for (let i = 0; i < 3; i++) {
			await page.keyboard.press("Tab");
			const outline = await page.evaluate(() => {
				const cs = getComputedStyle(document.activeElement as Element);
				return { style: cs.outlineStyle, width: cs.outlineWidth };
			});
			expect(outline.style, `tab stop ${i + 1}`).toBe("solid");
			expect(outline.width, `tab stop ${i + 1}`).toBe("2px");
		}
	});
});

test.describe("honest state", () => {
	test("the idle dot does not animate", async ({ page }) => {
		await gotoApp(page);

		await expect(page.getByTestId("live-pill")).toHaveAttribute(
			"data-activity",
			"idle",
		);
		// A pulse beside "No run in progress" reads as activity where there is
		// none. Zero missions have run.
		const animation = await styleOf(page, "live-dot", "animation-name");
		expect(animation).toBe("none");
	});

	test("the nav shows a cut edge only once it is scrolled", async ({
		page,
	}) => {
		await gotoApp(page);
		const slot = page.getByTestId("nav-slot");

		await expect(slot).toHaveAttribute("data-scrolled", "false");
		await expectStyle(page, "nav-slot", "border-top-color").toBe(
			"rgba(0, 0, 0, 0)",
		);
	});
});

/**
 * The sidebar rail, and the footer that holds the operator's own controls.
 *
 * Theme and collapse are preferences; gates and target are about the current
 * view's data. They were mixed in one strip and are now separated.
 */
test.describe("rail and footer", () => {
	const RAIL_PX = 64; // 16 grid units. On the 4px scale, not a literal.

	test("the theme toggle lives in the footer, not the top bar", async ({
		page,
	}) => {
		await gotoApp(page);

		await expect(
			page.locator('[data-testid="topbar"] [data-testid="control-theme"]'),
		).toHaveCount(0);
		await expect(
			page.locator(
				'[data-testid="sidebar-footer"] [data-testid="control-theme"]',
			),
		).toHaveCount(1);
	});

	test("the moved toggle still switches the theme", async ({ page }) => {
		await gotoApp(page);
		const shell = page.getByTestId("app-shell");

		await expect(shell).toHaveAttribute("data-theme", "dark");
		await page.getByTestId("control-theme").click();
		await expect(shell).toHaveAttribute("data-theme", "light");
	});

	test("there is exactly one theme control, so nothing can desync", async ({
		page,
	}) => {
		await gotoApp(page);

		// Two useTheme instances drift apart the moment either is pressed.
		await expect(page.getByTestId("control-theme")).toHaveCount(1);
	});

	test("collapsing narrows the sidebar without moving the frame", async ({
		page,
	}) => {
		await gotoApp(page);
		const windowBefore = await page.getByTestId("app-window").boundingBox();

		await expect(page.getByTestId("sidebar")).toHaveCSS("width", "238px");
		await page.getByTestId("sidebar-collapse").click();

		await expect(page.getByTestId("sidebar")).toHaveCSS(
			"width",
			`${RAIL_PX}px`,
		);
		const windowAfter = await page.getByTestId("app-window").boundingBox();
		expect(windowAfter?.width).toBe(windowBefore?.width);
	});

	test("the rail drops labels but keeps every control reachable", async ({
		page,
	}) => {
		await gotoApp(page);
		await page.getByTestId("sidebar-collapse").click();

		await expect(page.getByTestId("wordmark")).toHaveCount(0);
		await expect(page.getByTestId("search-hint")).toHaveCount(0);

		await expect(page.getByTestId("brand-mark")).toBeVisible();
		await expect(page.getByTestId("workspace-switcher")).toBeVisible();
		await expect(page.getByTestId("search-trigger")).toBeVisible();
		await expect(page.getByTestId("control-theme")).toBeVisible();
		await expect(page.getByTestId("account")).toBeVisible();
	});

	test("the collapsed state survives a reload", async ({ page }) => {
		await gotoApp(page);
		await page.getByTestId("sidebar-collapse").click();
		await expect(page.getByTestId("sidebar")).toHaveAttribute(
			"data-collapsed",
			"true",
		);

		await page.reload();
		await expect(page.getByTestId("sidebar")).toHaveAttribute(
			"data-collapsed",
			"true",
		);
	});

	test("collapsed reaches NavTree through the seam", async ({ page }) => {
		await gotoApp(page);
		await page.getByTestId("sidebar-collapse").click();

		// The frame's only job here. What NavTree does with it is session 3's.
		await expect(page.getByTestId("nav-tree")).toHaveAttribute(
			"data-collapsed",
			"true",
		);
	});
});

/**
 * A control whose visible label is gone must say what it is some other way.
 * One tooltip per test, on a fresh page: Radix has a skip-delay window, and
 * hovering several triggers in sequence makes later ones look broken when they
 * are not.
 */
test.describe("rail labelling", () => {
	for (const [control, tip, label] of [
		["sidebar-collapse", "sidebar-collapse-tip", "Expand sidebar"],
		["search-trigger", "search-trigger-tip", "Find"],
		["control-theme", "control-theme-tip", "theme"],
		["account", "account-tip", "@"],
	] as const) {
		test(`${control} is labelled when collapsed`, async ({ page }) => {
			await gotoApp(page);
			await page.getByTestId("sidebar-collapse").click();
			await expect(page.getByTestId("sidebar")).toHaveAttribute(
				"data-collapsed",
				"true",
			);

			await page.getByTestId(control).hover();

			await expect(page.getByTestId(tip)).toContainText(label);
		});
	}

	test("the collapse toggle carries an aria-label in both states", async ({
		page,
	}) => {
		await gotoApp(page);
		const toggle = page.getByTestId("sidebar-collapse");

		await expect(toggle).toHaveAttribute("aria-label", "Collapse sidebar");
		await toggle.click();
		await expect(toggle).toHaveAttribute("aria-label", "Expand sidebar");
	});
});

/**
 * COMPACT WIDTHS.
 *
 * At 390 the 238px sidebar column left under 100px of usable main and pushed
 * the content 788px down the page. Nothing flagged it: there was no horizontal
 * overflow, and "no horizontal overflow" passes just as happily on a broken
 * layout as on a working one. These assert the POSITIVE path — hidden by
 * default, visible after the trigger, main at full width — because the absence
 * check is what let it through.
 *
 * Five routes are `device: capture`, which ROUTES.md defines as "works on a
 * phone". That is a promise, and this is the width it is made at.
 */
test.describe("compact width", () => {
	const PHONE = { width: 390, height: 844 };
	const MAT_PX = 12;

	test.use({ viewport: PHONE });

	test("the sidebar is not a column at 390", async ({ page }) => {
		await gotoApp(page);

		// Not merely hidden: not in the layout at all.
		await expect(page.getByTestId("sidebar")).toHaveCount(0);
		await expect(page.getByTestId("nav-drawer")).toHaveCount(0);
	});

	test("main takes the full width inside the mat", async ({ page }) => {
		await gotoApp(page);
		const main = await page.getByTestId("main").boundingBox();
		if (!main) throw new Error("main not laid out");

		// The 1px window border on each side is the only other subtraction.
		expect(Math.round(main.width)).toBe(PHONE.width - MAT_PX * 2 - 2);
		expect(Math.round(main.x)).toBe(MAT_PX + 1);
	});

	test("the mat shrinks on a phone", async ({ page }) => {
		await gotoApp(page);

		// 26px of 390 is 13% of the screen spent on margins.
		await expectStyle(page, "app-shell", "padding").toBe(`${MAT_PX}px`);
	});

	test("a trigger opens the drawer, and it holds the real sidebar", async ({
		page,
	}) => {
		await gotoApp(page);
		await expect(page.getByTestId("nav-drawer-trigger")).toBeVisible();

		await page.getByTestId("nav-drawer-trigger").click();

		await expect(page.getByTestId("nav-drawer")).toBeVisible();
		await expect(page.getByTestId("sidebar")).toBeVisible();
		// One sidebar, not a mobile copy: two would duplicate every testid.
		await expect(page.getByTestId("sidebar")).toHaveCount(1);
	});

	test("the open drawer holds focus and Escape gives it back", async ({
		page,
	}) => {
		await gotoApp(page);
		await page.getByTestId("nav-drawer-trigger").click();
		await expect(page.getByTestId("nav-drawer")).toBeVisible();

		const trapped = await page.evaluate(() =>
			document
				.querySelector('[data-testid="nav-drawer"]')
				?.contains(document.activeElement),
		);
		expect(trapped, "focus moved into the drawer").toBe(true);

		await page.keyboard.press("Escape");

		await expect(page.getByTestId("nav-drawer")).toHaveCount(0);
		// Radix restores to what it captured, and the trigger is outside this
		// Root, so the shell hands it back explicitly.
		await expect(page.getByTestId("nav-drawer-trigger")).toBeFocused();
	});

	test("interactive controls clear a 44px touch target", async ({ page }) => {
		await gotoApp(page);

		for (const id of [
			"nav-drawer-trigger",
			"control-gates",
			"control-target",
		]) {
			const box = await page.getByTestId(id).boundingBox();
			expect(box?.height ?? 0, `${id} height`).toBeGreaterThanOrEqual(44);
		}
	});

	test("does not overflow horizontally", async ({ page }) => {
		await gotoApp(page);

		const { scrollW, clientW } = await page.evaluate(() => ({
			scrollW: document.documentElement.scrollWidth,
			clientW: document.documentElement.clientWidth,
		}));
		// True today AND while the layout was broken. Kept as a floor, never as
		// the proof.
		expect(scrollW).toBeLessThanOrEqual(clientW);
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
