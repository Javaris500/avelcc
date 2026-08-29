import { describe, expect, it } from "vitest";
import { computeBlastRadius } from "./computeBlastRadius.ts";
import {
	type BlastRadiusPolicy,
	DEFAULT_ALLOWED_PATH_PREFIXES,
	MODE,
	type RemoteTree,
	type RemoteTreeEntry,
	type RenderedFile,
	type ViolationCode,
} from "./types.ts";

// Hashes are opaque to this function; it compares them, it never computes them.
const SHA_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SHA_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SHA_C = "cccccccccccccccccccccccccccccccccccccccc";

const file = (path: string, blobSha = SHA_A, bytes = 100): RenderedFile => ({
	path,
	bytes,
	blobSha,
});

const tree = (
	entries: Record<string, RemoteTreeEntry | string>,
	commitSha = "0".repeat(40),
): RemoteTree => ({
	commitSha,
	entries: new Map(
		Object.entries(entries).map(([path, value]) => [
			path,
			typeof value === "string" ? { sha: value, mode: MODE.blob } : value,
		]),
	),
});

const POLICY: BlastRadiusPolicy = {
	allowedPathPrefixes: DEFAULT_ALLOWED_PATH_PREFIXES,
	declaredWritablePaths: [".avel/**"],
};

const policyWith = (over: Partial<BlastRadiusPolicy>): BlastRadiusPolicy => ({
	...POLICY,
	...over,
});

const codesFor = (
	rendered: RenderedFile[],
	remote: RemoteTree,
	policy: BlastRadiusPolicy = POLICY,
): ViolationCode[] =>
	computeBlastRadius(rendered, remote, policy).violations.map((v) => v.code);

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

describe("computeBlastRadius classification", () => {
	it("classifies CREATE when the path does not exist remotely", () => {
		const result = computeBlastRadius(
			[file(".avel/new.md")],
			tree({ ".avel/other.md": SHA_B }),
			POLICY,
		);

		expect(result.create).toEqual([
			{ path: ".avel/new.md", bytes: 100, blobSha: SHA_A },
		]);
		expect(result.overwrite).toEqual([]);
		expect(result.unchanged).toEqual([]);
		expect(result.violations).toEqual([]);
	});

	it("classifies OVERWRITE when the path exists and the content differs", () => {
		const result = computeBlastRadius(
			[file(".avel/x.md", SHA_A)],
			tree({ ".avel/x.md": SHA_B }),
			POLICY,
		);

		expect(result.overwrite).toEqual([
			{
				path: ".avel/x.md",
				bytes: 100,
				blobSha: SHA_A,
				remoteBlobSha: SHA_B,
			},
		]);
		expect(result.create).toEqual([]);
		expect(result.unchanged).toEqual([]);
	});

	it("classifies UNCHANGED when the blob SHAs are identical", () => {
		const result = computeBlastRadius(
			[file(".avel/x.md", SHA_A)],
			tree({ ".avel/x.md": SHA_A }),
			POLICY,
		);

		expect(result.unchanged).toEqual([
			{ path: ".avel/x.md", bytes: 100, blobSha: SHA_A },
		]);
		expect(result.overwrite).toEqual([]);
	});

	it("reports zero overwrites when an unmodified package is re-exported", () => {
		// The case BLAST-RADIUS.md names: a re-export of an unmodified mission
		// must report zero overwrites, not fourteen. This is why it is a content
		// diff and not a path diff.
		const files = Array.from({ length: 14 }, (_, i) =>
			file(`.avel/f${i}.md`, `${i}`.padStart(40, "0")),
		);
		const remote = tree(
			Object.fromEntries(files.map((f) => [f.path, f.blobSha])),
		);

		const result = computeBlastRadius(files, remote, POLICY);

		expect(result.totals.overwrite).toBe(0);
		expect(result.totals.unchanged).toBe(14);
		expect(result.totals.create).toBe(0);
	});

	it("treats an empty repository as all CREATE, not an error", () => {
		const result = computeBlastRadius(
			[file(".avel/a.md"), file(".avel/b.md")],
			tree({}),
			POLICY,
		);

		expect(result.totals.create).toBe(2);
		expect(result.totals.violations).toBe(0);
		expect(result.preserveSummary).toEqual({ fileCount: 0, topLevelDirs: [] });
	});

	it("keeps totals equal to the array lengths", () => {
		const result = computeBlastRadius(
			[
				file(".avel/new.md"),
				file(".avel/x.md", SHA_A),
				file(".avel/y.md", SHA_C),
			],
			tree({ ".avel/x.md": SHA_B, ".avel/y.md": SHA_C, "src/app.ts": SHA_A }),
			POLICY,
		);

		expect(result.totals.create).toBe(result.create.length);
		expect(result.totals.overwrite).toBe(result.overwrite.length);
		expect(result.totals.unchanged).toBe(result.unchanged.length);
		expect(result.totals.violations).toBe(result.violations.length);
		expect(result.totals).toEqual({
			create: 1,
			overwrite: 1,
			unchanged: 1,
			violations: 0,
		});
	});

	it("sorts every output array by codepoint, so a re-render is byte-stable", () => {
		const paths = [".avel/z.md", ".avel/a.md", ".avel/M.md", ".avel/b.md"];
		const forward = computeBlastRadius(
			paths.map((p) => file(p)),
			tree({}),
			POLICY,
		);
		const reversed = computeBlastRadius(
			[...paths].reverse().map((p) => file(p)),
			tree({}),
			POLICY,
		);

		expect(forward.create.map((f) => f.path)).toEqual([
			".avel/M.md",
			".avel/a.md",
			".avel/b.md",
			".avel/z.md",
		]);
		expect(forward).toEqual(reversed);
	});
});

// ---------------------------------------------------------------------------
// PRESERVE
// ---------------------------------------------------------------------------

describe("computeBlastRadius PRESERVE", () => {
	it("summarises untouched files as a count and top-level entries, never a path list", () => {
		const result = computeBlastRadius(
			[file(".avel/x.md", SHA_A)],
			tree({
				".avel/x.md": SHA_B,
				"src/a.ts": SHA_A,
				"src/nested/b.ts": SHA_A,
				"tests/c.test.ts": SHA_A,
				"package.json": SHA_A,
				".github/workflows/ci.yml": SHA_A,
			}),
			POLICY,
		);

		expect(result.preserveSummary).toEqual({
			fileCount: 5,
			topLevelDirs: [".github", "package.json", "src", "tests"],
		});
		// The summary carries no path list. Nothing in it enumerates a file.
		expect(Object.keys(result.preserveSummary)).toEqual([
			"fileCount",
			"topLevelDirs",
		]);
	});

	it("includes root-level files in topLevelDirs and never appends a trailing slash", () => {
		const result = computeBlastRadius(
			[],
			tree({ "package.json": SHA_A, "README.md": SHA_A, "src/a.ts": SHA_A }),
			POLICY,
		);

		expect(result.preserveSummary.topLevelDirs).toEqual([
			"README.md",
			"package.json",
			"src",
		]);
		for (const entry of result.preserveSummary.topLevelDirs) {
			expect(entry.endsWith("/")).toBe(false);
		}
	});

	it("excludes tree entries from the file count", () => {
		const result = computeBlastRadius(
			[],
			tree({
				src: { sha: SHA_C, mode: MODE.tree },
				"src/a.ts": SHA_A,
				"src/b.ts": SHA_A,
			}),
			POLICY,
		);

		expect(result.preserveSummary.fileCount).toBe(2);
		expect(result.preserveSummary.topLevelDirs).toEqual(["src"]);
	});

	it("excludes touched paths from the preserved count", () => {
		const remote = tree({ ".avel/x.md": SHA_B, "src/a.ts": SHA_A });

		expect(
			computeBlastRadius([], remote, POLICY).preserveSummary.fileCount,
		).toBe(2);
		expect(
			computeBlastRadius([file(".avel/x.md")], remote, POLICY).preserveSummary
				.fileCount,
		).toBe(1);
	});

	it("counts an UNCHANGED file as touched, not preserved", () => {
		const result = computeBlastRadius(
			[file(".avel/x.md", SHA_A)],
			tree({ ".avel/x.md": SHA_A, "src/a.ts": SHA_A }),
			POLICY,
		);

		expect(result.totals.unchanged).toBe(1);
		expect(result.preserveSummary.fileCount).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Violations — one describe per code
// ---------------------------------------------------------------------------

describe("PATH_OUTSIDE_ALLOWED", () => {
	it("flags a rendered path outside the allowed prefixes", () => {
		const result = computeBlastRadius(
			[file("src/app.ts")],
			tree({}),
			policyWith({ declaredWritablePaths: ["**"] }),
		);

		expect(result.violations.map((v) => v.code)).toEqual([
			"PATH_OUTSIDE_ALLOWED",
		]);
		expect(result.violations[0]?.path).toBe("src/app.ts");
		expect(result.violations[0]?.detail).toContain("src/app.ts");
		expect(result.violations[0]?.detail).toContain(".avel/");
	});

	it("allows a path under a configured prefix", () => {
		expect(codesFor([file(".avel/ok.md")], tree({}))).toEqual([]);
	});

	it("permits nothing when allowedPathPrefixes is empty — safe by absence", () => {
		expect(
			codesFor(
				[file(".avel/ok.md")],
				tree({}),
				policyWith({ allowedPathPrefixes: [] }),
			),
		).toContain("PATH_OUTSIDE_ALLOWED");
	});
});

describe("PATH_TRAVERSAL", () => {
	it("flags a `..` segment", () => {
		const result = computeBlastRadius(
			[file(".avel/../etc/passwd")],
			tree({}),
			policyWith({
				declaredWritablePaths: ["**"],
				allowedPathPrefixes: [".avel/"],
			}),
		);

		expect(result.violations.map((v) => v.code)).toContain("PATH_TRAVERSAL");
		expect(
			result.violations.find((v) => v.code === "PATH_TRAVERSAL")?.detail,
		).toContain("..");
	});

	it("flags an absolute path", () => {
		expect(
			codesFor(
				[file("/etc/passwd")],
				tree({}),
				policyWith({ declaredWritablePaths: ["**"] }),
			),
		).toContain("PATH_TRAVERSAL");
	});

	it("flags a Windows drive-letter path", () => {
		expect(
			codesFor(
				[file("C:\\Windows\\system32")],
				tree({}),
				policyWith({ declaredWritablePaths: ["**"] }),
			),
		).toContain("PATH_TRAVERSAL");
	});

	it("flags a path that changes under normalization, and says so in the detail", () => {
		// NFD "é" (e + combining acute). Normalizes to NFC and is therefore a
		// violation, but not a ".." case — the detail must not imply one.
		const nfd = ".avel/cafe\u0301.md";
		const result = computeBlastRadius(
			[file(nfd)],
			tree({}),
			policyWith({ declaredWritablePaths: ["**"] }),
		);
		const violation = result.violations.find(
			(v) => v.code === "PATH_TRAVERSAL",
		);

		expect(violation).toBeDefined();
		expect(violation?.detail).toContain("normalized form");
		// Must not be presented as a parent-directory escape, which is the other
		// thing PATH_TRAVERSAL covers and a completely different fix.
		expect(violation?.detail).not.toContain("escapes the repository root");
		// The NFD and NFC forms render identically on screen. Without the escaped
		// codepoints the operator reads "X becomes X" and learns nothing.
		expect(violation?.detail).toContain("cafe\\u0301");
		expect(violation?.detail).toContain("caf\\u00e9");
	});

	it("does not flag a filename that merely starts with dots", () => {
		expect(codesFor([file(".avel/..hidden.md")], tree({}))).toEqual([]);
	});

	it("normalizes backslashes before comparing, so a Windows-style path still matches remotely", () => {
		const result = computeBlastRadius(
			[file(".avel\\docs\\x.md", SHA_A)],
			tree({ ".avel/docs/x.md": SHA_A }),
			POLICY,
		);

		expect(result.totals.unchanged).toBe(1);
		expect(result.unchanged[0]?.path).toBe(".avel/docs/x.md");
		expect(result.violations.map((v) => v.code)).toContain("PATH_TRAVERSAL");
	});
});

describe("SPECIAL_FILE_COLLISION", () => {
	it("flags a symlink target", () => {
		const result = computeBlastRadius(
			[file(".avel/link.md")],
			tree({ ".avel/link.md": { sha: SHA_B, mode: MODE.symlink } }),
			POLICY,
		);

		expect(result.violations.map((v) => v.code)).toEqual([
			"SPECIAL_FILE_COLLISION",
		]);
		expect(result.violations[0]?.detail).toContain("symlink");
	});

	it("flags a submodule target", () => {
		const result = computeBlastRadius(
			[file(".avel/vendor")],
			tree({ ".avel/vendor": { sha: SHA_B, mode: MODE.submodule } }),
			POLICY,
		);

		expect(result.violations.map((v) => v.code)).toEqual([
			"SPECIAL_FILE_COLLISION",
		]);
		expect(result.violations[0]?.detail).toContain("submodule");
	});

	it("still classifies a special-file collision, because violations are additive", () => {
		const result = computeBlastRadius(
			[file(".avel/link.md", SHA_A)],
			tree({ ".avel/link.md": { sha: SHA_B, mode: MODE.symlink } }),
			POLICY,
		);

		expect(result.totals.overwrite).toBe(1);
		expect(result.totals.violations).toBe(1);
	});

	it("DOCUMENTS A SPEC GAP: an LFS pointer is not detected", () => {
		// BLAST-RADIUS.md specifies an LFS pointer collision as a violation. An
		// LFS pointer has mode 100644 and is byte-identical in shape to a normal
		// blob, so it cannot be distinguished from { sha, mode } alone. This test
		// asserts the CURRENT behaviour so the gap is visible rather than assumed
		// closed. Filed with the lead. Change this test when the input carries
		// enough information to detect one.
		const lfsPointerLooksLikeABlob = tree({
			".avel/big.bin": { sha: SHA_B, mode: MODE.blob },
		});

		const result = computeBlastRadius(
			[file(".avel/big.bin", SHA_A)],
			lfsPointerLooksLikeABlob,
			POLICY,
		);

		expect(result.violations).toEqual([]);
		expect(result.totals.overwrite).toBe(1);
	});
});

describe("CASE_COLLISION", () => {
	it("flags two rendered paths differing only in case, on both of them", () => {
		const result = computeBlastRadius(
			[file(".avel/agents/x.md"), file(".avel/Agents/x.md")],
			tree({}),
			POLICY,
		);

		expect(result.violations.map((v) => v.code)).toEqual([
			"CASE_COLLISION",
			"CASE_COLLISION",
		]);
		expect(result.violations.map((v) => v.path).sort()).toEqual([
			".avel/Agents/x.md",
			".avel/agents/x.md",
		]);
	});

	it("flags a rendered path colliding with a remote path", () => {
		const result = computeBlastRadius(
			[file(".avel/Agents/x.md")],
			tree({ ".avel/agents/x.md": SHA_B }),
			POLICY,
		);

		expect(result.violations.map((v) => v.code)).toEqual(["CASE_COLLISION"]);
		expect(result.violations[0]?.detail).toContain(".avel/agents/x.md");
	});

	it("does not flag an exact match as a case collision", () => {
		expect(
			codesFor([file(".avel/x.md", SHA_A)], tree({ ".avel/x.md": SHA_A })),
		).toEqual([]);
	});
});

describe("PROTECTED_PATH", () => {
	it("flags .git/", () => {
		expect(
			codesFor(
				[file(".git/config")],
				tree({}),
				policyWith({
					allowedPathPrefixes: [".git/"],
					declaredWritablePaths: ["**"],
				}),
			),
		).toEqual(["PROTECTED_PATH"]);
	});

	it("flags .github/workflows/", () => {
		expect(
			codesFor(
				[file(".github/workflows/ci.yml")],
				tree({}),
				policyWith({
					allowedPathPrefixes: [".github/"],
					declaredWritablePaths: ["**"],
				}),
			),
		).toEqual(["PROTECTED_PATH"]);
	});

	it("does not flag .github/ outside workflows/", () => {
		expect(
			codesFor(
				[file(".github/CODEOWNERS")],
				tree({}),
				policyWith({
					allowedPathPrefixes: [".github/"],
					declaredWritablePaths: ["**"],
				}),
			),
		).toEqual([]);
	});

	it("flags a repo-policy denylist entry", () => {
		expect(
			codesFor(
				[file(".avel/secrets/keys.md")],
				tree({}),
				policyWith({
					declaredWritablePaths: ["**"],
					denylist: [".avel/secrets/"],
				}),
			),
		).toEqual(["PROTECTED_PATH"]);
	});

	it("protects .git/ even when no denylist is supplied", () => {
		expect(
			codesFor(
				[file(".git/hooks/pre-commit")],
				tree({}),
				policyWith({
					allowedPathPrefixes: [".git/"],
					declaredWritablePaths: ["**"],
				}),
			),
		).toEqual(["PROTECTED_PATH"]);
	});
});

describe("OWNERSHIP_VIOLATION", () => {
	it("flags a path matching no declared writable glob", () => {
		const result = computeBlastRadius(
			[file(".avel/contracts/phase1.json")],
			tree({}),
			policyWith({ declaredWritablePaths: [".avel/reports/**"] }),
		);

		expect(result.violations.map((v) => v.code)).toEqual([
			"OWNERSHIP_VIOLATION",
		]);
		expect(result.violations[0]?.detail).toContain(
			".avel/contracts/phase1.json",
		);
		expect(result.violations[0]?.detail).toContain(".avel/reports/**");
	});

	it("names no agent, because a pure function with this signature cannot know one", () => {
		const result = computeBlastRadius(
			[file(".avel/x.md")],
			tree({}),
			policyWith({ declaredWritablePaths: [".avel/reports/**"] }),
		);

		expect(Object.keys(result.violations[0] ?? {})).toEqual([
			"code",
			"path",
			"detail",
		]);
	});

	it("honours a real roster glob with an extension wildcard", () => {
		const policy = policyWith({
			allowedPathPrefixes: ["apps/"],
			declaredWritablePaths: ["apps/web/src/**/*.test.tsx"],
		});

		expect(
			codesFor([file("apps/web/src/a/b.test.tsx")], tree({}), policy),
		).toEqual([]);
		expect(codesFor([file("apps/web/src/a/b.tsx")], tree({}), policy)).toEqual([
			"OWNERSHIP_VIOLATION",
		]);
	});

	it("matches dotfile paths, which glob libraries exclude by default", () => {
		// `.avel/**` must match `.avel/x.md`. Without dot:true picomatch does not
		// match a leading-dot segment, and every AVEL path would be an ownership
		// violation.
		expect(codesFor([file(".avel/x.md")], tree({}))).toEqual([]);
	});

	it("owns nothing when declaredWritablePaths is empty", () => {
		expect(
			codesFor(
				[file(".avel/x.md")],
				tree({}),
				policyWith({ declaredWritablePaths: [] }),
			),
		).toEqual(["OWNERSHIP_VIOLATION"]);
	});
});

// ---------------------------------------------------------------------------
// Cross-cutting rules
// ---------------------------------------------------------------------------

describe("violation rules", () => {
	it("emits every violation a path earns, and counts entries not paths", () => {
		// One path: outside the allowed prefix, protected, and unowned.
		const result = computeBlastRadius(
			[file(".github/workflows/ci.yml")],
			tree({}),
			POLICY,
		);

		expect(result.violations.map((v) => v.code).sort()).toEqual([
			"OWNERSHIP_VIOLATION",
			"PATH_OUTSIDE_ALLOWED",
			"PROTECTED_PATH",
		]);
		expect(result.totals.violations).toBe(3);
		expect(new Set(result.violations.map((v) => v.path)).size).toBe(1);
	});

	it("still classifies a violating file into create/overwrite/unchanged", () => {
		const result = computeBlastRadius(
			[file("src/app.ts", SHA_A)],
			tree({ "src/app.ts": SHA_B }),
			POLICY,
		);

		expect(result.totals.overwrite).toBe(1);
		expect(result.overwrite[0]?.path).toBe("src/app.ts");
		expect(result.totals.violations).toBeGreaterThan(0);
	});

	it("covers all six violation codes across the suite", () => {
		const seen = new Set<ViolationCode>();
		const collect = (
			rendered: RenderedFile[],
			remote: RemoteTree,
			policy: BlastRadiusPolicy,
		) => {
			for (const code of codesFor(rendered, remote, policy)) seen.add(code);
		};

		collect(
			[file("src/app.ts")],
			tree({}),
			policyWith({ declaredWritablePaths: ["**"] }),
		);
		collect(
			[file("/etc/passwd")],
			tree({}),
			policyWith({ declaredWritablePaths: ["**"] }),
		);
		collect(
			[file(".avel/l.md")],
			tree({ ".avel/l.md": { sha: SHA_B, mode: MODE.symlink } }),
			POLICY,
		);
		collect([file(".avel/A.md"), file(".avel/a.md")], tree({}), POLICY);
		collect(
			[file(".git/config")],
			tree({}),
			policyWith({
				allowedPathPrefixes: [".git/"],
				declaredWritablePaths: ["**"],
			}),
		);
		collect(
			[file(".avel/x.md")],
			tree({}),
			policyWith({ declaredWritablePaths: [] }),
		);

		expect([...seen].sort()).toEqual([
			"CASE_COLLISION",
			"OWNERSHIP_VIOLATION",
			"PATH_OUTSIDE_ALLOWED",
			"PATH_TRAVERSAL",
			"PROTECTED_PATH",
			"SPECIAL_FILE_COLLISION",
		]);
		expect(seen.size).toBe(6);
	});

	it("writes a detail that names the offending path, for the pre-flight screen", () => {
		// BLAST_RADIUS_VIOLATION is not overridable, so this string is the only
		// text the operator gets. It must be actionable on its own.
		const result = computeBlastRadius(
			[file("src/app.ts"), file(".git/config"), file(".avel/../x")],
			tree({}),
			POLICY,
		);

		expect(result.violations.length).toBeGreaterThan(0);
		for (const violation of result.violations) {
			expect(violation.detail).toContain(violation.path);
			expect(violation.detail.length).toBeGreaterThan(40);
		}
	});
});

// ---------------------------------------------------------------------------
// Purity
// ---------------------------------------------------------------------------

describe("purity", () => {
	it("does not mutate its inputs", () => {
		const rendered = [file(".avel/x.md", SHA_A), file(".avel/a.md", SHA_B)];
		const remote = tree({ ".avel/x.md": SHA_C, "src/a.ts": SHA_A });
		const policy = policyWith({});

		const renderedBefore = structuredClone(rendered);
		const entriesBefore = new Map(remote.entries);
		const policyBefore = structuredClone(policy);

		computeBlastRadius(rendered, remote, policy);

		expect(rendered).toEqual(renderedBefore);
		expect(remote.entries).toEqual(entriesBefore);
		expect(policy).toEqual(policyBefore);
	});

	it("returns an identical result on repeated calls with the same inputs", () => {
		const rendered = [file(".avel/b.md", SHA_A), file(".avel/a.md", SHA_B)];
		const remote = tree({ ".avel/a.md": SHA_C, "src/x.ts": SHA_A });

		const first = computeBlastRadius(rendered, remote, POLICY);
		const second = computeBlastRadius(rendered, remote, POLICY);

		expect(JSON.stringify(first)).toBe(JSON.stringify(second));
	});

	it("returns no envelope fields — no clock, no ref, no target", () => {
		const result = computeBlastRadius([file(".avel/x.md")], tree({}), POLICY);

		expect(Object.keys(result).sort()).toEqual([
			"create",
			"overwrite",
			"preserveSummary",
			"totals",
			"unchanged",
			"violations",
		]);
		expect(result).not.toHaveProperty("computedAt");
		expect(result).not.toHaveProperty("baseCommitSha");
		expect(result).not.toHaveProperty("baseRef");
		expect(result).not.toHaveProperty("target");
	});
});
