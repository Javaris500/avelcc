import { expect, test } from "@playwright/test";

/**
 * The blast radius, end to end.
 *
 * This is the first screen in the app that reads anything real: the rendered
 * side is the golden fixture on disk, the remote side is a live GitHub Trees
 * call, and gitBlobSha computes the comparison. Everything else in the product
 * still renders an empty state.
 */
const PREFLIGHT = "/missions/01J8Z4K2QW3E5R7T9Y1V3J5P7A/exports/new";

test("classifies the golden fixture against a real repository", async ({
	page,
}) => {
	await page.goto(PREFLIGHT);
	await expect(page.getByTestId("blast-radius")).toBeVisible({
		timeout: 20000,
	});

	// The base SHA is a first-class fact, not a surprise at submit.
	await expect(page.getByTestId("blast-target")).toHaveText(
		"octocat/Spoon-Knife",
	);
	await expect(page.getByTestId("blast-base-sha")).not.toHaveText(
		"empty repository",
	);

	// PRESERVE is a count plus top-level entries — never a path list.
	await expect(page.getByTestId("preserve-count")).toContainText(
		"files untouched",
	);
	await expect(page.getByTestId("preserve-dirs")).toBeVisible();
});

test("deliver stays disabled by state", async ({ page }) => {
	await page.goto(PREFLIGHT);
	await expect(page.getByTestId("blast-radius")).toBeVisible({
		timeout: 20000,
	});
	// "Deliver is disabled by state, never by styling." Nothing has been
	// previewed and approved, so the attribute — not a class — says so.
	await expect(page.getByTestId("preflight-deliver")).toBeDisabled();
});

test("a gateway failure renders through the error map, keyed on the code", async ({
	page,
}) => {
	// Codes are the contract; messages change freely. The screen must key on
	// the code and never parse prose.
	await page.route("**/api/preflight/blast-radius*", (r) =>
		r.fulfill({
			status: 502,
			contentType: "application/json",
			body: JSON.stringify({
				success: false,
				error: { code: "TREE_TOO_LARGE", message: "x" },
			}),
		}),
	);
	await page.goto(PREFLIGHT);
	await expect(page.getByTestId("surface-error")).toBeVisible({
		timeout: 20000,
	});
	await expect(page.getByTestId("error-code")).toHaveText("TREE_TOO_LARGE");
});

test("renders overwrites as destructive when the remote has the same paths", async ({
	page,
}) => {
	// No public repository contains a .avel/ package, so the OVERWRITE branch
	// has no vehicle against real data. Driven from a stubbed response rather
	// than left uncovered — this is the branch that tells an operator a
	// delivery is destructive, so it is the last one that should go untested.
	await page.route("**/api/preflight/blast-radius*", (r) =>
		r.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				success: true,
				data: {
					create: [],
					overwrite: [
						{
							path: ".avel/MISSION.md",
							size: 10,
							blobSha: "a",
							remoteBlobSha: "b",
						},
					],
					unchanged: [],
					preserveSummary: { fileCount: 2412, topLevelDirs: ["src", "tests"] },
					violations: [],
					totals: { create: 0, overwrite: 1, unchanged: 0, violations: 0 },
					computedAt: "2026-01-01T00:00:00.000Z",
					baseRef: "main",
					baseCommitSha: "a3f9c21b",
					target: { owner: "meridian", repo: "app", branch: "main" },
				},
			}),
		}),
	);
	await page.goto(PREFLIGHT);
	await expect(page.getByTestId("overwrite-list")).toBeVisible({
		timeout: 20000,
	});
	await expect(page.getByTestId("overwrite-.avel/MISSION.md")).toHaveText(
		"destructive",
	);
	await expect(page.getByTestId("preserve-count")).toContainText("2412");
});
