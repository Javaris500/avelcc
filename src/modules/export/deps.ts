import { db } from "#/modules/db/client";
import { computeBlastRadius } from "#/modules/export/blast/computeBlastRadius";
import { DEFAULT_ALLOWED_PATH_PREFIXES } from "#/modules/export/blast/types";
import {
	githubPrTarget,
	githubPushTarget,
} from "#/modules/export/delivery/githubTargets";
import type { DeliveryTarget } from "#/modules/export/delivery/types";
import { zipTarget } from "#/modules/export/delivery/zipTarget";
import { readTreeOrEmpty } from "#/modules/export/gateway/readTree";
import { gitBlobSha } from "#/modules/export/git/gitBlobSha";
import { fixtureMission } from "#/modules/export/render/fixture-mission";
import { render } from "#/modules/export/render/render";
import type { ExportDeps, RenderPackage } from "#/modules/export/service";

/**
 * The default wiring for the export routes.
 *
 * Split from the service so the service stays injectable, and split from the
 * routes so three of them do not each assemble it slightly differently.
 */

/**
 * THE PLACEHOLDER, AND THE LARGEST REMAINING GAP IN THE EXPORT PATH.
 *
 * `render()` takes a RenderMission — the roster, the playbook, every agent's
 * granted skills — and NOTHING ASSEMBLES ONE FROM NEON. That assembler is a
 * real module over RosterEntry, AgentTemplate, Skill and Playbook, and it does
 * not exist. Until it does, every mission renders the SAME golden fixture
 * package regardless of which mission was asked for.
 *
 * That is deliberately obvious rather than subtly wrong. The export machinery
 * downstream of here — hashing, blast radius, the guards, all three targets —
 * is exercised for real by this, and swapping in the assembler is a one-line
 * change at this call site. What must not happen is someone reading a delivered
 * package as evidence that THEIR mission rendered correctly.
 */
export const renderFixturePackage: RenderPackage = async () =>
	render(fixtureMission);

export function targetFor(kind: string): DeliveryTarget {
	switch (kind) {
		case "zip":
			return zipTarget;
		case "github_pr":
		case "github_push": {
			// Server-side only. A GitHub target with no credential cannot run, and
			// failing here names the reason rather than surfacing a 401 later.
			const token = process.env.GITHUB_TOKEN;
			if (!token) {
				throw new Error(
					`A ${kind} delivery needs GITHUB_TOKEN on the server. None is set.`,
				);
			}
			return kind === "github_pr"
				? githubPrTarget({ token })
				: githubPushTarget({ token });
		}
		default:
			throw new Error(`Unknown export target ${kind}.`);
	}
}

export const exportDeps: ExportDeps = {
	db,
	renderPackage: renderFixturePackage,
	targetFor: (kind) => targetFor(kind),

	readRemote: ({ owner, repo, ref }) =>
		readTreeOrEmpty({ owner, repo, ref, token: process.env.GITHUB_TOKEN }),

	computeRadius: (files, remote) => {
		const rendered = [...files.entries()].map(([path, bytes]) => ({
			path,
			bytes,
			blobSha: gitBlobSha(bytes),
		}));
		const core = computeBlastRadius(rendered, remote, {
			allowedPathPrefixes: DEFAULT_ALLOWED_PATH_PREFIXES,
			declaredWritablePaths: ["**"],
		});
		return {
			violations: core.violations,
			// computedAt is stamped by the caller, never by the pure function —
			// computeBlastRadius is forbidden a clock, which is what keeps it
			// testable. Same split the preflight route makes.
			radius: { ...core, computedAt: new Date().toISOString() },
		};
	},
};
