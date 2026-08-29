import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { gitBlobSha } from "../git/gitBlobSha.ts";
import { computeBlastRadius } from "./computeBlastRadius.ts";
import {
	type BlastRadiusPolicy,
	DEFAULT_ALLOWED_PATH_PREFIXES,
	MODE,
	type RemoteTree,
} from "./types.ts";

/**
 * The two pure functions wired together, against real files.
 *
 * This is the mechanism the pre-flight screen runs: hash rendered bytes
 * locally, compare them against blob SHAs from a tree, classify. The remote
 * SHAs here come from `git hash-object`, NOT from gitBlobSha, so an UNCHANGED
 * classification is only reachable if our hash equals git's. That makes the
 * assertion evidence rather than a smoke test.
 *
 * Skipped, loudly, if git is unavailable.
 */

const FIXTURES = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"git",
	"__fixtures__",
);

const gitAvailable = (() => {
	try {
		execFileSync("git", ["--version"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
})();

/**
 * Ground truth from git itself, never from our own implementation.
 *
 * Takes a bare fixture NAME and resolves it via `cwd`. Handing git a joined
 * absolute path breaks this on Windows: the separators are backslashes, git
 * cannot match them against `__fixtures__/.gitattributes`, the `* -text` guard
 * lapses, and `core.autocrlf` rewrites crlf.txt before hashing — which shows up
 * here as a phantom OVERWRITE on a file that never changed.
 */
const gitHashObject = (name: string): string =>
	execFileSync("git", ["hash-object", "--", name], {
		cwd: FIXTURES,
		encoding: "utf8",
	}).trim();

const POLICY: BlastRadiusPolicy = {
	allowedPathPrefixes: DEFAULT_ALLOWED_PATH_PREFIXES,
	declaredWritablePaths: [".avel/**"],
};

describe.skipIf(!gitAvailable)("gitBlobSha feeding computeBlastRadius", () => {
	// Deterministic order; readdir order is not guaranteed across platforms.
	const names = readdirSync(FIXTURES)
		.filter((name) => !name.startsWith("."))
		.sort();

	const rendered = names.map((name) => ({
		path: `.avel/${name}`,
		bytes: readFileSync(join(FIXTURES, name)),
		blobSha: gitBlobSha(readFileSync(join(FIXTURES, name))),
	}));

	it("has ten fixtures to work with", () => {
		expect(names).toHaveLength(10);
	});

	it("classifies real files against a tree whose SHAs came from git", () => {
		// First five exist remotely with git's own SHA -> UNCHANGED.
		// Sixth exists remotely with a different SHA          -> OVERWRITE.
		// Remaining four do not exist remotely                -> CREATE.
		// Two extra remote files are touched by nothing       -> PRESERVE.
		const entries = new Map<string, { sha: string; mode: string }>();

		for (const name of names.slice(0, 5)) {
			entries.set(`.avel/${name}`, {
				sha: gitHashObject(name),
				mode: MODE.blob,
			});
		}
		entries.set(`.avel/${names[5]}`, { sha: "9".repeat(40), mode: MODE.blob });
		entries.set("src/app.ts", { sha: "1".repeat(40), mode: MODE.blob });
		entries.set("README.md", { sha: "2".repeat(40), mode: MODE.blob });

		const remote: RemoteTree = {
			commitSha: "a3f9c21".padEnd(40, "0"),
			entries,
		};
		const result = computeBlastRadius(rendered, remote, POLICY);

		expect(result.totals).toEqual({
			create: 4,
			overwrite: 1,
			unchanged: 5,
			violations: 0,
		});
		expect(result.preserveSummary).toEqual({
			fileCount: 2,
			topLevelDirs: ["README.md", "src"],
		});
	});

	it("reports a size equal to the file's real byte length, for every fixture", () => {
		// Ties computeBlastRadius's derived `size` to the same byte-length
		// discipline gitBlobSha is built on. The 100k fixture and the empty one
		// are both in here.
		const result = computeBlastRadius(
			rendered,
			{ commitSha: "0".repeat(40), entries: new Map() },
			POLICY,
		);
		const sizeByPath = new Map(result.create.map((f) => [f.path, f.size]));

		for (const name of names) {
			const actual = readFileSync(join(FIXTURES, name)).byteLength;
			expect(sizeByPath.get(`.avel/${name}`)).toBe(actual);
		}
		expect(sizeByPath.get(".avel/empty.txt")).toBe(0);
		expect(sizeByPath.get(".avel/large-100k.txt")).toBe(100000);
	});

	it("classifies the non-ASCII fixture UNCHANGED, which a character-length hash could not", () => {
		// The single most load-bearing case. 14 characters, 23 bytes. A
		// string-length implementation produces a different SHA, git's tree
		// disagrees with it, and this file lands as OVERWRITE instead.
		const name = "non-ascii.txt";
		const bytes = readFileSync(join(FIXTURES, name));

		expect(bytes.toString("utf8").length).toBe(14);
		expect(bytes.byteLength).toBe(23);

		const result = computeBlastRadius(
			[{ path: `.avel/${name}`, bytes, blobSha: gitBlobSha(bytes) }],
			{
				commitSha: "0".repeat(40),
				entries: new Map([
					[`.avel/${name}`, { sha: gitHashObject(name), mode: MODE.blob }],
				]),
			},
			POLICY,
		);

		expect(result.totals.unchanged).toBe(1);
		expect(result.totals.overwrite).toBe(0);
	});

	it("reports zero overwrites for a full unmodified re-export", () => {
		const entries = new Map(
			names.map((name) => [
				`.avel/${name}`,
				{ sha: gitHashObject(name), mode: MODE.blob },
			]),
		);

		const result = computeBlastRadius(
			rendered,
			{ commitSha: "0".repeat(40), entries },
			POLICY,
		);

		expect(result.totals.unchanged).toBe(10);
		expect(result.totals.overwrite).toBe(0);
		expect(result.totals.create).toBe(0);
	});
});
