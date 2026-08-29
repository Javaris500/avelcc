import { fixtureMission } from "#/modules/export/render/fixture-mission";
import type { RenderMission } from "#/modules/export/render/types";

/**
 * A mission built to make the locale hazard observable.
 *
 * GOLDEN-FIXTURE prescribes rendering once under `TZ=Asia/Tokyo LANG=tr_TR` and
 * diffing the hashes. Run against the slice-1 fixture that check CANNOT FAIL:
 * every path in the package sorts identically under Turkish and root collation,
 * because none of them contains a character pair the two disagree about.
 * Verified by mutation — swapping the codepoint comparator for `localeCompare`
 * left all 25 tests green.
 *
 * Turkish orders dotted and dotless I differently from every other locale, so
 * these two convention slugs sort one way under `localeCompare` in tr-TR,
 * the other way in en-US, and a third way by codepoint. Ordering feeds the
 * manifest's `files` array and therefore `package_sha256`, so a comparator
 * regression moves the package hash rather than hiding.
 *
 * This is a probe, not a mission anyone would run.
 */
export const localeProbeMission: RenderMission = {
	...fixtureMission,
	conventions: [
		{ slug: "Ilk", body: "# Ilk\n\nDotted capital I.\n" },
		{ slug: "ilk", body: "# ilk\n\nDotless lowercase i.\n" },
		...fixtureMission.conventions,
	],
};
