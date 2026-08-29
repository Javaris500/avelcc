import { describe, expect, it } from "vitest";

import { parseRepoUrl } from "#/modules/export/service";

/**
 * The pure half of the service. The orchestration itself is exercised against
 * real Neon rather than mocked — see the export routes — but repo resolution is
 * a pure function guarding the most dangerous input in the module, so it is
 * tested here where every case is cheap.
 *
 * These paths are currently SHADOWED at runtime: the connection requirement
 * (`exports_remote_target_requires_connection`) refuses every GitHub export
 * before repo resolution is reached, because `connections` is empty and nothing
 * can populate it. That makes these tests the only thing verifying this logic
 * until Connection provisioning exists, which is precisely why they are here
 * rather than left to the live checks.
 */
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
	 * Returning null is what turns into a refusal upstream. Anything that
	 * silently parsed here would send a delivery at a repository nobody named,
	 * so the failure cases matter more than the success ones.
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
	 * A deeper path is not a repository. `…/tree/main/src` names a directory
	 * inside one, and quietly reading `Spoon-Knife` out of it would deliver to
	 * the repo while the operator believed they had scoped it.
	 */
	it("refuses a url that points inside a repository", () => {
		expect(
			parseRepoUrl("https://github.com/octocat/Spoon-Knife/tree/main/src"),
		).toBeNull();
	});
});
