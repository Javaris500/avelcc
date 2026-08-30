import { initContract } from "@ts-rest/core";

import { clientContract } from "#/contract/client";
import { engagementContract } from "#/contract/engagement";
import { exportContract } from "#/contract/export";
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
 * BUILT: mission · roster · playbook · export · client · engagement
 *
 * NOT BUILT, and each is a documented gap rather than an oversight:
 *   client, engagement, intake   ROUTES.md rates all three BLOCKING. Three
 *                                entities with no procedures anywhere.
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
 *   skill-source                 no procedures exist; the catalogue is
 *                                populated in-app and something must write it.
 *   agent-template, skill        shapes exist; procedures not yet specified
 *                                beyond list/get.
 *   repo-policy, connection      shapes exist in DATA-CONTRACTS-V2.
 *   activity                     append-only, filters are enums.
 *
 * Adding any of them means inventing procedures the docs do not define, which
 * is the failure this file exists to prevent.
 */
export const contract = c.router({
	client: clientContract,
	engagement: engagementContract,
	mission: missionContract,
	roster: rosterContract,
	playbook: playbookContract,
	export: exportContract,
});

export type Contract = typeof contract;

export * from "#/contract/shared/envelope";
export * from "#/contract/shared/errors";
export * from "#/contract/shared/pagination";
