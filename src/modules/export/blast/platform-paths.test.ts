import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { isNormalized, normalizePath } from "#/modules/export/blast/paths";

/**
 * A path built with `node:path` is NOT safe to hand to the blast radius.
 *
 * WRITTEN BECAUSE IT SHIPPED. The pre-flight route derived each package path
 * with `relative()`, which returns the PLATFORM separator. On Windows that
 * produced `conventions\layering.md`, `isNormalized` correctly refused it, and
 * ALL TWENTY FILES came back as PATH_TRAVERSAL — a package that could never be
 * delivered, on a screen whose entire job is telling an operator what delivery
 * would do.
 *
 * The blast radius was right and the caller was wrong. BLAST-RADIUS.md requires
 * POSIX separators and says "a path that changes under normalization is itself
 * a violation", so refusing a backslash path is the guard working. The defect
 * was feeding it one.
 *
 * INVISIBLE ON LINUX, where `sep` is already "/", which is why nothing caught
 * it until someone opened the screen on Windows. Same class as the
 * `git hash-object` separator bug in the export tests, and `render.test.ts`
 * had already solved it — it does `.split(path.sep).join("/")` when loading the
 * golden package. Two callers, one of them right, and no shared guard.
 */
describe("platform separators reaching the blast radius", () => {
	it("refuses a path carrying the platform separator, when that is not /", () => {
		const windowsStyle = "conventions\\layering.md";
		expect(isNormalized(windowsStyle)).toBe(false);
		expect(normalizePath(windowsStyle)).toBe("conventions/layering.md");
	});

	/**
	 * The exact derivation the route performs, run against the real golden
	 * package. On Windows this fails without the `.split(sep).join("/")` step
	 * and passes with it; on Linux it passes either way, which is precisely why
	 * it needs to exist rather than be assumed.
	 */
	it("produces normalized paths for every file in the golden package", () => {
		const root = path.resolve("fixtures/golden/slice-1/.avel");

		const walk = (dir: string): string[] =>
			readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
				const full = path.join(dir, e.name);
				return e.isDirectory() ? walk(full) : [full];
			});

		const files = walk(root);
		expect(files.length).toBeGreaterThan(0);

		const derived = files.map((abs) =>
			path.relative(root, abs).split(path.sep).join("/"),
		);

		const notNormalized = derived.filter((p) => !isNormalized(p));
		expect(
			notNormalized,
			"paths that would be reported as PATH_TRAVERSAL by the blast radius",
		).toEqual([]);
	});

	/**
	 * The negative control, kept in the suite rather than run once by hand:
	 * skipping the separator conversion reproduces the bug on any platform whose
	 * separator is not "/". On Linux this asserts nothing, which is honest —
	 * the bug genuinely cannot occur there.
	 */
	it("reproduces the failure when the conversion is skipped", () => {
		if (path.sep === "/") {
			expect(path.sep).toBe("/");
			return;
		}
		const raw = ["conventions", "layering.md"].join(path.sep);
		expect(isNormalized(raw)).toBe(false);
	});
});
