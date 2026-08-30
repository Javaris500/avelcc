import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, test } from "vitest";

import { byCodepoint } from "#/modules/export/render/bytes";
import { fixtureMission } from "#/modules/export/render/fixture-mission";
import { render } from "#/modules/export/render/render";
import { writeZip } from "#/modules/export/zip/writeZip";

const utf8 = (s: string) => new TextEncoder().encode(s);
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/**
 * A map exercising every case the writer branches on, or refuses to branch on:
 * an empty entry, a non-ASCII path, a nested path, an incompressible entry and
 * a highly compressible one.
 */
const SAMPLE = new Map<string, Uint8Array>([
	["MISSION.md", utf8("# Mission\n")],
	["conventions/héllo-世界.md", utf8("non-ascii path\n")],
	["empty.txt", new Uint8Array(0)],
	["a/b/c.json", utf8(JSON.stringify({ a: 1, b: [1, 2, 3] }))],
	["compressible.txt", utf8("x".repeat(5000))],
	[
		"incompressible.bin",
		Uint8Array.from({ length: 256 }, (_, i) => (i * 7) % 251),
	],
]);

/* ── the independent reader ─────────────────────────────────────────────── */

/**
 * Read the archive back with python's `zipfile`, NOT with a reader of our own.
 *
 * A writer checked against its own reader proves only that the two share
 * assumptions. Every field this module pins — the DOS date, the UTF-8 flag, the
 * external attributes, the central-directory offsets — is meaningful only if a
 * tool that has never seen this code agrees about it. `testzip()` additionally
 * recomputes every CRC, so a wrong checksum surfaces here rather than in a
 * client's unzip six months from now.
 *
 * Unconditional, like `git hash-object` in gitBlobSha.test.ts. A cross-check
 * that skips itself when the tool is missing is decoration, and this file's
 * whole value is that the confirmation comes from outside.
 */
const PY = `
import binascii, hashlib, json, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
sys.stdout.write(json.dumps({
    "testzip": z.testzip(),
    "entries": [
        {
            "name": i.filename,
            "size": i.file_size,
            "method": i.compress_type,
            "date": list(i.date_time),
            "flag": i.flag_bits,
            "extern": i.external_attr,
            "sha256": hashlib.sha256(z.read(i.filename)).hexdigest(),
        }
        for i in z.infolist()
    ],
}, ensure_ascii=True))
`;

interface PyEntry {
	name: string;
	size: number;
	method: number;
	date: [number, number, number, number, number, number];
	flag: number;
	extern: number;
	sha256: string;
}

function readWithPython(bytes: Uint8Array): {
	testzip: string | null;
	entries: PyEntry[];
} {
	const dir = mkdtempSync(join(tmpdir(), "avel-zip-"));
	const file = join(dir, "package.zip");
	writeFileSync(file, bytes);
	// ensure_ascii keeps the payload pure ASCII, so a cp1252 console on Windows
	// cannot mangle a non-ASCII entry name on the way back.
	const out = execFileSync("python", ["-c", PY, file], { encoding: "utf8" });
	return JSON.parse(out);
}

describe("round-trips through a reader that is not ours", () => {
	const { bytes } = writeZip(SAMPLE);
	const read = readWithPython(bytes);

	it("passes python's own CRC check on every entry", () => {
		// testzip() returns the name of the first corrupt entry, or None.
		expect(read.testzip).toBeNull();
	});

	it("returns every entry's bytes exactly", () => {
		expect(read.entries.length).toBe(SAMPLE.size);
		for (const entry of read.entries) {
			const original = SAMPLE.get(entry.name);
			expect(
				original,
				`python read an entry we never wrote: ${entry.name}`,
			).toBeDefined();
			expect(entry.sha256).toBe(sha256(original as Uint8Array));
			expect(entry.size).toBe((original as Uint8Array).byteLength);
		}
	});

	it("orders entries by codepoint, not by insertion", () => {
		// SAMPLE is deliberately built out of order, so insertion order and
		// codepoint order differ and this assertion can actually fail.
		const expected = [...SAMPLE.keys()].sort(byCodepoint);
		expect(read.entries.map((e) => e.name)).toEqual(expected);
		expect(read.entries.map((e) => e.name)).not.toEqual([...SAMPLE.keys()]);
	});

	/**
	 * ORDERING IS CODEPOINT-DERIVED, PROVEN WITHOUT RELYING ON THE ENVIRONMENT.
	 *
	 * The `TZ`/`LANG` determinism tests below cannot establish this on Windows —
	 * see the comment there — so this asserts it directly instead, and it is the
	 * assertion that actually fails when byCodepoint is swapped for
	 * localeCompare.
	 *
	 * `Z.md` vs `a.md` is chosen because codepoint order disagrees with EVERY
	 * locale's collation rather than just one: 'Z' is 0x5A and 'a' is 0x61, so
	 * codepoint puts Z first, while en, tr and de all sort a first. A pair that
	 * only disagreed under Turkish would silently stop discriminating on a
	 * machine whose default locale happened to be Turkish.
	 */
	it("sorts by codepoint even where every locale disagrees", () => {
		const map = new Map([
			["Z.md", utf8("z\n")],
			["a.md", utf8("a\n")],
		]);
		const names = readWithPython(writeZip(map).bytes).entries.map(
			(e) => e.name,
		);

		expect(names).toEqual(["Z.md", "a.md"]);

		// Non-vacuity: prove this fixture actually discriminates, rather than
		// trusting that it does. Every locale must disagree with the order
		// asserted above, or the assertion is decoration.
		for (const locale of ["en", "tr", "de"]) {
			expect(
				Math.sign("Z.md".localeCompare("a.md", locale)),
				`${locale} collation must disagree with codepoint order here`,
			).toBe(1);
		}
	});

	it("stamps every entry 1980-01-01 00:00:00, so no clock leaked in", () => {
		// The single field a zip writer leaks time through. A leak here extracts
		// perfectly and changes the hash on every run.
		for (const entry of read.entries) {
			expect(entry.date).toEqual([1980, 1, 1, 0, 0, 0]);
		}
	});

	it("pins the flag, method and mode on every entry", () => {
		for (const entry of read.entries) {
			expect(entry.flag).toBe(0x0800); // UTF-8 names, no data descriptor
			expect(entry.method).toBe(8); // deflate, including the empty entry
			expect(entry.extern >>> 0).toBe((0o100644 << 16) >>> 0);
		}
	});
});

/* ── determinism ────────────────────────────────────────────────────────── */

const CHILD = `
import { writeZip } from "#/modules/export/zip/writeZip";
import { render } from "#/modules/export/render/render";
import { fixtureMission } from "#/modules/export/render/fixture-mission";
import { localeProbeMission } from "#/modules/export/render/locale-probe";
const mission = process.env.ZIP_CASE === "locale-probe" ? localeProbeMission : fixtureMission;
process.stdout.write(writeZip(render(mission)).sha256);
`;

/**
 * Spawns node itself with tsx registered as a loader, rather than executing
 * `node_modules/.bin/tsx` — that path is a POSIX shell script and is ENOENT on
 * Windows, where the runnable shim is `tsx.CMD`. Same fix as render.test.ts.
 */
function zipInFreshProcess(env: NodeJS.ProcessEnv): string {
	return execFileSync(
		process.execPath,
		["--import", "tsx", "--input-type=module", "--eval", CHILD],
		{ encoding: "utf8", env: { ...process.env, ...env } },
	).trim();
}

describe("determinism", () => {
	test("twice in one process", () => {
		expect(writeZip(SAMPLE).sha256).toBe(writeZip(SAMPLE).sha256);
	});

	test("twice in fresh processes", () => {
		expect(zipInFreshProcess({})).toBe(zipInFreshProcess({}));
	}, 60_000);

	/**
	 * WHAT THIS ACTUALLY PROVES, AND WHAT IT DOES NOT.
	 *
	 * `TZ` is live: measured through this exact `execFileSync` path, the child
	 * reports `new Date(0).getHours()` as 9 under Asia/Tokyo against 18 without
	 * it. So a `new Date()` leaking into a DOS header does move the hash and
	 * this test catches it — confirmed by mutation, it is one of the three that
	 * go red when DOS_TIME is computed from the clock.
	 *
	 * `LANG`/`LC_ALL` are INERT ON WINDOWS. Node resolves its collator from the
	 * OS, not from those variables: `Intl.Collator().resolvedOptions().locale`
	 * is `en-US` in this child whether or not `LC_ALL=tr_TR.UTF-8` is set. So
	 * the locale half of this test cannot fail here, and swapping byCodepoint
	 * for localeCompare leaves it green — measured, not assumed.
	 *
	 * The variables are kept because they DO bite on a Linux CI runner, and
	 * removing them would silently drop that coverage. But they are an
	 * [attestation] on this workstation, not a mechanism, so the codepoint
	 * ordering guarantee is asserted directly above instead of resting on them.
	 */
	test("under TZ=Asia/Tokyo LANG=tr_TR", () => {
		expect(
			zipInFreshProcess({
				TZ: "Asia/Tokyo",
				LANG: "tr_TR.UTF-8",
				LC_ALL: "tr_TR.UTF-8",
			}),
		).toBe(zipInFreshProcess({}));
	}, 60_000);

	/**
	 * The renderer's own locale probe, carried through the zip writer. Its
	 * mission contains a path pair whose collation and codepoint order disagree,
	 * which the slice-1 fixture's 20 paths do not.
	 *
	 * Same caveat as above, and it is the reason the probe alone is not enough:
	 * on this workstation the env vars do not reach Node's collator, so this
	 * covers the Linux CI case and nothing local. The direct ordering assertion
	 * in the round-trip block is what holds the line here.
	 */
	test("under tr_TR, on paths where collation and codepoint order disagree", () => {
		expect(
			zipInFreshProcess({
				ZIP_CASE: "locale-probe",
				TZ: "Asia/Tokyo",
				LANG: "tr_TR.UTF-8",
				LC_ALL: "tr_TR.UTF-8",
			}),
		).toBe(zipInFreshProcess({ ZIP_CASE: "locale-probe" }));
	}, 60_000);
});

/**
 * THE CANARY FOR THE ONE RISK THIS MODULE CANNOT REMOVE.
 *
 * DEFLATE does not standardise its encoder. Every knob zlib exposes is pinned
 * in writeZip.ts, which fixes the output for a given zlib build — but a future
 * Node carrying a different zlib could compress identical input into different
 * bytes, moving this hash with nothing in this repo having changed.
 *
 * Pinning the digest converts that from a silent cross-machine disagreement
 * into a red test naming the exact thing that moved. If this fails and no
 * source file changed, compare `process.versions.zlib` against the value in
 * writeZip.ts's comment before assuming a regression.
 */
describe("the frozen package", () => {
	it("hashes to a pinned value on the golden fixture", () => {
		const result = writeZip(render(fixtureMission));
		expect(render(fixtureMission).size).toBe(20);
		expect(result.byteLength).toBe(17595);
		expect(result.sha256).toBe(
			"78646ee1be2cc18616b0163566520d900fb7a70354929dde80c029a562ee4e5d",
		);
	});

	it("reports the hash and length of the bytes it returned", () => {
		// The three values travel together into snapshot_sha256 / snapshot_bytes,
		// and the exports_snapshot_all_or_none CHECK means a mismatch between them
		// is not something a later NULL can paper over.
		const result = writeZip(SAMPLE);
		expect(result.sha256).toBe(sha256(result.bytes));
		expect(result.byteLength).toBe(result.bytes.byteLength);
	});
});

/* ── edges ──────────────────────────────────────────────────────────────── */

describe("edges", () => {
	it("writes a valid empty archive", () => {
		const result = writeZip(new Map());
		// End-of-central-directory record alone: 22 bytes, zero entries.
		expect(result.byteLength).toBe(22);
		expect(readWithPython(result.bytes).entries).toEqual([]);
	});

	it("writes a single empty file as a real entry", () => {
		// The case a "nothing to compress, skip it" shortcut silently drops.
		const result = writeZip(new Map([["empty.txt", new Uint8Array(0)]]));
		const read = readWithPython(result.bytes);
		expect(read.testzip).toBeNull();
		expect(read.entries.map((e) => e.name)).toEqual(["empty.txt"]);
		expect(read.entries[0]?.size).toBe(0);
	});

	it("keeps a non-ASCII path byte-exact through a real reader", () => {
		const path = "conventions/héllo-世界.md";
		const result = writeZip(new Map([[path, utf8("body\n")]]));
		expect(readWithPython(result.bytes).entries[0]?.name).toBe(path);
	});
});

/* ── refusals ───────────────────────────────────────────────────────────── */

/**
 * We are the WRITER, so these are not input validation — they are a refusal to
 * emit an archive that attacks whoever extracts it. The package is handed to
 * clients and unpacked into their repositories, and the render map's paths are
 * built from agent and skill slugs, which are data.
 */
describe("refuses to emit an unsafe entry path", () => {
	const cases: Array<[string, string]> = [
		["escapes the archive root", "../../.ssh/authorized_keys"],
		["escapes from inside a nested path", "roster/../../etc/passwd"],
		["is absolute", "/etc/passwd"],
		["is empty", ""],
		["uses a backslash separator", "roster\\agent\\identity.md"],
	];

	for (const [why, path] of cases) {
		it(why, () => {
			expect(() => writeZip(new Map([[path, utf8("x")]]))).toThrow();
		});
	}

	it("allows a dotted name that is not a traversal", () => {
		// `..` is only a traversal as a whole segment. Rejecting any substring
		// would refuse legitimate names, so the guard splits on "/" — this is the
		// case that proves it does.
		expect(() =>
			writeZip(new Map([["conventions/..hidden..md", utf8("x")]])),
		).not.toThrow();
	});
});
