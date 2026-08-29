import { describe, expect, it } from "vitest";

import {
	assertTransition,
	canTransition,
	EXPORT_STATUSES,
	type ExportStatus,
	isTerminal,
	terminalStatusFor,
} from "#/modules/export/delivery/lifecycle";

describe("export lifecycle", () => {
	it("walks the dry-run path to previewed", () => {
		const path: ExportStatus[] = [
			"pending",
			"rendering",
			"verifying",
			"previewing",
			"previewed",
		];
		for (let i = 0; i < path.length - 1; i += 1) {
			expect(
				canTransition(path[i] as ExportStatus, path[i + 1] as ExportStatus),
			).toBe(true);
		}
	});

	it("walks the real path through delivering to done", () => {
		const path: ExportStatus[] = [
			"pending",
			"rendering",
			"verifying",
			"previewing",
			"delivering",
			"done",
		];
		for (let i = 0; i < path.length - 1; i += 1) {
			expect(
				canTransition(path[i] as ExportStatus, path[i + 1] as ExportStatus),
			).toBe(true);
		}
	});

	/**
	 * "It is never promoted. The real export re-renders from scratch." A dry run
	 * that could advance out of `previewed` would make the determinism gate
	 * skippable, since that gate exists only because the real export renders
	 * again rather than reusing the preview's output.
	 */
	it("cannot promote a previewed dry run to anything", () => {
		expect(isTerminal("previewed")).toBe(true);
		for (const s of EXPORT_STATUSES) {
			expect(canTransition("previewed", s)).toBe(false);
		}
	});

	it("can fail from every non-terminal state", () => {
		for (const s of EXPORT_STATUSES) {
			if (isTerminal(s) || s === "failed") continue;
			expect(canTransition(s, "failed")).toBe(true);
		}
	});

	it("has exactly three terminal states", () => {
		expect(EXPORT_STATUSES.filter(isTerminal).sort()).toEqual([
			"done",
			"failed",
			"previewed",
		]);
	});

	it("refuses to skip verification", () => {
		expect(canTransition("rendering", "previewing")).toBe(false);
		expect(canTransition("pending", "delivering")).toBe(false);
		expect(canTransition("verifying", "done")).toBe(false);
	});

	it("throws on an illegal transition, naming the legal ones", () => {
		expect(() => assertTransition("previewed", "delivering")).toThrow(
			/Illegal export transition previewed → delivering/,
		);
		expect(() => assertTransition("done", "rendering")).toThrow(/terminal/);
	});

	/**
	 * A PR is not done. Whether it merges is the client's decision, and
	 * reporting `done` would claim a delivery that is still sitting unreviewed.
	 */
	it("lands a PR on pr-open and the other two on done", () => {
		expect(terminalStatusFor("github_pr")).toBe("pr-open");
		expect(terminalStatusFor("github_push")).toBe("done");
		expect(terminalStatusFor("zip")).toBe("done");
		expect(canTransition("pr-open", "done")).toBe(true);
	});
});
