import { expect, test } from "@playwright/test";

/**
 * The device boundary, tested at the POSITIVE path.
 *
 * This guard was silently unwired for hours. The edit that was meant to add it
 * used the wrong indentation and became a no-op, and the check written at the
 * time only asserted the guard does NOT fire on a phone-allowed route — which
 * passes identically whether the guard is correct or entirely absent.
 *
 * A check that cannot distinguish two states is not a check. So the first test
 * here is the one that was missing: on a phone, a construction route MUST be
 * refused. If the guard is ever unwired again, that goes red immediately.
 */

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

test("a phone is refused a construction route", async ({ page }) => {
	await page.setViewportSize(PHONE);
	await page.goto("/clients");
	await expect(page.getByTestId("desktop-required")).toBeVisible();
});

test("a phone is allowed a capture route", async ({ page }) => {
	await page.setViewportSize(PHONE);
	await page.goto("/activity");
	await expect(page.getByTestId("desktop-required")).toHaveCount(0);
	await expect(page.getByTestId("page-empty")).toBeVisible();
});

test("a desktop is allowed a construction route", async ({ page }) => {
	await page.setViewportSize(DESKTOP);
	await page.goto("/clients");
	await expect(page.getByTestId("desktop-required")).toHaveCount(0);
	/**
	 * ASSERTS THE ROUTE'S OWN CONTENT, and that is the whole fix.
	 *
	 * This line read `page-empty` until `/clients` grew a table. `page-empty` was
	 * never evidence that a construction route rendered on a desktop — it was
	 * evidence that this particular route happened to be UNBUILT. It passed for
	 * reasons that had nothing to do with the device boundary, and went red the
	 * moment the route got content, which is backwards for a guard.
	 *
	 * That is the second instance of the defect this file's own header was
	 * written about: a check that cannot distinguish two states is not a check.
	 * `clients-pane` renders only when the construction route got through the
	 * guard, so it fails if the guard wrongly fires and cannot pass by accident.
	 *
	 * `a phone is allowed a capture route` above still asserts `page-empty`
	 * against `/activity`, which IS still a placeholder. Same latent defect, not
	 * yet fired. It needs the same treatment the day that route gets content.
	 *
	 * Traced by avel-c2.
	 */
	await expect(page.getByTestId("clients-pane")).toBeVisible();
});

test("the refusal explains itself and offers a way forward", async ({
	page,
}) => {
	await page.setViewportSize(PHONE);
	await page.goto("/clients");
	// Not a redirect and not a blank: it says what it is, why, and how to
	// send yourself the link.
	await expect(page.getByTestId("desktop-required-url")).toContainText(
		"/clients",
	);
	await expect(page.getByTestId("desktop-required-copy")).toBeVisible();
	await expect(page.getByTestId("desktop-required-email")).toBeVisible();
});
