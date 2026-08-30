import { initContract } from "@ts-rest/core";

import {
	agentTemplateContract,
	skillContract,
	skillSourceContract,
} from "#/contract/catalog";
import { clientContract } from "#/contract/client";
import { engagementContract } from "#/contract/engagement";
import { exportContract } from "#/contract/export";
import { intakeContract } from "#/contract/intake";
import { missionContract } from "#/contract/mission";
import { playbookContract } from "#/contract/playbook";
import { rosterContract } from "#/contract/roster";

const c = initContract();

/**
 * THE ARTIFACT.
 *
 * DATA-CONTRACTS-V2:48 — "the contract lives where neither the backend nor the
 * frontend can edit it unilaterally without the other noticing."
 *
 * Types are INFERRED from here, never hand-written. If a screen needs a shape
 * this does not define, that is a contract change and it gets filed, not
 * declared locally.
 *
 * BUILT: mission · roster · playbook · export · client · engagement · intake
 *        skill · agent-template · skill-source
 *
 * The three catalog groups are LIST ONLY. A `get` is not built because the
 * catalog's detail panel renders from the row already on screen rather than
 * fetching again, so it would be a procedure nothing calls. Writes are not
 * built because the catalog "ships empty and is populated in-app" and what that
 * write looks like is unspecified — inventing it is what this file prevents.
 *
 * NOT BUILT, and each is a documented gap rather than an oversight:
 *   preset                       BLOCKING, and worse than a missing route group.
 *                                RosterPreset is the ONLY entity in
 *                                DATA-CONTRACTS-V2's reference with NO FIELD
 *                                BLOCK — eleven of twelve have one. It gets two
 *                                sentences of prose and no shape.
 *                                Four things reference it: Playbook
 *                                .default_preset_id, Intake.suggested_preset_id,
 *                                the preset route group in the structure list,
 *                                and roster.applyPreset below.
 *                                So the shape applyPreset copies FROM is
 *                                undefined while the shape it copies TO is
 *                                fully specified. The missing part is the squad
 *                                itself: which templates, at which waves, with
 *                                which priorities. That is the whole entity.
 *                                Found by session 2 building the table and
 *                                discovering there was nothing to build.
 *   repo-policy, connection      shapes exist in DATA-CONTRACTS-V2.
 *   activity                     append-only, filters are enums.
 *
 * Adding any of them means inventing procedures the docs do not define, which
 * is the failure this file exists to prevent.
 */
export const contract = c.router({
	agentTemplate: agentTemplateContract,
	client: clientContract,
	engagement: engagementContract,
	intake: intakeContract,
	mission: missionContract,
	roster: rosterContract,
	playbook: playbookContract,
	export: exportContract,
	skill: skillContract,
	skillSource: skillSourceContract,
});

export type Contract = typeof contract;

export * from "#/contract/shared/envelope";
export * from "#/contract/shared/errors";
export * from "#/contract/shared/pagination";
