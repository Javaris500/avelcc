import { expect, test } from "@playwright/test";

/**
 * The three catalog screens, driven in a real browser.
 *
 * WHY THIS EXISTS RATHER THAN A UNIT TEST. `derive.test.ts` already covers the
 * two derived conditions, and it would pass on a screen that never renders.
 * playwright.config.ts records why this project committed browser checks at
 * all: three defects passed a green build, and all three were found by driving
 * the real page. A screen whose route is wired to nothing looks identical to a
 * working one in vitest.
 *
 * WHAT IT PINS. Three things, and the third is the whole point of the module.
 *
 *   1. The title and the definition render in EVERY state. The first draft put
 *      the header inside the four-state boundary, so with no endpoint behind
 *      the screen the whole page was one grey sentence and no title. This test
 *      is what stops that coming back.
 *
 *   2. There is exactly ONE h1. Both of the above have now been true and wrong
 *      at the same time: the screen printed a correct title while the shell
 *      printed its own, and every page named itself twice.
 *
 *   3. Each screen shows the state its DATA justifies, and not a neighbouring
 *      one. UI-PLAN rule 7: "An empty state means there is nothing here yet; a
 *      missing endpoint means this does not work yet." Until `a0ef4dd` only the
 *      second had ever rendered here. Both are live now — agent templates has
 *      rows, skills and sources are genuinely empty — and the assertion that
 *      the OTHER states are absent is what makes this a test rather than a
 *      screenshot.
 */

/**
 * `populated` IS THE DATABASE'S STATE, not a preference, and it is the reason
 * these three screens assert different things.
 *
 * As of `a0ef4dd`: `agent_templates` holds 7 rows; `skills` and `skill_sources`
 * hold 0, confirmed against the database rather than inferred from a 200. When
 * skills are seeded, flip the flag and these tests follow. They are written to
 * fail rather than to quietly pass if that happens and nobody updates them,
 * which is the point of pinning it here instead of asking the page.
 */
const SCREENS = [
	{
		path: "/catalog/skills",
		id: "skills",
		title: "Skills",
		/** The first words of TERM.skill. Enough to pin the slot, not the prose. */
		definition: "A skill is a piece of know-how",
		populated: false,
		subtitleContains: "",
	},
	{
		path: "/catalog/agents",
		id: "agents",
		title: "Agent templates",
		definition: "An agent template is a reusable description",
		populated: true,
		subtitleContains: "run by a model",
	},
	{
		path: "/catalog/sources",
		id: "sources",
		title: "Skill sources",
		definition: "A source is where a skill came from",
		populated: false,
		subtitleContains: "",
	},
] as const;

/**
 * These routes are `device: construction`, desktop only, and DeviceGuard
 * refuses a narrow viewport. Playwright's Desktop Chrome default is 1280x720,
 * which passes; setting it explicitly means a change to that default shows up
 * as a device-guard failure rather than as three mystery timeouts.
 */
test.use({ viewport: { width: 1440, height: 900 } });

for (const screen of SCREENS) {
	test.describe(screen.title, () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(screen.path);
		});

		test("names itself once, whatever the read did", async ({ page }) => {
			// The SHELL's header now, claimed via usePageHeader. This assertion
			// used to target the screen's own in-content header.
			await expect(page.getByTestId("page-header-title")).toHaveText(
				screen.title,
			);
			// Section 12 rule 5. The one plain sentence naming the jargon is on the
			// header, not in a glossary, and it is not conditional on data.
			await expect(page.getByTestId("page-definition")).toContainText(
				screen.definition,
			);
		});

		/**
		 * THE COUNTS ARE A LATE FIELD, and both halves are testable now.
		 *
		 * `usePageHeader` is called once, unconditionally, with `subtitle`
		 * absent until there is something to count. An earlier version of this
		 * test could only assert the absent half, because no endpoint existed
		 * and every screen was unbuilt. `a0ef4dd` made the other half real:
		 * agent templates has seven rows and carries a subtitle, skills and
		 * sources have zero and carry none.
		 *
		 * Zero rows is deliberately the SAME treatment as no rows yet. "0 skills
		 * · 0 revoked · from 0 sources" is measured and true and useless: it
		 * sits above an EmptyState that says the same thing better, with the
		 * reason attached.
		 */
		test("prints counts only when it has something to count", async ({
			page,
		}) => {
			await expect(page.getByTestId("page-header-title")).toBeVisible();
			const subtitle = page.getByTestId("page-subtitle");
			if (screen.populated) {
				await expect(subtitle).toHaveCount(1);
				await expect(subtitle).toContainText(screen.subtitleContains);
			} else {
				await expect(subtitle).toHaveCount(0);
			}
		});

		/**
		 * RULE 7'S DISTINCTION, LIVE ON BOTH SIDES FOR THE FIRST TIME.
		 *
		 * "An empty state means there is nothing here yet; a missing endpoint
		 * means this does not work yet." Until the endpoints landed, only the
		 * second had ever rendered. `skills` and `skill_sources` are genuinely
		 * empty at zero rows, confirmed against the database, so those two now
		 * render a true EmptyState and NOT the not-built treatment.
		 *
		 * Asserting the absence of the other state is the whole test. Either one
		 * alone passes on a screen showing the wrong one.
		 */
		test("shows the state its data actually justifies", async ({ page }) => {
			await expect(page.getByTestId("page-header-title")).toBeVisible();
			// No endpoint is failing, so the not-built treatment must not appear
			// on any of the three.
			await expect(page.getByTestId(`${screen.id}-not-built`)).toHaveCount(0);
			await expect(page.getByTestId("error-state")).toHaveCount(0);

			if (screen.populated) {
				await expect(page.getByTestId("surface-success")).toBeVisible();
				await expect(page.getByTestId("empty-state")).toHaveCount(0);
			} else {
				await expect(page.getByTestId("surface-empty")).toBeVisible();
				await expect(page.getByTestId("empty-state")).toBeVisible();
			}
		});

		/**
		 * THE REGRESSION THAT PROMPTED THE MOVE, pinned so it cannot come back.
		 *
		 * When the title moved into the shell header, routes still printed their
		 * own, and every page rendered its name as two h1s. On /catalog/sources it
		 * was worse than duplication: the shell's nav-derived fallback said
		 * "Sources" and the screen said "Skill sources", two names for one page.
		 *
		 * Counting h1s rather than asserting one testid is the point. A second
		 * heading from anywhere — this module, the shell, a primitive that grows
		 * one — fails this, which a testid-scoped assertion would not.
		 */
		test("has exactly one h1, and it is the page's name", async ({ page }) => {
			await expect(page.getByTestId("page-header-title")).toBeVisible();
			await expect(page.locator("h1")).toHaveCount(1);
			await expect(page.locator("h1")).toHaveText(screen.title);
		});

		test("renders exactly one of the four states", async ({ page }) => {
			const states = [
				"surface-loading",
				"surface-empty",
				"surface-error",
				"surface-success",
			];
			/*
			 * WAIT FOR THE VIEW TO MOUNT FIRST, then poll.
			 *
			 * `_app` is `ssr: false`, so the first paint has no Surface in it at all
			 * and a bare count() does not retry — the first version of this test
			 * read 0 against a screen that was working.
			 *
			 * Polling alone was still not enough, and that took a second run to see.
			 * expect.poll's default window is 5s, which races the dev server's
			 * on-demand compile of these modules: the failure moved between screens
			 * run to run and always read 0, never 2. So it was measuring compile
			 * time, not the component. Awaiting the claimed title first is the same
			 * auto-waiting the other tests here get for free from toBeVisible, and
			 * it makes this assertion about the four states rather than about how
			 * warm Vite is.
			 */
			await expect(page.getByTestId("page-header-title")).toBeVisible();
			await expect
				.poll(async () => {
					const present = await Promise.all(
						states.map((state) => page.getByTestId(state).count()),
					);
					return present.reduce((a, b) => a + b, 0);
				})
				.toBe(1);
		});

		/*
		 * A "says not built rather than empty" test stood here and is deleted
		 * rather than skipped.
		 *
		 * It was keyed on the endpoint so it would retire itself the day the route
		 * landed, and that worked: `a0ef4dd` landed and it began skipping. But a
		 * permanently skipping test reports as a covered case in the run summary,
		 * which is the same objection that kept a border assertion out of this
		 * file. Retiring itself was the right mechanism; staying in the file
		 * afterwards was not.
		 *
		 * What it protected is not lost. "shows the state its data actually
		 * justifies" above asserts the not-built treatment is ABSENT on all three
		 * screens, so a route that breaks and silently renders an empty catalog
		 * still fails the suite.
		 */

		test("logs no error to the console", async ({ page }) => {
			const errors: string[] = [];
			page.on("console", (message) => {
				if (message.type() === "error") errors.push(message.text());
			});
			await page.reload();
			await expect(page.getByTestId("page-header-title")).toBeVisible();
			/*
			 * THE BROWSER'S OWN 404 LINE IS FILTERED, and the first version of this
			 * test did not filter it and asserted an empty array. The comment
			 * justifying that said a network 404 "is not a console error message
			 * either". That was simply wrong: Chromium logs "Failed to load
			 * resource: the server responded with a status of 404" at error level.
			 *
			 * It was also intermittent — the message arrives asynchronously, so two
			 * of the three screens passed and one failed on the same run. A test
			 * that fails one time in three teaches people to re-run it.
			 *
			 * What is filtered is precisely the expected failed read. Anything else
			 * at error level, a React warning or a thrown render, still fails.
			 */
			const real = errors.filter(
				(text) => !/Failed to load resource.*40[0-9]/.test(text),
			);
			expect(real).toEqual([]);
		});
	});
}

/*
 * THERE IS NO BROWSER ASSERTION HERE FOR THE BORDER RULING, and that absence is
 * deliberate rather than an omission.
 *
 * The plan's distinction — a line BETWEEN two things goes, a border AROUND one
 * thing stays — applies to SectionCard, MetricStat and DataTable. None of the
 * three renders on any catalog screen today, because every catalog read fails
 * and the not-built state replaces the whole body. A test written against them
 * would skip on every run.
 *
 * A test that always skips is worse than no test: it reports as a covered case
 * in the run summary. So the divider removal in ui.tsx is verified by reading
 * the code and by check-tokens, and it is NOT verified in a browser. It becomes
 * testable the day the catalog endpoints exist, which is the same day the
 * fourth test above stops skipping.
 */
