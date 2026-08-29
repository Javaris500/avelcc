import { byCodepoint, sorted } from "#/modules/export/render/bytes";
import type { JsonValue } from "#/modules/export/render/json";
import type { RenderMission } from "#/modules/export/render/types";

/**
 * Document generators. Each builds a file from mission FIELDS rather than
 * storing the file, which is what makes the field list in types.ts a real
 * discovery rather than a description of something already written.
 */

/** MISSION.md — the human entry point. */
export function missionMd(m: RenderMission): string {
	const rows = sorted(m.agents, (a) => `${a.phase} ${a.slug}`).map(
		(a) => `| ${a.phase} | ${a.slug} | ${a.owns} |`,
	);
	const commands = m.doneCommands.map((c) => `- \`${c}\``);
	return [
		`# Mission: ${m.title}`,
		"",
		`**Client:** ${m.client}`,
		`**Type:** ${m.missionType}`,
		`**Sprint:** ${m.sprint}`,
		`**Cut:** ${m.cut} (${m.cutSource} — ${m.cutEvidence})`,
		"",
		"## What ships",
		"",
		m.whatShips,
		"",
		"## Definition of done",
		"",
		"Both gates green:",
		...commands,
		"",
		"Neither is optional. One red means no ship.",
		"",
		"## Who is running",
		"",
		"| Phase | Agent | Owns |",
		"|---|---|---|",
		...rows,
		"",
		"Every agent on this mission, with its phase and its mount, is declared in",
		"`roster/roster.json`. That file is authoritative. A dispatch narrows a mount.",
		"It never widens one.",
		"",
		"## Where things go",
		"",
		"- Read `conventions/` before writing any code.",
		"- Write completion reports to `process/reports/`.",
		"- File blockers rather than absorbing them silently.",
		"- Log every decision in `process/log/decision-log.md`.",
		"",
		"## What is forbidden",
		"",
		"Writing outside your declared mount. See `roster/roster.json`.",
		"This is enforced, not advised.",
	].join("\n");
}

/**
 * mission/playbook.md — process for this mission TYPE, not this mission.
 *
 * Gates render in the playbook's declared order, which is the order the
 * process runs. The "arrays sorted by a declared key" rule reaches the
 * Playbook entity's array; a markdown table a human reads in wave order is a
 * different artifact from that array.
 */
export function playbookMd(m: RenderMission): string {
	const p = m.playbook;
	return [
		`# Playbook: ${p.missionType}`,
		"",
		"## Waves",
		p.waves.join(" → "),
		"",
		"## Gates",
		"",
		"| Gate | Policy |",
		"|---|---|",
		...p.gates.map((g) => `| ${g.gate} | ${g.policy} |`),
		"",
		"Gate policy is mandatory or warn only. Shipping past a red mandatory gate",
		"requires a written override that is rendered into the delivery",
		"and visible to the client.",
		"",
		"## Deliverable",
		p.deliverable,
		"",
		"## Required fields",
		p.requiredFields.join(" · "),
		"",
		"## Hard block",
		p.hardBlock,
	].join("\n");
}

/**
 * roster/roster.json — the mount table the sandbox reads and the ownership
 * check compares a diff against.
 *
 * Agents sorted by slug, globs sorted within each array, edges sorted by
 * (from, artifact), `to` sorted. `phases` is NOT sorted: it is a sequence and
 * its order is semantic. It happens to be alphabetical here, so a renderer
 * that wrongly sorted it would still pass this fixture and break on the first
 * playbook whose waves are not in alphabetical order.
 */
export function rosterJson(m: RenderMission): JsonValue {
	return {
		agents: sorted(m.agents, (a) => a.slug).map((a) => ({
			append_only: [...a.appendOnly].sort(byCodepoint),
			kind: a.kind,
			phase: a.phase,
			readonly: [...a.readonly].sort(byCodepoint),
			runtime: a.runtime,
			slug: a.slug,
			writable: [...a.writable].sort(byCodepoint),
		})),
		cut: m.cut,
		edges: sorted(m.edges, (e) => `${e.from} ${e.artifact}`).map((e) => ({
			artifact: e.artifact,
			from: e.from,
			to: [...e.to].sort(byCodepoint),
		})),
		phases: [...m.phases],
	};
}

/** process/log/decision-log.md — append-only, and with no clock in it. */
export function decisionLogMd(m: RenderMission, preamble: string): string {
	const entries = m.decisionLog.map((e) =>
		[
			`### ${e.sequence} · ${e.agent} · sprint ${e.sprint} · phase ${e.phase}`,
			"",
			"Decision",
			`  ${e.decision}`,
			"",
			"Context",
			`  ${e.context}`,
			"",
			"Alternatives",
			`  ${e.alternatives}`,
			"",
			"Consequence",
			`  ${e.consequence}`,
			"",
			"Supersedes",
			`  ${e.supersedes}`,
		].join("\n"),
	);
	return [preamble, "", "## Entries", "", entries.join("\n\n")].join("\n");
}
