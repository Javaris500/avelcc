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
	text: "rgb(238, 238, 238)", // --text      #eeeeee
	border: "rgb(74, 80, 88)", // --border    #4a5058
	gatePass: "rgb(34, 197, 94)", // --pass      #22c55e
};

/** Reference `.light`. */
const LIGHT = {
	border: "rgb(229, 231, 235)", // --border    #e5e7eb
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
	/**
	 * A GENEROUS GATE HERE, AND SHORT POLLS EVERYWHERE ELSE, because the two
	 * waits are different questions.
	 *
	 * This one waits for a DEV SERVER to compile a route on demand, which is
	 * unbounded-ish and has nothing to do with the app being correct. The
	 * measurement polls below stay at five seconds so a genuinely wrong value
	 * still fails fast.
	 *
	 * Conflating them is a real source of noise in this suite: a cold compile
	 * blew a 5s measurement poll and reported a colour as wrong, and the tell is
	 * a failure that moves between runs and reads as a MISSING value rather than
	 * an incorrect one. Diagnosed by avel-fa hitting the same thing in the
	 * catalog specs, where a fixed wait reported zero headings on a page that
	 * had them.
	 */
	await expect(page.getByTestId("app-shell")).toBeVisible({ timeout: 30_000 });
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

/**
 * A token as the browser would PAINT it, in the same rgb form getComputedStyle
 * reports for a background.
 *
 * ASSERT AGAINST THIS, NOT AGAINST A HEX. Four tests in this file pinned
 * literal rgb values that happened to equal a token on the day they were
 * written, and every one of them went red when the ramp moved — asserting
 * "the sidebar is #2a2e36" rather than "the sidebar is the app background".
 * The first is a fact about today's palette; the second is the design rule,
 * and only the second survives a re-tune. Same failure as --color-skeleton,
 * which was pinned to a value derived from a surface that later moved.
 */
async function paintedToken(page: Page, name: string): Promise<string> {
	return page.evaluate((prop) => {
		const shell = document.querySelector('[data-testid="app-shell"]');
		if (!shell) throw new Error("no app-shell");
		// Resolved INSIDE the shell, because `.light` sits on that wrapper rather
		// than on <html> — a probe on document.body would read the dark value in
		// both themes.
		const probe = document.createElement("div");
		probe.style.backgroundColor = `var(${prop})`;
		shell.appendChild(probe);
		const painted = getComputedStyle(probe).backgroundColor;
		probe.remove();
		return painted;
	}, name);
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
			"main",
		]) {
			await expect(page.getByTestId(id), `[${id}]`).toHaveCount(1);
		}
	});

	test("matches the reference frame geometry", async ({ page }) => {
		await gotoApp(page);

		// .page — NO mat. The 26px inset was removed on the operator's call; it
		// read as a black margin around the app rather than as a frame around a
		// window. Asserted as 0 rather than deleted, so the mat cannot creep back.
		await expectStyle(page, "app-shell", "padding").toBe("0px");

		// .app — 238px + 1fr, full bleed, square, still clipping its panes.
		const side = await page.getByTestId("sidebar").boundingBox();
		expect(side?.width).toBe(238);
		// DELIBERATE DIVERGENCE from the reference, at the operator's request.
		// avel-cc-shell.html caps at 1440 because it is a prototype shown at one
		// size; a tool discarding 44% of a 2560px screen is a different problem.
		// --frame-max is now 100%.
		await expectStyle(page, "app-window", "max-width").toBe("100%");
		// The corners went with the mat: there is nothing left to be rounded
		// against. Pinned at 0 for the same reason as the padding above.
		await expectStyle(page, "app-window", "border-top-left-radius").toBe("0px");
		await expectStyle(page, "app-window", "overflow").toBe("hidden");

		/**
		 * AND THE OPERATOR'S ACTUAL REQUIREMENT, WHICH NONE OF THE ABOVE STATES.
		 *
		 * "Cover the entire page" is a claim about COVERAGE, and zero padding,
		 * zero radius and `max-width: 100%` are three properties that each have
		 * to hold for it without any of them saying it.
		 *
		 * Demonstrated rather than argued, because my first example was wrong. I
		 * claimed capping `--frame-max` would slip past everything above; it does
		 * not, because the line above pins that token's effect at exactly 100%.
		 * A MARGIN does slip past: 40px of `margin-left` on the window leaves the
		 * padding 0, the radius 0 and the max-width 100%, and puts 40px of app-bg
		 * back down the side. Injected, run, and this line is the only one that
		 * went red — "Expected: 1280, Received: 1240".
		 *
		 * So it earns its place, just not for the reason I first gave it.
		 */
		const viewport = page.viewportSize();
		const win = await page.getByTestId("app-window").boundingBox();
		if (!viewport || !win) throw new Error("no viewport or window box");
		expect(Math.round(win.width), "app-bg must not show at the sides").toBe(
			viewport.width,
		);
		expect(Math.round(win.height), "app-bg must not show above or below").toBe(
			viewport.height,
		);
		expect(Math.round(win.x)).toBe(0);
		expect(Math.round(win.y)).toBe(0);

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

	test("paints each surface from the token that names its role", async ({
		page,
	}) => {
		await gotoApp(page);

		/**
		 * THE SIDEBAR SHARES THE CONTENT'S GROUND. This asserted app-bg, the
		 * desktop tone, on the strength of a "the sidebar is a different plane"
		 * ruling that was later reversed: the window is ONE surface now, sidebar
		 * and content column both on app-panel, and the accent seam divides them
		 * instead of a tonal step.
		 *
		 * It still asserts the ROLE rather than a hex, so a re-tune moves it for
		 * free. What changed is which role the sidebar plays, not how it is
		 * checked. The desktop mat behind the window is still app-bg.
		 */
		const appBg = await paintedToken(page, "--color-app-bg");
		const panel = await paintedToken(page, "--color-app-panel");
		await expectStyle(page, "app-shell", "background-color").toBe(appBg);
		await expectStyle(page, "sidebar", "background-color").toBe(panel);

		/**
		 * THE SWITCHER HAS NO FILL AT REST, which is the design and not an
		 * omission. This asserted app-raised — #ffffff in light, the same value
		 * as app-panel — so the moment the sidebar moved onto app-panel the
		 * control became white on white with a hairline doing all the work.
		 *
		 * Transparent cannot collide with ANY surface the sidebar is later given,
		 * which is why it beats picking a better fill. What makes it visible is
		 * asserted in the light test, where the failure would actually appear.
		 */
		await expectStyle(page, "workspace-switcher", "background-color").toBe(
			"rgba(0, 0, 0, 0)",
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
	/**
	 * WHAT IS STILL BORDERED, AFTER THE NO-RULES RULING.
	 *
	 * The sidebar's `border-r` and the header's `border-b` were INTERNAL
	 * dividers between panes and are gone: panes separate by tone and gap now,
	 * and a hairline is what you reach for when two surfaces share a colour.
	 * These two are not internal dividers. `app-window` is the frame's edge
	 * against the desktop mat, without which the rounded corners have nothing to
	 * describe them against, and the switcher's is a control's own container.
	 */
	const BORDERED = [["workspace-switcher", "border-top-color"]] as const;

	/**
	 * The removals, pinned POSITIVELY rather than left to the absence of a test.
	 * Deleting the assertions would have left nothing to stop a border coming
	 * back, and "we removed the test when we removed the border" is how a ruling
	 * quietly reverts.
	 */
	const UNBORDERED = [
		["sidebar", "border-right-width"],
		["page-header", "border-bottom-width"],
		// MOVED HERE FROM `BORDERED`, following the rule stated directly above.
		// The window border was justified as "the window's edge against the mat",
		// and with the mat gone that reason is gone with it. Deleting its
		// assertion would have been the quiet revert this list exists to prevent,
		// so it is pinned as an absence instead.
		["app-window", "border-top-width"],
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

	test("no rule separates the panes, in either theme", async ({ page }) => {
		await gotoApp(page);
		for (const [id, prop] of UNBORDERED) {
			await expectStyle(page, id, prop).toBe("0px");
		}

		await toggleToLight(page);
		for (const [id, prop] of UNBORDERED) {
			await expectStyle(page, id, prop).toBe("0px");
		}
	});

	test("the switcher is distinguishable from the sidebar in light", async ({
		page,
	}) => {
		await gotoApp(page);
		await toggleToLight(page);

		// RESOLVED, and this test now guards the resolution.
		//
		/**
		 * THE SIGNAL IS THE RELATIONSHIP, NOT THE TWO VALUES.
		 *
		 * This asserted sidebar #ffffff and switcher #eeeeee. Both are now wrong
		 * and, more to the point, the reasoning under them has INVERTED. Light
		 * app-raised was raised to #eeeeee by correction 5 because a white
		 * switcher sat on a white sidebar with a hairline doing all the work.
		 * The sidebar has since moved to app-bg, so correction 5 was reverted and
		 * raised went back to #ffffff — a white control on a grey sidebar, which
		 * is what correction 5 wanted all along and could not have while the
		 * sidebar was painted as a panel.
		 *
		 * Both spellings satisfy the real requirement, and pinning either one
		 * makes the test fail the next time the palette answers it differently.
		 * So assert the requirement: the switcher must not share its fill with
		 * the surface it sits on, and it must carry its own border. A revert of
		 * either half fails here rather than shipping a control nobody can see.
		 */
		/**
		 * POLLED, NOT READ ONCE, and the reason is a race I built into the first
		 * version of this test.
		 *
		 * The switcher carries the `interactive` utility, which transitions
		 * `background`. On a theme toggle its colour ANIMATES from the dark value
		 * to the light one over --duration-micro. The probe `paintedToken` creates
		 * has no transition, so it reports the destination immediately — and a
		 * one-shot `styleOf` on the switcher caught it mid-flight, comparing a
		 * colour partway through an animation against a settled one.
		 *
		 * It failed reading `rgb(38, 43, 53)` in light, which is the DARK raised
		 * value, and looked exactly like a token frozen at the wrong theme —
		 * correction 4's signature. Driving it by hand showed the token and the
		 * paint both correct in both themes. The bug was the measurement.
		 */
		const panel = await paintedToken(page, "--color-app-panel");
		await expectStyle(page, "sidebar", "background-color").toBe(panel);

		/**
		 * NO FILL SEPARATES THESE TWO IN LIGHT, because none can: app-panel and
		 * app-raised are both #ffffff there. The earlier version of this test
		 * asserted that the switcher's fill DIFFERED from the sidebar's, which
		 * was satisfiable only while the sidebar sat on app-bg. It does not any
		 * more, and no repointing of that assertion can pass — the requirement
		 * had to be met a different way rather than re-measured.
		 *
		 * It is met by having no fill. So the test asserts the two things that
		 * carry the control instead, and a revert of either half fails here
		 * rather than shipping a control nobody can see.
		 */
		await expectStyle(page, "workspace-switcher", "background-color").toBe(
			"rgba(0, 0, 0, 0)",
		);

		// One: its own border at rest.
		await expectStyle(page, "workspace-switcher", "border-top-color").toBe(
			LIGHT.border,
		);

		// Two: a real change on contact. Downward is the only direction light
		// has, so hover RECESSES rather than lifting.
		await page.getByTestId("workspace-switcher").hover();
		await expectStyle(page, "workspace-switcher", "background-color").not.toBe(
			"rgba(0, 0, 0, 0)",
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

	/**
	 * The gate-filter and delivery-target tests are GONE WITH THE CONTROLS THEY
	 * TESTED. Both passed and both were testing that a menu opened and set its
	 * own useState — the selection filtered nothing and targeted nothing, so the
	 * assertions confirmed the widget worked while the feature did not exist.
	 *
	 * Kept here as a note rather than deleted silently: when gate filtering
	 * lands on mission detail and target selection on the export screen, those
	 * screens need tests that assert the DATA changed, not that a label did.
	 */

	test("the header carries no page-specific data controls", async ({
		page,
	}) => {
		await gotoApp(page);
		// The ruling from UI-PLAN section 2. These two were global chrome holding
		// page-specific data, above pages where the concept does not exist.
		await expect(page.getByTestId("control-gates")).toHaveCount(0);
		await expect(page.getByTestId("control-target")).toHaveCount(0);
		// The run state stays: it is the shell's own, and it is the one thing up
		// there that is about the app rather than about a page.
		await expect(page.getByTestId("live-pill")).toHaveCount(1);
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

	test("collapsing closes it, so expanding does not reveal a stale panel", async ({
		page,
	}) => {
		await gotoApp(page);
		await page.getByTestId("search-trigger").click();
		await expect(page.getByTestId("search-input")).toBeFocused();

		await page.getByTestId("sidebar-collapse").click();
		await page.getByTestId("sidebar-collapse").click();

		/**
		 * THE ROUND TRIP IS THE TEST. Collapsing alone proves nothing: the panel
		 * renders under `searchOpen && !collapsed`, so a rail hides it whether or
		 * not the state was reset. Only expanding again separates "closed" from
		 * "hidden" — without the effect the panel comes back open, focus lands in
		 * a field the operator did not ask for, and the `F` hint is gone because
		 * the trigger it lives on is not rendered.
		 */
		await expect(page.getByTestId("search-input")).toHaveCount(0);
		await expect(page.getByTestId("search-trigger")).toBeVisible();
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

	test("a cut-off nav list looks cut off", async ({ page }) => {
		await gotoApp(page);

		/**
		 * THE SIGNAL SURVIVED THE RULE. This asserted a `border-t` that appeared
		 * once the list was scrolled, plus the `data-scrolled` state driving it.
		 * Both are gone — the border was an internal divider under the no-rules
		 * ruling — and a fade mask does the same job without drawing a line.
		 *
		 * So the test asserts the fade rather than the border. What it is
		 * protecting is unchanged and is worth stating: a list with more content
		 * below must not look complete. Asserting only that the border is absent
		 * would have left the SIGNAL untested and passed on a nav with a hard cut.
		 *
		 * The mask is unconditional, because with a short list the fade lands on
		 * empty space and shows nothing. There is no state left to assert.
		 */
		const mask = await styleOf(page, "nav-slot", "mask-image");
		expect(mask, "the nav's bottom edge must fade").toContain(
			"linear-gradient",
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

	test.use({ viewport: PHONE });

	test("the sidebar is not a column at 390", async ({ page }) => {
		await gotoApp(page);

		// Not merely hidden: not in the layout at all.
		await expect(page.getByTestId("sidebar")).toHaveCount(0);
		await expect(page.getByTestId("nav-drawer")).toHaveCount(0);
	});

	test("main takes the full width of the viewport", async ({ page }) => {
		await gotoApp(page);
		const main = await page.getByTestId("main").boundingBox();
		if (!main) throw new Error("main not laid out");

		// Full bleed: no mat to subtract and no window border either. At compact
		// width the sidebar is a drawer, so main starts at the viewport edge.
		expect(Math.round(main.width)).toBe(PHONE.width);
		expect(Math.round(main.x)).toBe(0);
	});

	/**
	 * WAS "the mat shrinks on a phone", asserting a 12px inset against the 26px
	 * desktop one. There is no mat at any width now, so the narrow case is the
	 * same assertion as the wide one — kept rather than deleted, because a mat
	 * returning on phones only is exactly the regression nobody would catch by
	 * looking at a desktop.
	 */
	test("there is no mat on a phone either", async ({ page }) => {
		await gotoApp(page);
		await expectStyle(page, "app-shell", "padding").toBe("0px");
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

		/**
		 * THIS WAS NOT A SIZING FAILURE. It listed `control-gates` and
		 * `control-target`, the two header dropdowns deleted for opening a menu
		 * and changing nothing — so `boundingBox()` waited 30 seconds for
		 * elements that no longer exist and timed out. It reads as "the target is
		 * too small", which is what a reader assumes from the test's name, and it
		 * is why this sat undiagnosed: the failure mode of a missing element and
		 * of a small one look nothing alike but the test name describes only one.
		 *
		 * Two of three ids were removed rather than the list being deleted. The
		 * drawer trigger is the one compact-only control that survives, and the
		 * 44px floor is still the rule worth holding.
		 */
		const box = await page.getByTestId("nav-drawer-trigger").boundingBox();
		expect(
			box?.height ?? 0,
			"nav-drawer-trigger height",
		).toBeGreaterThanOrEqual(44);
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
