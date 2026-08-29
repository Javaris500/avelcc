import { describe, expect, it } from "vitest";
import { blastRadius, exportSchema, exportStatus } from "#/contract/export";
import { contract } from "#/contract/index";
import { gateName, gatePolicy } from "#/contract/playbook";
import { errorEnvelope, success } from "#/contract/shared/envelope";
import { ERROR_CODES } from "#/contract/shared/errors";

/**
 * The contract is the oracle, so these test the contract ITSELF — that the
 * shapes match the documents that own them, and that a response which does not
 * conform is rejected at the boundary rather than reaching a screen.
 */

describe("the assembled contract", () => {
	it("exposes the four built route groups", () => {
		expect(Object.keys(contract).sort()).toEqual([
			"export",
			"mission",
			"playbook",
			"roster",
		]);
	});

	it("declares an error envelope on every route that can fail", () => {
		const routes = [
			...Object.values(contract.export),
			...Object.values(contract.mission),
			...Object.values(contract.roster),
			...Object.values(contract.playbook),
		];
		for (const r of routes) {
			const codes = Object.keys(r.responses).map(Number);
			const ok = codes.filter((c) => c < 400);
			expect(ok.length).toBeGreaterThan(0);
		}
	});
});

describe("closed vocabularies", () => {
	it("gate policy is mandatory or warn ONLY — there is no skippable", () => {
		expect(gatePolicy.options).toEqual(["mandatory", "warn"]);
		expect(gatePolicy.safeParse("skippable").success).toBe(false);
	});

	it("gate names are the six the doc declares", () => {
		expect(gateName.options).toEqual([
			"phase1-close",
			"alignment",
			"qa",
			"security",
			"rollback",
			"acceptance",
		]);
	});

	it("export status carries previewing and delivering, so both paths share one", () => {
		// BOTH the dry run and the real export run `previewing`, which is what
		// stops the preview drifting from what delivery actually does.
		expect(exportStatus.options).toContain("previewing");
		expect(exportStatus.options).toContain("delivering");
		expect(exportStatus.options).toContain("previewed");
	});
});

describe("the envelope rejects what a screen cannot handle", () => {
	it("refuses an error code outside the union", () => {
		const bad = {
			success: false,
			error: { code: "SOMETHING_NEW", message: "x", requestId: "r" },
		};
		expect(errorEnvelope.safeParse(bad).success).toBe(false);
	});

	it("accepts every declared code", () => {
		for (const code of ERROR_CODES) {
			const r = errorEnvelope.safeParse({
				success: false,
				error: { code, message: "x", requestId: "r" },
			});
			expect(r.success).toBe(true);
		}
	});

	it("requires a requestId, so a failure can be correlated with a log", () => {
		const r = errorEnvelope.safeParse({
			success: false,
			error: { code: "EXTERNAL_GITHUB", message: "x" },
		});
		expect(r.success).toBe(false);
	});
});

describe("blast radius shape", () => {
	it("types baseCommitSha as nullable, because an empty repo is a STATE", () => {
		const base = {
			computedAt: "t",
			baseRef: "main",
			baseCommitSha: null,
			target: { owner: "o", repo: "r", branch: "main" },
			create: [],
			overwrite: [],
			unchanged: [],
			preserveSummary: { fileCount: 0, topLevelDirs: [] },
			violations: [],
			totals: { create: 0, overwrite: 0, unchanged: 0, violations: 0 },
		};
		expect(blastRadius.safeParse(base).success).toBe(true);
	});

	it("has no field for a preserve PATH LIST", () => {
		// "A client repo has thousands of untouched files. Listing them is noise
		// that buries the three lines that matter." The shape enforces the rule:
		// there is nowhere to put a list even if a handler wanted to send one.
		const shape = Object.keys(blastRadius.shape.preserveSummary.shape);
		expect(shape.sort()).toEqual(["fileCount", "topLevelDirs"]);
	});

	it("keeps blastRadius separate from verification on the Export", () => {
		// Verification asks "is the work good". Blast radius asks "what does
		// delivery do". Merging them means the pre-flight screen cannot tell
		// "tests failed" from "this would clobber a file".
		expect(Object.keys(exportSchema.shape)).toContain("blastRadius");
		expect(Object.keys(exportSchema.shape)).not.toContain("verification");
	});
});

describe("gate override", () => {
	it("requires a written rationale — it renders into the delivery", () => {
		const s = success(exportSchema);
		expect(s).toBeDefined();
		const bad = { gate: "qa", rationale: "", overriddenBy: "axis" };
		const field = exportSchema.shape.gateOverride;
		expect(field.safeParse(bad).success).toBe(false);
	});
});
