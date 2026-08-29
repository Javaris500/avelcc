import { byCodepoint, encode, sorted } from "#/modules/export/render/bytes";
import {
	decisionLogMd,
	missionMd,
	playbookMd,
	rosterJson,
} from "#/modules/export/render/documents";
import { encodeJson } from "#/modules/export/render/json";
import { manifestJson } from "#/modules/export/render/manifest";
import { SCAFFOLD } from "#/modules/export/render/scaffold";
import type { RenderMission } from "#/modules/export/render/types";

/**
 * render(mission) -> Map<path, Uint8Array>
 *
 * Paths are relative to `.avel/`. Nothing here reads a clock, generates an id,
 * or touches the filesystem, so the same mission renders the same bytes in any
 * process, timezone or locale.
 *
 * evidence/ is deliberately absent. The gate produces it at verification time;
 * a renderer that created it would put the two permanently out of step.
 *
 * SKILLS ARE NOT RENDERED. D5 is unruled: DATA-CONTRACTS-V2 renders a skill to
 * `.avel/skills/[agent]/[slug].md` and a capability to
 * `.avel/capabilities/[agent]/[slug].md`, while GOLDEN-FIXTURE files both under
 * `roster/<agent>/skills/`. The CONTENT is settled; only the path is not.
 * Guessing would produce a package that looks complete and hashes wrong, so
 * this stops short and says so.
 */
export function render(m: RenderMission): Map<string, Uint8Array> {
	const files = new Map<string, Uint8Array>();
	const put = (path: string, text: string) => files.set(path, encode(text));

	put("MISSION.md", missionMd(m));
	put("mission/brief.md", m.brief);
	put("mission/playbook.md", playbookMd(m));

	files.set("roster/roster.json", encodeJson(rosterJson(m)));
	for (const agent of sorted(m.agents, (a) => a.slug)) {
		// A runtime:human agent loads no model context, so it has neither file.
		if (agent.identityMd !== undefined) {
			put(`roster/${agent.slug}/identity.md`, agent.identityMd);
		}
		if (agent.depthMd !== undefined) {
			put(`roster/${agent.slug}/depth.md`, agent.depthMd);
		}
	}

	files.set("contract/phase1.openapi.json", encodeJson(m.contract));

	for (const convention of sorted(m.conventions, (c) => c.slug)) {
		put(`conventions/${convention.slug}.md`, convention.body);
	}

	put("process/dispatch/_TEMPLATE.md", SCAFFOLD.dispatchTemplate);
	put("process/findings/_TEMPLATE.md", SCAFFOLD.findingsTemplate);
	put("process/reports/_TEMPLATE.md", SCAFFOLD.reportsTemplate);
	put(
		"process/log/decision-log.md",
		decisionLogMd(m, SCAFFOLD.decisionLogPreamble),
	);

	// Last, because it hashes everything above it.
	files.set("manifest.json", encodeJson(manifestJson(m, files)));

	// Returned in sorted order so iteration is stable for any consumer, not
	// just for a consumer that happens to sort before comparing.
	return new Map([...files.entries()].sort((a, b) => byCodepoint(a[0], b[0])));
}
