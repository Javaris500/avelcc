import { createHash } from "node:crypto";

import { byCodepoint } from "#/modules/export/render/bytes";
import type { JsonValue } from "#/modules/export/render/json";
import type { RenderMission } from "#/modules/export/render/types";

/** Lowercase hex, always. The encoding is not stated anywhere and this is the choice. */
export function sha256Hex(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

export type FileHash = { path: string; sha256: string };

/**
 * The package preimage.
 *
 * GOLDEN-FIXTURE says package_sha256 is "computed over the sorted file list and
 * their hashes" and never defines the serialization, so this IS the definition:
 *
 *   1. every file except manifest.json
 *   2. sorted by path ascending, by Unicode codepoint, explicit comparator
 *   3. each emitting  path + "\n" + sha256_hex_lowercase + "\n"
 *   4. concatenated, no separator beyond those newlines, nothing trailing
 *   5. sha256 of the UTF-8 of that string, lowercase hex
 *
 * A renderer that computes it any other way produces a manifest that disagrees
 * with the golden package while every individual file still matches.
 */
export function packagePreimage(files: readonly FileHash[]): string {
	return [...files]
		.sort((a, b) => byCodepoint(a.path, b.path))
		.map((f) => `${f.path}\n${f.sha256}\n`)
		.join("");
}

export function packageSha256(files: readonly FileHash[]): string {
	return sha256Hex(new TextEncoder().encode(packagePreimage(files)));
}

/**
 * manifest.json.
 *
 * `files` lists every rendered file EXCEPT manifest.json itself, which is also
 * excluded from the package hash — a manifest that hashed itself could not be
 * written.
 *
 * `gate.config_sha256` hashes `mission.gate.configPreimage`. The doc requires
 * this field and puts the versioned gate config outside the package, so there
 * are no bytes in the render to hash; the preimage is carried as an input so
 * the value is at least reproducible rather than a literal nobody can derive.
 */
export function manifestJson(
	m: RenderMission,
	rendered: ReadonlyMap<string, Uint8Array>,
): JsonValue {
	const files: FileHash[] = [];
	for (const [path, bytes] of rendered) {
		if (path === "manifest.json") continue;
		files.push({ path, sha256: sha256Hex(bytes) });
	}
	files.sort((a, b) => byCodepoint(a.path, b.path));

	return {
		avel_version: m.avelVersion,
		cut: m.cut,
		cut_source: m.cutSource,
		files: files.map((f) => ({ path: f.path, sha256: f.sha256 })),
		gate: {
			config_sha256: sha256Hex(new TextEncoder().encode(m.gate.configPreimage)),
			coverage_delta_min: m.gate.coverageDeltaMin,
			mutation_floor: m.gate.mutationFloor,
		},
		mission_id: m.missionId,
		package_sha256: packageSha256(files),
		sprint: m.sprint,
	};
}
