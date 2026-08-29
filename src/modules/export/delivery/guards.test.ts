import { describe, expect, it } from "vitest";

import { isOverridable } from "#/contract/shared/errors";
import type { Violation } from "#/modules/export/blast/types";
import {
	checkDeliverable,
	checkDeterminism,
	checkNoViolations,
	checkPreviewFresh,
	checkPreviewMatchesMission,
	checkPreviewRequired,
} from "#/modules/export/delivery/guards";
import type { PreviewFacts } from "#/modules/export/delivery/types";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const TIP_1 = "1".repeat(40);
const TIP_2 = "2".repeat(40);
const MISSION = "11111111-1111-4111-8111-111111111111";

const preview = (over: Partial<PreviewFacts> = {}): PreviewFacts => ({
	id: "prev-1",
	missionId: MISSION,
	snapshotSha256: SHA_A,
	baseCommitSha: TIP_1,
	violations: [],
	...over,
});

const violation = (over: Partial<Violation> = {}): Violation => ({
	code: "PATH_OUTSIDE_ALLOWED",
	path: "src/index.ts",
	detail: "outside .avel/",
	...over,
});

describe("checkPreviewRequired", () => {
	it("refuses a github_push with no linked preview", () => {
		const r = checkPreviewRequired("github_push", null);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.failure.code).toBe("PREVIEW_REQUIRED");
	});

	/**
	 * The device boundary. A push initiated without a preview must fail at the
	 * guard, not at a screen — that is the whole claim the contract comment
	 * makes, so it gets its own assertion rather than riding on the case above.
	 */
	it("refuses the push even when a radius is otherwise clean", () => {
		const r = checkDeliverable({
			kind: "github_push",
			missionId: MISSION,
			preview: null,
			currentTipSha: TIP_1,
			realSnapshotSha256: SHA_A,
			violations: [],
		});
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.failure.code).toBe("PREVIEW_REQUIRED");
	});

	it("allows a github_pr with no preview, but says so", () => {
		const r = checkPreviewRequired("github_pr", null);
		expect(r.ok).toBe(true);
		expect(r.warning).toMatch(/never shown to an operator/);
	});

	it("does not care about a preview for a zip", () => {
		const r = checkPreviewRequired("zip", null);
		expect(r.ok).toBe(true);
		expect(r.warning).toBeUndefined();
	});
});

describe("checkPreviewMatchesMission", () => {
	it("rejects a preview belonging to another mission", () => {
		const r = checkPreviewMatchesMission(
			preview({ missionId: "22222222-2222-4222-8222-222222222222" }),
			MISSION,
		);
		expect(r.ok).toBe(false);
	});

	/**
	 * The hole the staleness check cannot see: another mission's preview has its
	 * own perfectly fresh tip, so freshness passes while the operator approved
	 * the radius of a different package.
	 */
	it("fires before freshness, on a preview whose tip is current", () => {
		const r = checkDeliverable({
			kind: "github_pr",
			missionId: MISSION,
			preview: preview({
				missionId: "22222222-2222-4222-8222-222222222222",
				baseCommitSha: TIP_1,
			}),
			currentTipSha: TIP_1,
			realSnapshotSha256: SHA_A,
			violations: [],
		});
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.failure.detail).toMatch(/belongs to mission/);
	});
});

describe("checkPreviewFresh — the TOCTOU guard", () => {
	it("passes when the tip has not moved", () => {
		expect(checkPreviewFresh(TIP_1, TIP_1).ok).toBe(true);
	});

	it("refuses when the tip moved, naming both shas", () => {
		const r = checkPreviewFresh(TIP_1, TIP_2);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.failure.code).toBe("PREVIEW_STALE");
			expect(r.failure.detail).toContain(TIP_1);
			expect(r.failure.detail).toContain(TIP_2);
		}
	});

	/** An empty repository has no tip, and that is a state, not an error. */
	it("treats two empty repositories as fresh", () => {
		expect(checkPreviewFresh(null, null).ok).toBe(true);
	});

	it("refuses when a repository stopped being empty", () => {
		const r = checkPreviewFresh(null, TIP_2);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.failure.code).toBe("PREVIEW_STALE");
	});

	/**
	 * The documented no-exception rule. There is no argument by which
	 * non-overlapping changes pass, because the function is given nothing with
	 * which to detect overlap — if this signature ever grows a file list, this
	 * test is the thing that should stop it.
	 */
	it("has no way to be told the changes do not overlap", () => {
		expect(checkPreviewFresh.length).toBe(2);
	});
});

describe("checkDeterminism", () => {
	it("passes on an identical re-render", () => {
		expect(checkDeterminism(SHA_A, SHA_A).ok).toBe(true);
	});

	it("refuses a re-render that does not reproduce the preview", () => {
		const r = checkDeterminism(SHA_A, SHA_B);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.failure.code).toBe("DETERMINISM_VIOLATION");
			expect(r.failure.detail).toContain("Do not deliver");
		}
	});

	it("is not an overridable code", () => {
		expect(isOverridable("DETERMINISM_VIOLATION")).toBe(false);
	});
});

describe("checkNoViolations", () => {
	it("passes on an empty radius", () => {
		expect(checkNoViolations([]).ok).toBe(true);
	});

	it("reports codes and paths, and caps the path list", () => {
		const many = Array.from({ length: 8 }, (_, i) =>
			violation({ path: `p${i}.ts` }),
		);
		const r = checkNoViolations(many);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.failure.detail).toContain("PATH_OUTSIDE_ALLOWED");
			expect(r.failure.detail).toContain("and 3 more");
		}
	});

	it("deduplicates codes across many files", () => {
		const r = checkNoViolations([
			violation({ path: "a.ts" }),
			violation({ path: "b.ts" }),
			violation({ code: "PATH_TRAVERSAL", path: "c.ts" }),
		]);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.failure.detail).toContain(
				"PATH_OUTSIDE_ALLOWED, PATH_TRAVERSAL",
			);
		}
	});

	/**
	 * THE LOAD-BEARING ONE. "Gates concern work quality; violations concern
	 * writing where you were not permitted." A gate override must not reach a
	 * violation, and the guard makes that unexpressible rather than merely
	 * disallowed: there is no parameter to pass an override through.
	 */
	it("accepts no override argument at all", () => {
		expect(checkNoViolations.length).toBe(1);
		expect(isOverridable("BLAST_RADIUS_VIOLATION")).toBe(false);
	});
});

describe("checkDeliverable — ordering", () => {
	it("passes a clean delivery and carries the pr warning through", () => {
		const r = checkDeliverable({
			kind: "github_pr",
			missionId: MISSION,
			preview: null,
			currentTipSha: TIP_1,
			realSnapshotSha256: SHA_A,
			violations: [],
		});
		expect(r.ok).toBe(true);
		expect(r.warning).toMatch(/never shown to an operator/);
	});

	it("passes a fully linked, fresh, deterministic, clean delivery", () => {
		const r = checkDeliverable({
			kind: "github_push",
			missionId: MISSION,
			preview: preview(),
			currentTipSha: TIP_1,
			realSnapshotSha256: SHA_A,
			violations: [],
		});
		expect(r.ok).toBe(true);
		expect(r.warning).toBeUndefined();
	});

	/** Staleness is about the client's repo; a wrong-mission preview is ours. */
	it("reports staleness before determinism", () => {
		const r = checkDeliverable({
			kind: "github_push",
			missionId: MISSION,
			preview: preview({ baseCommitSha: TIP_1, snapshotSha256: SHA_A }),
			currentTipSha: TIP_2,
			realSnapshotSha256: SHA_B,
			violations: [],
		});
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.failure.code).toBe("PREVIEW_STALE");
	});

	it("reports determinism before violations", () => {
		const r = checkDeliverable({
			kind: "github_push",
			missionId: MISSION,
			preview: preview(),
			currentTipSha: TIP_1,
			realSnapshotSha256: SHA_B,
			violations: [violation()],
		});
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.failure.code).toBe("DETERMINISM_VIOLATION");
	});

	/** A zip records no tip, so freshness must not be evaluated for it. */
	it("does not apply the tip check to a zip", () => {
		const r = checkDeliverable({
			kind: "zip",
			missionId: MISSION,
			preview: preview({ baseCommitSha: null }),
			currentTipSha: TIP_2,
			realSnapshotSha256: SHA_A,
			violations: [],
		});
		expect(r.ok).toBe(true);
	});

	it("still blocks a zip carrying violations", () => {
		const r = checkDeliverable({
			kind: "zip",
			missionId: MISSION,
			preview: null,
			currentTipSha: null,
			realSnapshotSha256: SHA_A,
			violations: [violation()],
		});
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.failure.code).toBe("BLAST_RADIUS_VIOLATION");
	});
});
