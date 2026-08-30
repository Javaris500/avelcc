import { expect, test } from "@playwright/test";

/**
 * The three catalog screens, driven in a real browser.
 *
 * WHY THIS EXISTS RATHER THAN A UNIT TEST. `contract.test.ts` already covers
 * the two derived conditions, and it would pass on a screen that never renders.
 * playwright.config.ts records why this project committed browser checks at
 * all: three defects passed a green build, and all three were found by driving
 * the real page. A screen whose route is wired to nothing looks identical to a
 * working one in vitest.
 *
 * WHAT IT PINS. Two things, and the second is the whole point of the module.
 *
 *   1. The title and the definition render in EVERY state. The first draft put
 *      the header inside the four-state boundary, so with no endpoint behind
 *      the screen the whole page was one grey sentence and no title. This test
 *      is what stops that coming back.
 *
 *   2. Not-built is not empty and not an error. UI-PLAN rule 7: "An empty state
 *      means there is nothing here yet; a missing endpoint means this does not
 *      work yet." Those render differently on purpose, and the assertion that
 *      the OTHER two are absent is what makes this a test rather than a
 *      screenshot.
 */

const SCREENS = [
	{
		path: "/catalog/skills",
		id: "skills",
		title: "Skills",
		/** The first words of TERM.skill. Enough to pin the slot, not the prose. */
		definition: "A skill is a piece of know-how",
	},
	{
		path: "/catalog/agents",
		id: "agents",
		title: "Agent templates",
		definition: "An agent template is a reusable description",
	},
	{
		path: "/catalog/sources",
		id: "sources",
		title: "Skill sources",
		definition: "A source is where a skill came from",
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

		test("names itself, whatever the read did", async ({ page }) => {
			const header = page.getByTestId(`${screen.id}-header`);
			await expect(header.getByTestId(`${screen.id}-header-title`)).toHaveText(
				screen.title,
			);
			// Section 12 rule 5. The one plain sentence naming the jargon is on the
			// header, not in a glossary, and it is not conditional on data.
			await expect(
				header.getByTestId(`${screen.id}-header-definition`),
			).toContainText(screen.definition);
		});

		test("renders exactly one of the four states", async ({ page }) => {
			const states = [
				"surface-loading",
				"surface-empty",
				"surface-error",
				"surface-success",
			];
			/*
			 * POLLED, not counted once. `_app` is `ssr: false`, so the first paint
			 * has no Surface in it at all and a bare count() does not retry — the
			 * first version of this test read 0 and failed against a screen that
			 * was working. Found by running it.
			 */
			await expect
				.poll(async () => {
					const present = await Promise.all(
						states.map((state) => page.getByTestId(state).count()),
					);
					return present.reduce((a, b) => a + b, 0);
				})
				.toBe(1);
		});

		test("says not built rather than empty while no endpoint answers", async ({
			page,
			request,
		}) => {
			/*
			 * KEYED ON THE ENDPOINT, not on today's state. The day someone builds
			 * the route this skips instead of failing, and the two tests above keep
			 * running. A test that has to be deleted to ship a feature gets deleted
			 * without being read.
			 */
			const endpoints: Record<string, string> = {
				skills: "/api/skills",
				agents: "/api/agent-templates",
				sources: "/api/skill-sources",
			};
			const probe = await request.get(endpoints[screen.id]);
			test.skip(
				probe.ok(),
				`${endpoints[screen.id]} now answers; this screen has real states to test instead`,
			);

			const notBuilt = page.getByTestId(`${screen.id}-not-built`);
			await expect(notBuilt).toBeVisible();
			await expect(notBuilt).toHaveAttribute("data-built", "false");
			await expect(notBuilt).toContainText("Not built.");

			// The distinction rule 7 draws. An empty state here would tell the
			// operator their catalogue is empty when it is actually unreachable.
			await expect(page.getByTestId("empty-state")).toHaveCount(0);
			// And an ErrorState would put a red code and a retry in front of an
			// operator who did nothing wrong and can do nothing about it.
			await expect(page.getByTestId("error-state")).toHaveCount(0);
			await expect(page.getByTestId("error-retry")).toHaveCount(0);
		});

		test("logs no error to the console", async ({ page }) => {
			const errors: string[] = [];
			page.on("console", (message) => {
				if (message.type() === "error") errors.push(message.text());
			});
			await page.reload();
			await expect(page.getByTestId(`${screen.id}-header`)).toBeVisible();
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
