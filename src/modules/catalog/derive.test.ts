import { describe, expect, it } from "vitest";

import {
	type AgentTemplateRow,
	agentKind,
	agentRuntime,
	agentTeam,
	agentTemplateRow,
	type SkillRow,
	skillRow,
	skillType,
} from "#/contract/catalog";
import {
	danglingAttachments,
	isRevoked,
	strandedModelContext,
} from "#/modules/catalog/derive";
import { describeCatalogFailure } from "#/modules/catalog/queries";

/**
 * The two conditions this catalog exists to make visible both shipped as bugs
 * on this project, so neither is left to a reading of the screen. They are
 * functions, and this is what makes them a mechanism rather than an intention.
 *
 * CLAUDE.md: "A green test suite means the code ran. It does not mean the tests
 * checked anything." So each case below asserts the value, and the negative
 * cases are the ones that matter: a live skill with attachments must NOT be
 * flagged, and a model agent with markdown must NOT be flagged, or the warning
 * appears on every row and stops meaning anything.
 */

const SOURCE_ID = "11111111-1111-4111-8111-111111111111";
const SKILL_ID = "22222222-2222-4222-8222-222222222222";
const TEMPLATE_ID = "33333333-3333-4333-8333-333333333333";
const MISSION_ID = "44444444-4444-4444-8444-444444444444";

function skill(overrides: Partial<SkillRow> = {}): SkillRow {
	return {
		id: SKILL_ID,
		slug: "tdd-workflow",
		name: "TDD workflow",
		type: "knowledge",
		contentMd: "# TDD",
		avelEnhancementMd: null,
		sourceId: SOURCE_ID,
		sourceName: "Internal",
		sourceRevoked: false,
		recommendedFor: [],
		attachedTo: { templates: [], rosterEntries: [] },
		revokedAt: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

function attachedTemplate() {
	return {
		id: TEMPLATE_ID,
		slug: "frontend",
		name: "Frontend",
		runtime: "model" as const,
		revoked: false,
	};
}

function attachedEntry() {
	return {
		id: "55555555-5555-4555-8555-555555555555",
		missionId: MISSION_ID,
		missionTitle: "Sprint 1",
		agentSlug: "frontend",
		inactive: false,
	};
}

function template(overrides: Partial<AgentTemplateRow> = {}): AgentTemplateRow {
	return {
		id: TEMPLATE_ID,
		slug: "frontend",
		name: "Frontend",
		kind: "horizontal",
		team: "frontend",
		engagementId: null,
		engagementName: null,
		clientName: null,
		runtime: "model",
		waveDefaults: [],
		identityMd: "You are the frontend agent.",
		depthMd: null,
		writablePaths: [],
		appendOnlyPaths: [],
		readonlyPaths: [],
		skills: [],
		rosterUseCount: 0,
		revokedAt: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

describe("the vocabulary matches the database", () => {
	/**
	 * Pinned as a LIST rather than a count, for the reason contract.test.ts
	 * gives: which members exist is the fact, and a count goes green when one is
	 * swapped for another. These four are `skill_type`, `agent_runtime`,
	 * `agent_kind` and `agent_team` in schema.ts, and a screen that has drifted
	 * from any of them renders a row with no chip at all: every chip in
	 * chips.tsx is a total Record keyed by one of these.
	 */
	it("carries the four skill and agent enums verbatim", () => {
		expect(skillType.options).toEqual(["knowledge", "capability"]);
		expect(agentRuntime.options).toEqual(["model", "human", "code"]);
		expect(agentKind.options).toEqual(["horizontal", "feature"]);
		expect(agentTeam.options).toEqual(["frontend", "backend", "qa", "root"]);
	});
});

describe("revocation", () => {
	it("reads a null timestamp as live", () => {
		expect(isRevoked(skill())).toBe(false);
	});

	it("reads any timestamp as revoked", () => {
		expect(isRevoked(skill({ revokedAt: "2026-02-01T00:00:00.000Z" }))).toBe(
			true,
		);
	});
});

describe("a revoked skill that something still holds", () => {
	it("is not flagged while the skill is live, however many hold it", () => {
		const held = skill({
			attachedTo: {
				templates: [attachedTemplate()],
				rosterEntries: [attachedEntry()],
			},
		});
		// The whole point of the negative case: a live skill attached to five
		// things is the normal, healthy state and must render no warning.
		expect(danglingAttachments(held)).toBe(0);
	});

	it("is not flagged when revoked and nothing holds it", () => {
		expect(
			danglingAttachments(skill({ revokedAt: "2026-02-01T00:00:00.000Z" })),
		).toBe(0);
	});

	it("counts both relations, not just the template one", () => {
		const stranded = skill({
			revokedAt: "2026-02-01T00:00:00.000Z",
			attachedTo: {
				templates: [attachedTemplate()],
				rosterEntries: [attachedEntry(), attachedEntry()],
			},
		});
		expect(danglingAttachments(stranded)).toBe(3);
	});

	it("counts an inactive roster entry", () => {
		// `active` gates dispatch, not the render. An inactive entry still
		// carries the skill into the package, so it is the same exposure.
		const stranded = skill({
			revokedAt: "2026-02-01T00:00:00.000Z",
			attachedTo: {
				templates: [],
				rosterEntries: [{ ...attachedEntry(), inactive: true }],
			},
		});
		expect(danglingAttachments(stranded)).toBe(1);
	});
});

describe("model context on an agent that cannot receive it", () => {
	it("is not flagged on a model agent, whatever it stores", () => {
		expect(
			strandedModelContext(template({ identityMd: "x", depthMd: "y" })),
		).toBe(false);
	});

	it("is not flagged on a human agent whose columns are empty", () => {
		// `identity_md` is NOT NULL, so every human agent holds a string. Treating
		// "" as content would flag every one of them and the warning would mean
		// nothing.
		expect(
			strandedModelContext(
				template({ runtime: "human", identityMd: "", depthMd: null }),
			),
		).toBe(false);
	});

	it("is not flagged on whitespace alone", () => {
		expect(
			strandedModelContext(
				template({ runtime: "code", identityMd: "  \n\t ", depthMd: "  " }),
			),
		).toBe(false);
	});

	it("is flagged when a human agent stores identity text", () => {
		expect(
			strandedModelContext(
				template({ runtime: "human", identityMd: "You..." }),
			),
		).toBe(true);
	});

	it("is flagged when a code agent stores depth text only", () => {
		expect(
			strandedModelContext(
				template({ runtime: "code", identityMd: "", depthMd: "Go deep." }),
			),
		).toBe(true);
	});
});

describe("the shapes reject a body that does not match", () => {
	it("rejects a skill missing its attachment relations", () => {
		const { attachedTo, ...withoutAttachments } = skill();
		expect(skillRow.safeParse(withoutAttachments).success).toBe(false);
	});

	it("rejects a runtime outside the database's enum", () => {
		expect(
			agentTemplateRow.safeParse({ ...template(), runtime: "agent" }).success,
		).toBe(false);
	});
});

describe("what a failing catalog read tells the operator", () => {
	/**
	 * An unbuilt endpoint is not a fault and must not offer a retry. The route
	 * will not appear because it was asked for twice, and a retry button in
	 * front of an operator who can do nothing is the same defect as a dropdown
	 * that filters nothing.
	 */
	it("offers no retry for an endpoint nobody has built", () => {
		const shown = describeCatalogFailure("ENDPOINT_ABSENT", "skills catalog");
		expect(shown.canRetry).toBe(false);
		expect(shown.title).toContain("not connected yet");
	});

	it("offers no retry for a contract mismatch", () => {
		expect(
			describeCatalogFailure("SHAPE_MISMATCH", "skills catalog").canRetry,
		).toBe(false);
	});

	it("offers a retry only where no envelope arrived at all", () => {
		expect(describeCatalogFailure("HTTP_503", "skills catalog").canRetry).toBe(
			true,
		);
	});

	it("names what was being read in every message", () => {
		for (const code of ["ENDPOINT_ABSENT", "FORBIDDEN", "SHAPE_MISMATCH"]) {
			const shown = describeCatalogFailure(code, "agent template catalog");
			expect(`${shown.title} ${shown.body}`).toContain(
				"agent template catalog",
			);
		}
	});
});
