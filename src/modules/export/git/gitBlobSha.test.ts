import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { gitBlobSha } from "./gitBlobSha.ts";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

/**
 * Expected values are `git hash-object` output, captured once and pinned here.
 * They are assertions, not observations: they fail when this code changes
 * rather than when the environment does.
 *
 * To regenerate, from the repo root:
 *   cd src/lib/git/__fixtures__ && for f in *; do echo "$f $(git hash-object "$f")"; done
 *
 * These files are byte-exact by design. `biome.json` excludes this directory
 * from formatting and `__fixtures__/.gitattributes` marks it `-text`, so
 * neither the formatter nor git's newline conversion can rewrite them. Four of
 * the expected hashes below are invalidated silently if either guard is lost.
 */
const CASES = [
	{
		file: "empty.txt",
		size: 0,
		sha: "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391",
		catches:
			'the `blob 0\\0` header, and any "nothing to hash, skip it" shortcut',
	},
	{
		file: "no-trailing-newline.txt",
		size: 5,
		sha: "b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0",
		catches: "a reader that appends or normalizes a terminal newline",
	},
	{
		file: "non-ascii.txt",
		size: 23,
		sha: "86a7b568d11a87bab070e35ccda8ee4eb12a2a43",
		catches: "str.length used in place of byteLength — 14 chars, 23 bytes",
	},
	{
		file: "ascii.txt",
		size: 49,
		sha: "cfd3f2e6ea0950a1ebbb4be05a067dc48d21ce34",
		catches:
			"nothing on its own — the control, so a total failure is distinguishable from a subtle one",
	},
	{
		file: "single-byte.txt",
		size: 1,
		sha: "2e65efe2a145dda7ee51d1741299f848e5bf752e",
		catches: "off-by-one in the header at the 0/many boundary",
	},
	{
		file: "crlf.txt",
		size: 32,
		sha: "4e7cdf2bf3ef1f35e422c01a4eac9936d1646faa",
		catches:
			"rewriting of INTERIOR newlines, which the no-trailing-newline case survives",
	},
	{
		file: "nul-and-controls.bin",
		size: 11,
		sha: "5a78841a96aa5b6f5e18691311fe611f74810e7b",
		catches:
			"string concatenation or truncation at the NUL the header uses as its delimiter",
	},
	{
		file: "invalid-utf8.bin",
		size: 11,
		sha: "3d212a425eef9576f3201755d4b5a03a5664368d",
		catches:
			"a decode/re-encode round trip, which valid UTF-8 survives losslessly and this does not",
	},
	{
		file: "large-100k.txt",
		size: 100000,
		sha: "94bc76618de566c4e568aaf031cce7cef592d868",
		catches:
			"a padded or fixed-width length field — this header is 6 decimal digits, the rest are 1 or 2",
	},
	{
		file: "bom.txt",
		size: 21,
		sha: "d25621303807649d7f4d4ea9470a4eb0adf1f0e0",
		catches: "a reader that strips the BOM; git keeps it in the blob",
	},
] as const;

const read = (file: string) => readFileSync(join(FIXTURES, file));

describe("gitBlobSha", () => {
	it("covers ten fixtures", () => {
		expect(CASES).toHaveLength(10);
		expect(new Set(CASES.map((c) => c.file)).size).toBe(10);
		expect(new Set(CASES.map((c) => c.sha)).size).toBe(10);
	});

	for (const { file, size, sha, catches } of CASES) {
		it(`${file} — ${catches}`, () => {
			const bytes = read(file);
			expect(bytes.byteLength).toBe(size);
			expect(gitBlobSha(bytes)).toBe(sha);
		});
	}

	it("hashes byte length, not character length", () => {
		const bytes = read("non-ascii.txt");
		const text = bytes.toString("utf8");

		expect(text.length).toBe(14);
		expect(bytes.byteLength).toBe(23);

		// Exactly what a character-length implementation produces: the same
		// algorithm with `text.length` in the header instead of `byteLength`.
		// Well-formed, plausible, and wrong.
		const wrong = createHash("sha1")
			.update(Buffer.from(`blob ${text.length}\0`, "utf8"))
			.update(bytes)
			.digest("hex");

		expect(wrong).toMatch(/^[0-9a-f]{40}$/);
		expect(gitBlobSha(bytes)).not.toBe(wrong);
		expect(gitBlobSha(bytes)).toBe("86a7b568d11a87bab070e35ccda8ee4eb12a2a43");
	});

	it("accepts a plain Uint8Array, not only a Buffer", () => {
		const buf = read("non-ascii.txt");
		const view = new Uint8Array(
			buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
		);

		expect(view).not.toBeInstanceOf(Buffer);
		expect(gitBlobSha(view)).toBe("86a7b568d11a87bab070e35ccda8ee4eb12a2a43");
	});

	it("respects byteLength on a subarray view rather than the whole backing buffer", () => {
		const backing = Buffer.from("XXXXXhelloYYYYY", "utf8");
		const view = backing.subarray(5, 10);

		expect(view.byteLength).toBe(5);
		expect(gitBlobSha(view)).toBe("b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0");
	});
});

/**
 * The operator's question is "did gitBlobSha match `git hash-object`". The
 * pinned constants above are an assertion that it did once. This runs the
 * mechanism and answers it now. Skipped, loudly, if git is unavailable.
 */
const gitAvailable = (() => {
	try {
		execFileSync("git", ["--version"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
})();

describe.skipIf(!gitAvailable)("gitBlobSha vs `git hash-object`", () => {
	for (const { file } of CASES) {
		it(`agrees on ${file}`, () => {
			// The bare filename, resolved by `cwd` — never `join(FIXTURES, file)`.
			// On Windows that produces a backslash path, git fails to match it
			// against `__fixtures__/.gitattributes`, and the `* -text` guard stops
			// applying: `core.autocrlf` then normalizes crlf.txt before hashing and
			// git reports a SHA that is not the one in its own index. The guard the
			// header above describes is only in force when git can find it.
			const actual = execFileSync("git", ["hash-object", "--", file], {
				cwd: FIXTURES,
				encoding: "utf8",
			}).trim();

			expect(actual).toMatch(/^[0-9a-f]{40}$/);
			expect(gitBlobSha(read(file))).toBe(actual);
		});
	}
});
