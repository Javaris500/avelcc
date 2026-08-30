import { describe, expect, it } from "vitest";

import { fixtureMission } from "#/modules/export/render/fixture-mission";
import { manifestJson } from "#/modules/export/render/manifest";
import { render } from "#/modules/export/render/render";
import {
	type ApprovableRow,
	packageHashOf,
	parseRepoUrl,
	refForDelivery,
	refuseUnapprovablePreview,
} from "#/modules/export/service";

/**
 * The pure decisions inside the export service.
 *
 * These exist because a code review found ten bugs in this module and the fix
 * commit shipped with no tests at all — including the two that could have
 * written to the wrong repository. Those were verified once, by hand, over
 * HTTP; a manual check does not survive into CI, so each of them is pinned
 * here against the behaviour that was actually wrong.
 *
 * The orchestration around these is exercised against real Neon through the
 * export routes. What is here is everything that can be decided without a
 * database, which is where the safety rules live.
 */

/* ── the package hash ─────────────────────────────────────────────────── */

describe("packageHashOf", () => {
	/**
	 * THE BUG, PINNED. The hash was computed over every rendered entry
	 * including manifest.json, while the manifest's own package_sha256 excludes
	 * it — a manifest cannot hash itself. The two could never be equal, so the
	 * value persisted for querying disagreed with the artifact and was published
	 * into PR bodies as "Package sha256".
	 *
	 * The determinism gate could not catch this: it compares the value against
	 * itself, so a consistently wrong number passes every time. This assertion
	 * compares it against the OTHER side — what the package itself states.
	 */
	it("equals the package_sha256 the rendered manifest states", () => {
		const files = render(fixtureMission);
		const manifest = manifestJson(fixtureMission, files) as {
			package_sha256: string;
		};
		expect(packageHashOf(files)).toBe(manifest.package_sha256);
	});

	it("excludes manifest.json, and including it would change the answer", () => {
		const files = render(fixtureMission);
		expect(files.has("manifest.json")).toBe(true);

		const withManifest = new Map(files);
		const withoutManifest = new Map(files);
		withoutManifest.delete("manifest.json");

		// Dropping the file the function already ignores must not move the hash.
		expect(packageHashOf(withManifest)).toBe(packageHashOf(withoutManifest));
	});

	it("moves when any other file's content moves", () => {
		const files = render(fixtureMission);
		const mutated = new Map(files);
		mutated.set("MISSION.md", new TextEncoder().encode("tampered"));
		expect(packageHashOf(mutated)).not.toBe(packageHashOf(files));
	});
});

/* ── the device boundary ──────────────────────────────────────────────── */

const row = (over: Partial<ApprovableRow> = {}): ApprovableRow => ({
	id: "e1",
	dryRun: true,
	status: "previewed",
	targetKind: "github_push",
	...over,
});

describe("refuseUnapprovablePreview", () => {
	it("accepts a real preview for the same target", () => {
		expect(refuseUnapprovablePreview(row(), "github_push")).toBeNull();
	});

	/**
	 * THE BUG, PINNED. Only the id was checked, so a COMPLETED DELIVERY
	 * satisfied the guard. A github_push could be authorized by a row no
	 * operator ever reviewed as a blast radius — which is the entire rule
	 * checkPreviewRequired exists to enforce.
	 */
	it("refuses a completed delivery", () => {
		const reason = refuseUnapprovablePreview(
			row({ dryRun: false, status: "done" }),
			"github_push",
		);
		expect(reason).toMatch(/not an approved preview/);
	});

	it("refuses a row that failed on its way through previewing", () => {
		expect(
			refuseUnapprovablePreview(row({ status: "failed" }), "github_push"),
		).toMatch(/not an approved preview/);
	});

	/** Still mid-flight. A preview authorizes nothing until it has finished. */
	it("refuses a preview that has not reached previewed", () => {
		for (const status of [
			"pending",
			"rendering",
			"verifying",
			"previewing",
		] as const) {
			expect(refuseUnapprovablePreview(row({ status }), "github_push")).toMatch(
				/not an approved preview/,
			);
		}
	});

	/**
	 * A zip's blast radius is empty by construction — it has no target
	 * repository — so accepting one as approval for a push would wave through a
	 * delivery whose radius was never computed at all.
	 */
	it("refuses a preview computed for a different target", () => {
		expect(
			refuseUnapprovablePreview(row({ targetKind: "zip" }), "github_push"),
		).toMatch(/does not authorize another/);
	});

	it("names the row, so an operator can go and look at it", () => {
		const reason = refuseUnapprovablePreview(
			row({ id: "abc-123", dryRun: false, status: "done" }),
			"zip",
		);
		expect(reason).toContain("abc-123");
	});
});

/* ── which branch a delivery renders against ──────────────────────────── */

describe("refForDelivery", () => {
	/**
	 * THE BUG, PINNED, and the one with the worst failure mode. createExport
	 * hardcoded "main" while previewExport honoured the caller's ref. A preview
	 * taken against `develop` and approved re-read main's tree: usually that
	 * failed staleness, but where the two tips coincided it PASSED and the
	 * delivery branch was also main — a github_push approved against develop
	 * writing to main.
	 */
	it("lets a linked preview's ref win over the request", () => {
		expect(refForDelivery("develop", "main")).toBe("develop");
		expect(refForDelivery("release/2.0", undefined)).toBe("release/2.0");
	});

	it("falls back to the request when no preview is linked", () => {
		expect(refForDelivery(null, "develop")).toBe("develop");
	});

	it("defaults to main when neither is given", () => {
		expect(refForDelivery(null, undefined)).toBe("main");
	});

	/**
	 * The precedence is the safety property, so it is asserted as an ordering
	 * rather than as three independent cases: preview, then request, then the
	 * default, and never the other way round.
	 */
	it("never lets the request override a preview", () => {
		const preview = "develop";
		for (const requested of ["main", "master", undefined]) {
			expect(refForDelivery(preview, requested)).toBe(preview);
		}
	});
});

/* ── repository resolution ────────────────────────────────────────────── */

describe("parseRepoUrl", () => {
	it("reads owner and repo from the canonical form", () => {
		expect(parseRepoUrl("https://github.com/octocat/Spoon-Knife")).toEqual({
			owner: "octocat",
			repo: "Spoon-Knife",
		});
	});

	it("tolerates a .git suffix, a trailing slash, http, and padding", () => {
		for (const url of [
			"https://github.com/octocat/Spoon-Knife.git",
			"https://github.com/octocat/Spoon-Knife/",
			"http://github.com/octocat/Spoon-Knife",
			"  https://github.com/octocat/Spoon-Knife  ",
		]) {
			expect(parseRepoUrl(url)).toEqual({
				owner: "octocat",
				repo: "Spoon-Knife",
			});
		}
	});

	/**
	 * Returning null is what becomes a refusal upstream. Anything that silently
	 * parsed here would send a delivery at a repository nobody named, so the
	 * failure cases matter more than the success ones.
	 */
	it("refuses anything that is not a github owner/repo url", () => {
		for (const url of [
			"https://example.com/octocat/Spoon-Knife",
			"https://github.com/octocat",
			"https://github.com/",
			"git@github.com:octocat/Spoon-Knife.git",
			"octocat/Spoon-Knife",
			"",
		]) {
			expect(parseRepoUrl(url)).toBeNull();
		}
	});

	/**
	 * A deeper path is not a repository. `.../tree/main/src` names a directory
	 * inside one, and quietly reading `Spoon-Knife` out of it would deliver to
	 * the whole repository while the operator believed they had scoped it.
	 */
	it("refuses a url that points inside a repository", () => {
		expect(
			parseRepoUrl("https://github.com/octocat/Spoon-Knife/tree/main/src"),
		).toBeNull();
	});
});
