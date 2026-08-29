import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { byCodepoint } from "#/modules/export/render/bytes";
import { fixtureMission } from "#/modules/export/render/fixture-mission";
import { localeProbeMission } from "#/modules/export/render/locale-probe";
import { packagePreimage, sha256Hex } from "#/modules/export/render/manifest";
import { render } from "#/modules/export/render/render";

const GOLDEN = path.resolve("fixtures/golden/slice-1/.avel");

function loadGolden(): Map<string, Uint8Array> {
	const out = new Map<string, Uint8Array>();
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir).sort(byCodepoint)) {
			const full = path.join(dir, entry);
			if (statSync(full).isDirectory()) walk(full);
			else
				out.set(
					path.relative(GOLDEN, full).split(path.sep).join("/"),
					new Uint8Array(readFileSync(full)),
				);
		}
	};
	walk(GOLDEN);
	return out;
}

const golden = loadGolden();

describe("render(mission)", () => {
	test("the golden package is the 20 files the spec's tree declares", () => {
		expect(golden.size).toBe(20);
	});

	test("renders every file the golden package declares, and no others", () => {
		const expected = [...golden.keys()].sort(byCodepoint);
		expect([...render(fixtureMission).keys()].sort(byCodepoint)).toEqual(
			expected,
		);
	});

	test("creates no evidence/ directory", () => {
		expect(
			[...render(fixtureMission).keys()].filter((p) =>
				p.startsWith("evidence/"),
			),
		).toEqual([]);
	});

	/**
	 * The byte-for-byte test the spec names. Compared as raw bytes with no
	 * normalising step on either side — a comparison that trims or re-encodes
	 * would pass on exactly the differences this is here to catch.
	 */
	test.each(
		[...golden.keys()].filter((p) => p !== "manifest.json").sort(byCodepoint),
	)("%s renders byte-for-byte", (file) => {
		expect(render(fixtureMission).get(file)).toEqual(golden.get(file));
	});

	/**
	 * manifest.json hashes every other file in the package, so it is the file
	 * that can only match once all nineteen others do. Byte-for-byte equality
	 * here is the whole-package assertion: every path present, every per-file
	 * hash agreeing, and the package_sha256 over all of them landing on the
	 * golden value.
	 */
	test("manifest.json renders byte-for-byte", () => {
		expect(render(fixtureMission).get("manifest.json")).toEqual(
			golden.get("manifest.json"),
		);
	});

	test("the package preimage is path + LF + hex + LF, concatenated", () => {
		expect(
			packagePreimage([
				{ path: "b.md", sha256: "22" },
				{ path: "a.md", sha256: "11" },
			]),
		).toBe("a.md\n11\nb.md\n22\n");
	});

	test("manifest.json is never listed inside itself", () => {
		const mine = JSON.parse(
			new TextDecoder().decode(render(fixtureMission).get("manifest.json")),
		);
		expect(mine.files.map((f: { path: string }) => f.path)).not.toContain(
			"manifest.json",
		);
	});
});

/** A single hash over every rendered path and its bytes. */
function packageDigest(files: ReadonlyMap<string, Uint8Array>): string {
	const h = createHash("sha256");
	for (const key of [...files.keys()].sort(byCodepoint)) {
		h.update(key);
		h.update("\n");
		h.update(sha256Hex(files.get(key) as Uint8Array));
		h.update("\n");
	}
	return h.digest("hex");
}

const CHILD = `
import { render } from "#/modules/export/render/render";
import { fixtureMission } from "#/modules/export/render/fixture-mission";
import { localeProbeMission } from "#/modules/export/render/locale-probe";
import { createHash } from "node:crypto";
const mission = process.env.RENDER_CASE === "locale-probe" ? localeProbeMission : fixtureMission;
const files = render(mission);
const h = createHash("sha256");
for (const key of [...files.keys()].sort()) {
  h.update(key); h.update("\\n");
  h.update(createHash("sha256").update(files.get(key)).digest("hex")); h.update("\\n");
}
process.stdout.write(h.digest("hex"));
`;

/**
 * Spawns node itself and registers tsx as a loader, rather than executing
 * `node_modules/.bin/tsx`. That path is a POSIX shell script; on Windows the
 * runnable shim is `tsx.CMD`, so `execFileSync` on the extensionless name
 * fails with ENOENT and takes the three determinism checks with it. Going
 * through `process.execPath` is the same child process on every platform.
 */
function renderInFreshProcess(env: NodeJS.ProcessEnv): string {
	return execFileSync(
		process.execPath,
		["--import", "tsx", "--input-type=module", "--eval", CHILD],
		{ encoding: "utf8", env: { ...process.env, ...env } },
	).trim();
}

describe("determinism", () => {
	test("twice in one process", () => {
		expect(packageDigest(render(fixtureMission))).toBe(
			packageDigest(render(fixtureMission)),
		);
	});

	test("twice in fresh processes", () => {
		expect(renderInFreshProcess({})).toBe(renderInFreshProcess({}));
	}, 60_000);

	/**
	 * The configuration that matters. Turkish lowercases I to a dotless ı, so
	 * any sort reaching localeCompare orders paths differently here and the
	 * package hash moves. Tokyo catches a date leaking into rendered bytes.
	 */
	test("under TZ=Asia/Tokyo LANG=tr_TR", () => {
		expect(
			renderInFreshProcess({
				TZ: "Asia/Tokyo",
				LANG: "tr_TR.UTF-8",
				LC_ALL: "tr_TR.UTF-8",
			}),
		).toBe(renderInFreshProcess({}));
	}, 60_000);

	/**
	 * The check above cannot fail on the slice-1 fixture: none of its 20 paths
	 * contains a character pair Turkish and root collation disagree about.
	 * This renders a mission that DOES contain such a pair, so a comparator
	 * regression moves the hash instead of hiding.
	 *
	 * The claim that once stood here — "proven by mutation, swapping byCodepoint
	 * for localeCompare left every test green" — is true of ONE call site, not
	 * all of them, and it is worth knowing which. Swapping the AGENT sort is
	 * invisible in both fixtures on any machine: their slugs are the same three
	 * (`operator`, `transactions`, `nemi`) and no locale orders those
	 * differently from codepoint, so nothing here probes that sort at all.
	 * Swapping the MANIFEST's path sort is caught, by slice-1's own
	 * `manifest.json renders byte-for-byte` and by the pinned digest below.
	 *
	 * ON WINDOWS THIS TEST IS VACUOUS, and the one below is what actually bites.
	 * LANG and LC_ALL do not reach node's collator here: both children resolve
	 * `Intl.Collator().resolvedOptions().locale` to en-US no matter what this
	 * env says, and `"I".toLowerCase()` is `i`, not the dotless ı the comment
	 * above assumes. Measured through this exact execFileSync path. TZ is
	 * unaffected — the same child reports getHours(0) as 9 under Asia/Tokyo
	 * against 18 without it — so the timestamp half of this pattern is real
	 * everywhere and only the locale half is platform-dependent.
	 *
	 * It is kept because it DOES bite on a Linux runner, and deleting it would
	 * drop that coverage silently.
	 */
	test("under tr_TR, on paths where collation and codepoint order disagree", () => {
		expect(
			renderInFreshProcess({
				RENDER_CASE: "locale-probe",
				TZ: "Asia/Tokyo",
				LANG: "tr_TR.UTF-8",
				LC_ALL: "tr_TR.UTF-8",
			}),
		).toBe(renderInFreshProcess({ RENDER_CASE: "locale-probe" }));
	}, 60_000);

	/**
	 * The locale-probe package, PINNED — the platform-independent half.
	 *
	 * Every determinism test above compares two runs against EACH OTHER, so a
	 * regression that moves both sides equally is invisible to all of them. On a
	 * machine where LC_ALL does not reach the collator there is no second locale
	 * to disagree with the first, so both sides always move together and the
	 * whole pattern degrades to "the renderer agrees with itself".
	 *
	 * A frozen digest has no such blind spot, because it is ONE side. Anything
	 * that reorders or changes the package moves it, with no second process and
	 * no environment involved.
	 *
	 * Verified rather than assumed, on the manifest's path sort: recomputing
	 * package_sha256 over this fixture with localeCompare instead of byCodepoint
	 * gives 5a267e58… against the real 890e400f…, under a plain en-US default
	 * and no env at all. These 22 paths already disagree between en-US collation
	 * and codepoint order — en-US puts `contract/…` first, codepoint puts
	 * `MISSION.md` first — which is what makes that true here.
	 *
	 * If this number moves, something reordered the render. Find out what before
	 * updating it; that is the entire point of writing it down.
	 */
	test("locale-probe package hashes to a frozen value", () => {
		expect(packageDigest(render(localeProbeMission))).toBe(
			"245f7af0856048dafeaef0fbc000e6262ea0e42c9491827e766a8b1e92c4801a",
		);
	});

	/**
	 * The comparator itself. The hazard is not that any one locale is wrong,
	 * it is that two locales DISAGREE: tr orders "Ilk" before "ilk" and en
	 * orders it after, so a locale-derived sort produces different bytes on
	 * different machines. byCodepoint is invariant.
	 *
	 * The first version of this test asserted that tr disagrees with codepoint
	 * order. That was false — tr and codepoint happen to agree on this pair —
	 * and the test caught it. The fact under test is the tr/en disagreement.
	 */
	test("byCodepoint is not locale-derived", () => {
		expect(Math.sign("Ilk".localeCompare("ilk", "tr"))).not.toBe(
			Math.sign("Ilk".localeCompare("ilk", "en")),
		);
		expect(Math.sign(byCodepoint("Ilk", "ilk"))).toBe(-1);
		expect(Math.sign(byCodepoint("ilk", "Ilk"))).toBe(1);
	});
});
