import type { CrudCode, ErrorCode } from "#/contract/shared/errors";
import { isTerminal } from "#/modules/export/delivery/lifecycle";
import type { ExportRow, RenderPackage } from "#/modules/export/service";
import { packageHashOf } from "#/modules/export/service";
import { writeZip } from "#/modules/export/zip/writeZip";

/**
 * Rebuilding a delivered zip, rather than storing one.
 *
 * The zip target returns its bytes and persists nothing — R2 was never
 * provisioned, and `exports_snapshot_all_or_none` refuses two-thirds of a
 * snapshot record — so the one target that works end to end currently produces
 * an archive nobody can retrieve.
 *
 * The render is deterministic, so the bytes are recoverable: re-render, rebuild
 * the zip, and the output is byte-identical to what was delivered. That is
 * cheaper than blob storage AND strictly stronger, because rebuilding requires
 * re-running the render, and a re-run can be COMPARED against the hash the
 * delivery recorded.
 *
 * THAT COMPARISON IS THE POINT OF THIS MODULE. A mismatch means the archive
 * this would hand back cannot be shown to be the archive that was delivered.
 * Serving it anyway would quietly substitute one artifact for another under the
 * same export id, which for a client deliverable is the worst thing this
 * endpoint could do. It refuses instead. The same free determinism gate the
 * preview/delivery comparison provides, obtained a second time at retrieval.
 *
 * A MISMATCH DOES NOT MEAN THE RENDER MOVED, and this module must not claim it
 * does. There are at least two causes and it can tell them apart from neither:
 * the render genuinely changed, or the recorded hash was computed by a
 * different DEFINITION of the package hash. The second is not hypothetical —
 * exports delivered before the hash stopped including manifest.json recorded a
 * value no rebuild can reproduce, so those rows are permanently unservable as a
 * consequence of a correctness fix rather than as evidence of drift. The two
 * call for completely different responses from whoever reads the refusal, so it
 * reports the disagreement and names both rather than diagnosing one. There is
 * a test pinning the two definitions apart in archive.test.ts.
 */

/** What `RenderPackage` needs. Narrower than a mission row on purpose. */
export type ArchiveMission = {
	id: string;
	type: string;
	sprintN: number;
	brief: Record<string, unknown>;
};

export type ArchiveDeps = {
	/** Read-only. The route wires this to `getExport`. */
	loadExport: (id: string) => Promise<ExportRow | null>;
	/** Read-only. The export row holds a mission id, not a mission. */
	loadMission: (id: string) => Promise<ArchiveMission | null>;
	renderPackage: RenderPackage;
};

export type ArchiveFailure = {
	/** Both vocabularies, matching what `errorResponse` accepts. */
	code: ErrorCode | CrudCode;
	status: 404 | 422;
	detail: string;
	details?: Record<string, unknown>;
};

export type ArchiveResult =
	| {
			ok: true;
			bytes: Uint8Array;
			byteLength: number;
			/** Of the ARCHIVE. Not the package hash; different preimages. */
			sha256: string;
			filename: string;
	  }
	| { ok: false; failure: ArchiveFailure };

const fail = (
	code: ErrorCode | CrudCode,
	status: 404 | 422,
	detail: string,
	details?: Record<string, unknown>,
): ArchiveResult => ({ ok: false, failure: { code, status, detail, details } });

/**
 * Deterministic, and derived from the mission and the sprint the EXPORT
 * recorded rather than the mission's current one — see the note on sprintN
 * below. Both components are a uuid and an integer straight out of typed
 * columns, so neither can carry a quote or a newline into the header.
 */
export function archiveFilename(row: {
	missionId: string;
	sprintN: number;
}): string {
	return `avel-mission-${row.missionId}-sprint-${row.sprintN}.zip`;
}

export async function buildArchive(
	deps: ArchiveDeps,
	id: string,
): Promise<ArchiveResult> {
	const row = await deps.loadExport(id);

	/**
	 * REPO_NOT_FOUND IS THE WRONG NOUN, AND IT IS THE ONLY 404 CODE THERE IS.
	 *
	 * Same deviation `exports.$id.ts` already carries and documents: `export.get`
	 * declares `404: errorEnvelope`, and ERROR_CODES holds nothing meaning "no
	 * such export". Reusing the existing filed gap rather than opening a second
	 * one; the message always names what is actually missing.
	 */
	if (!row) return fail("REPO_NOT_FOUND", 404, `No export with id ${id}.`);

	/**
	 * THE FOUR REFUSALS BELOW ARE PRECONDITION_FAILED, NOT 404.
	 *
	 * The export exists in every one of them; what is missing is a condition it
	 * would need to have an archive. A github_pr delivered a pull request and no
	 * archive was ever built. A row short of a terminal delivered state has not
	 * produced one yet. A row with no recorded hash has nothing for a rebuild to
	 * be checked against. A row whose mission is gone cannot be re-rendered at
	 * all. Answering 404 to any of these would say "no such export", which is
	 * false and sends the reader looking for the wrong thing.
	 *
	 * PRECONDITION_FAILED comes from CRUD_CODES because ERROR_CODES cannot
	 * express it — the same gap that produced IDEMPOTENCY_REPLAY and
	 * GITHUB_REJECTED, and the same answer `http.ts` already gives for a
	 * malformed body. `export.get` declares 200 and 404 only, so 422 here is a
	 * KNOWN DEVIATION, filed with the other contract gaps rather than hidden.
	 *
	 * A genuinely missing row is still a 404 above, which is the distinction this
	 * split exists to preserve.
	 */
	if (row.targetKind !== "zip") {
		return fail(
			"PRECONDITION_FAILED",
			422,
			`Export ${id} is a ${row.targetKind} export. Only a zip export has an archive; a GitHub delivery's artifact is the commit it wrote.`,
		);
	}

	/**
	 * TERMINAL, not merely "not failed". `previewed` is terminal too and must be
	 * refused — a dry run is never promoted and delivered nothing — so the state
	 * is checked against the lifecycle machine and then narrowed to `done`, which
	 * is the only terminal state a zip delivery reaches.
	 */
	if (!isTerminal(row.status) || row.status !== "done") {
		return fail(
			"PRECONDITION_FAILED",
			422,
			`Export ${id} is ${row.status}, so nothing was delivered and there is no archive to rebuild.`,
		);
	}

	const recorded = (row.versionManifest as { packageSha256?: string } | null)
		?.packageSha256;
	if (!recorded) {
		return fail(
			"PRECONDITION_FAILED",
			422,
			`Export ${id} recorded no package hash, so a rebuild cannot be compared against what was delivered. Serving it would assert an equality nobody checked.`,
		);
	}

	const mission = await deps.loadMission(row.missionId);
	if (!mission) {
		return fail(
			"PRECONDITION_FAILED",
			422,
			`Export ${id} references mission ${row.missionId}, which no longer exists, so its package cannot be re-rendered.`,
		);
	}

	/**
	 * THE EXPORT'S sprintN, NOT THE MISSION'S. They diverge the moment a mission
	 * advances a sprint, and the export row snapshots the value the delivery
	 * actually rendered.
	 *
	 * Reading the mission's current sprint would re-render a DIFFERENT package,
	 * the hash comparison below would fail, and the refusal would read
	 * DETERMINISM_VIOLATION — blaming the render path for a value this function
	 * chose wrong. Nothing about that failure would point at this line.
	 *
	 * `type` and `brief` have no such snapshot and are read as they stand. If
	 * either has changed since delivery the hashes will not match and the
	 * archive is refused, which is the correct outcome: what would be rebuilt is
	 * genuinely not what was delivered.
	 */
	const files = await deps.renderPackage({
		id: mission.id,
		type: mission.type,
		sprintN: row.sprintN,
		brief: mission.brief,
	});

	const rebuilt = packageHashOf(files);
	if (rebuilt !== recorded) {
		return fail(
			"DETERMINISM_VIOLATION",
			422,
			`Export ${id} rebuilt to a package hash different from the one it recorded, so the archive that would be served cannot be shown to be the archive that was delivered. Nothing was returned. Either the render moved, or the recorded hash predates a change in how that hash is computed; this cannot tell which.`,
			{ recordedPackageSha256: recorded, rebuiltPackageSha256: rebuilt },
		);
	}

	const { bytes, sha256, byteLength } = writeZip(files);
	return {
		ok: true,
		bytes,
		byteLength,
		sha256,
		filename: archiveFilename(row),
	};
}
