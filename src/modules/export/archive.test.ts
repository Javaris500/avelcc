import { describe, expect, it } from "vitest";

import {
	type ArchiveDeps,
	type ArchiveMission,
	archiveFilename,
	buildArchive,
} from "#/modules/export/archive";
import { fixtureMission } from "#/modules/export/render/fixture-mission";
import { packageSha256, sha256Hex } from "#/modules/export/render/manifest";
import { render } from "#/modules/export/render/render";
import type { ExportRow, RenderPackage } from "#/modules/export/service";
import { packageHashOf } from "#/modules/export/service";
import { writeZip } from "#/modules/export/zip/writeZip";

/**
 * The archive path, exercised against a REAL render.
 *
 * Nothing here fakes the package: `renderFixturePackage` is the same function
 * the route wires in, `packageHashOf` is the same hash the delivery recorded,
 * and `writeZip` is the real writer. So the healthy case proves the actual
 * round trip — render, hash, compare, zip — rather than proving that a stub
 * returns what it was told to.
 */

const MISSION_ID = "2557be6c-4757-480d-8e53-03d64bf92181";
const EXPORT_ID = "06092187-0083-4d50-85fc-4da6007928d4";

const mission: ArchiveMission = {
	id: MISSION_ID,
	type: "full-build",
	sprintN: 1,
	brief: {},
};

/**
 * The same renderer `deps.ts` wires into the route, rebuilt here rather than
 * imported from it. deps.ts pulls in the runtime db client, which reads
 * DATABASE_URL at import time and throws in a suite that has no .env — so
 * importing the wiring file would make this test require a database it never
 * queries. archive.ts takes the renderer injected precisely so that is possible.
 */
const renderFixturePackage: RenderPackage = async () => render(fixtureMission);

/** The package that renderer produces, and its real hash. Computed, never typed in. */
const files = await renderFixturePackage(mission);
const REAL_HASH = packageHashOf(files);

function row(over: Partial<ExportRow> = {}): ExportRow {
	return {
		id: EXPORT_ID,
		missionId: MISSION_ID,
		sprintN: 1,
		idempotencyKey: "0f2b7e64-0c5a-4a1e-9a1c-2f9b6d3c8e77",
		targetKind: "zip",
		connectionId: null,
		status: "done",
		prStatus: null,
		snapshotKey: null,
		snapshotSha256: null,
		snapshotBytes: null,
		versionManifest: { packageSha256: REAL_HASH },
		verification: null,
		contractSha256: null,
		baseRef: null,
		baseCommitSha: null,
		blastRadius: null,
		gateOverride: null,
		dryRun: false,
		previewExportId: null,
		replayOf: null,
		createdAt: new Date("2026-08-29T00:00:00.000Z"),
		updatedAt: new Date("2026-08-29T00:00:00.000Z"),
		...over,
	};
}

function deps(over: Partial<ArchiveDeps> = {}): ArchiveDeps {
	return {
		loadExport: async () => row(),
		loadMission: async () => mission,
		renderPackage: renderFixturePackage,
		...over,
	};
}

describe("a healthy zip export", () => {
	it("rebuilds the archive and hands back real zip bytes", async () => {
		const result = await buildArchive(deps(), EXPORT_ID);
		if (!result.ok) throw new Error(`expected ok, got ${result.failure.code}`);

		// A real archive, not a placeholder: local file header magic.
		expect([...result.bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
		expect(result.byteLength).toBe(result.bytes.byteLength);
		expect(result.byteLength).toBeGreaterThan(0);
	});

	it("produces the same bytes the zip writer produces for that package", async () => {
		// The endpoint must not be a second, subtly different zip path.
		const result = await buildArchive(deps(), EXPORT_ID);
		if (!result.ok) throw new Error("expected ok");
		const direct = writeZip(files);
		expect(result.sha256).toBe(direct.sha256);
		expect([...result.bytes]).toEqual([...direct.bytes]);
	});

	it("is byte-identical across calls, which is the premise of the endpoint", async () => {
		// Storing nothing is only safe because two rebuilds agree. If this ever
		// fails, the endpoint is unsound rather than merely broken.
		const a = await buildArchive(deps(), EXPORT_ID);
		const b = await buildArchive(deps(), EXPORT_ID);
		if (!a.ok || !b.ok) throw new Error("expected ok");
		expect(a.sha256).toBe(b.sha256);
	});

	it("names the file from the mission and the sprint", async () => {
		const result = await buildArchive(deps(), EXPORT_ID);
		if (!result.ok) throw new Error("expected ok");
		expect(result.filename).toBe(`avel-mission-${MISSION_ID}-sprint-1.zip`);
		// Nothing that could break out of the Content-Disposition header.
		expect(result.filename).not.toMatch(/["\r\n;]/);
	});
});

describe("rows that have no archive", () => {
	it("refuses a github_pr export and says what its artifact is", async () => {
		const result = await buildArchive(
			deps({ loadExport: async () => row({ targetKind: "github_pr" }) }),
			EXPORT_ID,
		);
		if (result.ok) throw new Error("expected a refusal");
		expect(result.failure.code).toBe("PRECONDITION_FAILED");
		expect(result.failure.status).toBe(422);
		expect(result.failure.detail).toContain("github_pr");
		expect(result.failure.detail).toContain("commit");
	});

	it("refuses a row still at previewed, which delivered nothing", async () => {
		// `previewed` IS terminal, so a plain isTerminal check would have served a
		// dry run's archive as though it had been delivered.
		const result = await buildArchive(
			deps({ loadExport: async () => row({ status: "previewed" }) }),
			EXPORT_ID,
		);
		if (result.ok) throw new Error("expected a refusal");
		expect(result.failure.code).toBe("PRECONDITION_FAILED");
		expect(result.failure.status).toBe(422);
		expect(result.failure.detail).toContain("previewed");
	});

	it("refuses a row still in flight", async () => {
		const result = await buildArchive(
			deps({ loadExport: async () => row({ status: "delivering" }) }),
			EXPORT_ID,
		);
		if (result.ok) throw new Error("expected a refusal");
		expect(result.failure.status).toBe(422);
	});

	it("refuses a failed row", async () => {
		const result = await buildArchive(
			deps({ loadExport: async () => row({ status: "failed" }) }),
			EXPORT_ID,
		);
		if (result.ok) throw new Error("expected a refusal");
		expect(result.failure.status).toBe(422);
	});

	it("refuses a row that recorded no package hash", async () => {
		// Nothing to compare a rebuild against. Serving it would assert an
		// equality nobody checked, which is the same reason a preview with no
		// hash cannot authorize a delivery.
		const result = await buildArchive(
			deps({ loadExport: async () => row({ versionManifest: null }) }),
			EXPORT_ID,
		);
		if (result.ok) throw new Error("expected a refusal");
		expect(result.failure.code).toBe("PRECONDITION_FAILED");
		expect(result.failure.status).toBe(422);
		expect(result.failure.detail).toContain("no package hash");
	});

	it("refuses an empty manifest as firmly as a missing one", async () => {
		const result = await buildArchive(
			deps({ loadExport: async () => row({ versionManifest: {} }) }),
			EXPORT_ID,
		);
		if (result.ok) throw new Error("expected a refusal");
		expect(result.failure.detail).toContain("no package hash");
	});

	it("refuses when the export id matches nothing, and this is the ONLY 404", async () => {
		// The split that matters. Every other refusal here concerns an export that
		// exists, so answering 404 would say "no such export" — false, and it
		// sends whoever reads it looking for the wrong thing.
		const result = await buildArchive(
			deps({ loadExport: async () => null }),
			EXPORT_ID,
		);
		if (result.ok) throw new Error("expected a refusal");
		expect(result.failure.code).toBe("REPO_NOT_FOUND");
		expect(result.failure.status).toBe(404);
	});

	it("refuses when the mission behind the export is gone", async () => {
		const result = await buildArchive(
			deps({ loadMission: async () => null }),
			EXPORT_ID,
		);
		if (result.ok) throw new Error("expected a refusal");
		expect(result.failure.code).toBe("PRECONDITION_FAILED");
		expect(result.failure.status).toBe(422);
		expect(result.failure.detail).toContain(MISSION_ID);
	});
});

describe("the determinism comparison", () => {
	it("refuses when the rebuild does not match what was delivered", async () => {
		// THE POINT OF THE ENDPOINT. Serving here would substitute one artifact
		// for another under the same export id.
		const stale = "0".repeat(64);
		const result = await buildArchive(
			deps({
				loadExport: async () =>
					row({ versionManifest: { packageSha256: stale } }),
			}),
			EXPORT_ID,
		);
		if (result.ok) throw new Error("expected a refusal");

		expect(result.failure.code).toBe("DETERMINISM_VIOLATION");
		expect(result.failure.status).toBe(422);
		// Both hashes travel, because the first question is "differs how?".
		expect(result.failure.details).toEqual({
			recordedPackageSha256: stale,
			rebuiltPackageSha256: REAL_HASH,
		});
	});

	it("compares before zipping, so a mismatch produces no archive at all", async () => {
		const result = await buildArchive(
			deps({
				loadExport: async () =>
					row({ versionManifest: { packageSha256: "0".repeat(64) } }),
			}),
			EXPORT_ID,
		);
		expect(result.ok).toBe(false);
		expect("bytes" in result).toBe(false);
	});

	it("renders the sprint the EXPORT recorded, not the mission's current one", async () => {
		/**
		 * The trap this pins. A mission that has advanced a sprint would re-render
		 * a different package, the hash comparison would fail, and the refusal
		 * would read DETERMINISM_VIOLATION — blaming the render path for a value
		 * the archive code chose wrong.
		 */
		let sawSprint: number | undefined;
		const result = await buildArchive(
			deps({
				loadExport: async () => row({ sprintN: 2 }),
				loadMission: async () => ({ ...mission, sprintN: 9 }),
				renderPackage: async (m) => {
					sawSprint = m.sprintN;
					return renderFixturePackage(m);
				},
			}),
			EXPORT_ID,
		);

		expect(sawSprint).toBe(2);
		if (!result.ok) throw new Error("expected ok");
		expect(result.filename).toContain("sprint-2");
	});
});

describe("archiveFilename", () => {
	it("is a pure function of the mission and the sprint", () => {
		expect(archiveFilename({ missionId: MISSION_ID, sprintN: 3 })).toBe(
			`avel-mission-${MISSION_ID}-sprint-3.zip`,
		);
	});
});

describe("the hash definition every refusal here depends on", () => {
	/**
	 * WHY ROWS DELIVERED BEFORE THE HASH FIX CAN NEVER BE SERVED.
	 *
	 * `packageHashOf` excludes manifest.json, because a manifest cannot hash
	 * itself and the manifest's own package_sha256 excludes it. An earlier
	 * definition hashed every rendered entry INCLUDING the manifest, so exports
	 * delivered before that fix recorded a value this endpoint's rebuild can
	 * never reproduce.
	 *
	 * Those rows are permanently unservable, and that is a consequence of a
	 * correctness fix rather than evidence of a nondeterministic render. This
	 * test exists so the distinction is checkable rather than remembered: the two
	 * definitions must keep producing different values over the same bytes, or
	 * the reasoning above has quietly stopped being true.
	 *
	 * Observed on the fixture package, and matching the two values recorded in
	 * Neon before and after the fix:
	 *   including manifest.json  444fa0cd5822e6cb2e7e194e842a88d7a3bc0bbd5e7d460cdc386a433aaf2ee6
	 *   excluding manifest.json  0b094e20b37481e97069c5c1a6a725623ab98907e8419cc33a7da240c9fab0d9
	 */
	it("excludes manifest.json, and including it hashes differently", () => {
		const all = [...files.entries()].map(([path, bytes]) => ({
			path,
			sha256: sha256Hex(bytes),
		}));
		const including = packageSha256(all);
		const excluding = packageSha256(
			all.filter((f) => f.path !== "manifest.json"),
		);

		// The manifest is in the package, so the two questions differ.
		expect(all.some((f) => f.path === "manifest.json")).toBe(true);
		expect(including).not.toBe(excluding);
		// And the one the endpoint compares against is the excluding one.
		expect(excluding).toBe(REAL_HASH);
		expect(including).toBe(
			"444fa0cd5822e6cb2e7e194e842a88d7a3bc0bbd5e7d460cdc386a433aaf2ee6",
		);
		expect(excluding).toBe(
			"0b094e20b37481e97069c5c1a6a725623ab98907e8419cc33a7da240c9fab0d9",
		);
	});
});
