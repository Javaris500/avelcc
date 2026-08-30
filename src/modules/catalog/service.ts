import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";

import type {
	AgentTemplateRow,
	SkillAttachment,
	SkillRow,
	SkillSourceRow,
} from "#/contract/catalog";
import type { Db } from "#/modules/db/client";
import {
	agentTemplateSkills,
	agentTemplates,
	clients,
	engagements,
	missions,
	rosterEntries,
	rosterEntrySkills,
	skillSources,
	skills,
} from "#/modules/db/schema";

/**
 * The catalog reads: skills, agent templates, skill sources.
 *
 * THESE READS DELIBERATELY INCLUDE SOFT-DELETED ROWS, which is the opposite of
 * every other service in this codebase and is the whole point of the screens
 * they serve. A revoked skill still attached to a live roster entry is a real
 * defect this project has already shipped, and it is invisible on a screen that
 * filters revoked rows out. `deleted_at` travels as `revokedAt` so the row can
 * be marked rather than hidden.
 *
 * A NOTE FOR WHOEVER OWNS `softDelete.test.ts`. That scanner asks whether a
 * chain touching a soft-deletable table mentions `<table>.deletedAt` anywhere.
 * These queries satisfy it by SELECTING the column, not by filtering on it —
 * which is correct here and is also a gap in the check: it cannot distinguish
 * "filtered" from "selected". Reported rather than worked around.
 *
 * NO N+1. Each list runs one page query and a small fixed number of grouped
 * follow-ups keyed by the ids on that page, merged in JS. Same shape as the
 * client detail aggregates.
 */

/** Dates cross the wire as ISO strings, converted once at this edge. */
function iso(d: Date): string {
	return d.toISOString();
}
function isoOrNull(d: Date | null): string | null {
	return d === null ? null : d.toISOString();
}

type Page = { cursor?: string; limit: number };
type Listed<T> = { items: T[]; total: number; nextCursor: string | null };

/* ── skills ──────────────────────────────────────────────────────────────── */

export async function listSkills(
	db: Db,
	opts: Page,
): Promise<Listed<SkillRow>> {
	const cursor = opts.cursor ? new Date(opts.cursor) : null;

	/* includes-deleted: revoked skills are the point of this screen, and a
	   revoked SOURCE must not hide its live skills either. `deleted_at` is
	   selected rather than filtered, and travels as `revokedAt`. */
	const rows = await db
		.select({
			id: skills.id,
			slug: skills.slug,
			name: skills.name,
			type: skills.type,
			contentMd: skills.contentMd,
			avelEnhancementMd: skills.avelEnhancementMd,
			sourceId: skills.sourceId,
			recommendedFor: skills.recommendedFor,
			deletedAt: skills.deletedAt,
			createdAt: skills.createdAt,
			updatedAt: skills.updatedAt,
			sourceName: skillSources.name,
			sourceDeletedAt: skillSources.deletedAt,
		})
		.from(skills)
		.innerJoin(skillSources, eq(skills.sourceId, skillSources.id))
		.where(cursor ? lt(skills.createdAt, cursor) : undefined)
		.orderBy(desc(skills.createdAt))
		.limit(opts.limit + 1);

	const page = rows.slice(0, opts.limit);
	const ids = page.map((r) => r.id);
	const attached = await skillAttachments(db, ids);

	const items: SkillRow[] = page.map((r) => ({
		id: r.id,
		slug: r.slug,
		name: r.name,
		type: r.type,
		contentMd: r.contentMd,
		avelEnhancementMd: r.avelEnhancementMd,
		sourceId: r.sourceId,
		sourceName: r.sourceName,
		// True only where the SOURCE is revoked and the skill itself is not.
		// A revoked skill under a revoked source is already marked by its own
		// state; the interesting row is the live skill whose source is gone.
		sourceRevoked: r.sourceDeletedAt !== null && r.deletedAt === null,
		recommendedFor: r.recommendedFor,
		attachedTo: attached.get(r.id) ?? { templates: [], rosterEntries: [] },
		revokedAt: isoOrNull(r.deletedAt),
		createdAt: iso(r.createdAt),
		updatedAt: iso(r.updatedAt),
	}));

	const nextCursor =
		rows.length > opts.limit ? (items.at(-1)?.createdAt ?? null) : null;
	/* includes-deleted: the total must match a list that returns them. */
	const [t] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(skills)
		// Counts revoked rows too, because the list returns them. A total that
		// disagreed with the page would read as a paging bug.
		.where(sql`true`);
	return { items, total: t?.n ?? 0, nextCursor };
}

/**
 * Both attachment relations for a page of skills, in two grouped queries.
 *
 * TWO RELATIONS, NOT ONE. `agent_template_skills` is what a template WILL carry
 * into any future roster. `roster_entry_skills` is what a mission ALREADY
 * carries. Reading only the first would report a withdrawn skill as unattached
 * while a live mission is still shipping it.
 */
async function skillAttachments(
	db: Db,
	skillIds: string[],
): Promise<Map<string, SkillAttachment>> {
	const out = new Map<string, SkillAttachment>();
	if (skillIds.length === 0) return out;
	for (const id of skillIds) out.set(id, { templates: [], rosterEntries: [] });

	/* includes-deleted: a REVOKED template still holding a skill is exactly the
	   risk this list exists to surface, so it is marked rather than dropped. */
	const viaTemplate = await db
		.select({
			skillId: agentTemplateSkills.skillId,
			id: agentTemplates.id,
			slug: agentTemplates.slug,
			name: agentTemplates.name,
			runtime: agentTemplates.runtime,
			deletedAt: agentTemplates.deletedAt,
		})
		.from(agentTemplateSkills)
		.innerJoin(
			agentTemplates,
			eq(agentTemplateSkills.agentTemplateId, agentTemplates.id),
		)
		.where(inArray(agentTemplateSkills.skillId, skillIds));

	for (const t of viaTemplate) {
		out.get(t.skillId)?.templates.push({
			id: t.id,
			slug: t.slug,
			name: t.name,
			runtime: t.runtime,
			revoked: t.deletedAt !== null,
		});
	}

	/* includes-deleted applies to agent_templates only. MISSIONS ARE FILTERED,
	   and that is a defect the scanner caught rather than a rule it enforced: a
	   soft-deleted mission's roster entry would have made a revoked skill read
	   as still in use, which is the precise claim this field exists to make and
	   the precise case where it would have been false. */
	const viaRoster = await db
		.select({
			skillId: rosterEntrySkills.skillId,
			id: rosterEntries.id,
			missionId: rosterEntries.missionId,
			active: rosterEntries.active,
			agentSlug: agentTemplates.slug,
			missionTitle: missions.title,
		})
		.from(rosterEntrySkills)
		.innerJoin(
			rosterEntries,
			eq(rosterEntrySkills.rosterEntryId, rosterEntries.id),
		)
		.innerJoin(
			agentTemplates,
			eq(rosterEntries.agentTemplateId, agentTemplates.id),
		)
		.innerJoin(missions, eq(rosterEntries.missionId, missions.id))
		.where(
			and(
				inArray(rosterEntrySkills.skillId, skillIds),
				isNull(missions.deletedAt),
			),
		);

	for (const r of viaRoster) {
		out.get(r.skillId)?.rosterEntries.push({
			id: r.id,
			missionId: r.missionId,
			missionTitle: r.missionTitle,
			agentSlug: r.agentSlug,
			// `active` gates DISPATCH and not the render, so an inactive entry
			// still carries the skill into a package. It is an attachment either
			// way, marked rather than dropped.
			inactive: !r.active,
		});
	}

	return out;
}

/* ── agent templates ─────────────────────────────────────────────────────── */

export async function listAgentTemplates(
	db: Db,
	opts: Page,
): Promise<Listed<AgentTemplateRow>> {
	const cursor = opts.cursor ? new Date(opts.cursor) : null;

	/* includes-deleted: revoked templates are shown and marked. The engagement
	   and client joins are name lookups on a row already being displayed —
	   filtering them would leave a feature agent nameless with no explanation,
	   which is worse than naming a closed engagement. */
	const rows = await db
		.select({
			id: agentTemplates.id,
			slug: agentTemplates.slug,
			name: agentTemplates.name,
			kind: agentTemplates.kind,
			team: agentTemplates.team,
			engagementId: agentTemplates.engagementId,
			runtime: agentTemplates.runtime,
			waveDefaults: agentTemplates.waveDefaults,
			identityMd: agentTemplates.identityMd,
			depthMd: agentTemplates.depthMd,
			writablePaths: agentTemplates.writablePaths,
			appendOnlyPaths: agentTemplates.appendOnlyPaths,
			readonlyPaths: agentTemplates.readonlyPaths,
			deletedAt: agentTemplates.deletedAt,
			createdAt: agentTemplates.createdAt,
			updatedAt: agentTemplates.updatedAt,
			engagementName: engagements.name,
			clientName: clients.name,
		})
		.from(agentTemplates)
		// LEFT, not inner: a horizontal template has no engagement, and an inner
		// join would silently drop every one of them.
		.leftJoin(engagements, eq(agentTemplates.engagementId, engagements.id))
		.leftJoin(clients, eq(engagements.clientId, clients.id))
		.where(cursor ? lt(agentTemplates.createdAt, cursor) : undefined)
		.orderBy(desc(agentTemplates.createdAt))
		.limit(opts.limit + 1);

	const page = rows.slice(0, opts.limit);
	const ids = page.map((r) => r.id);

	const skillRows =
		ids.length === 0
			? []
			: /* includes-deleted: a template's revoked skills are shown, marked. */
				await db
					.select({
						agentTemplateId: agentTemplateSkills.agentTemplateId,
						id: skills.id,
						slug: skills.slug,
						name: skills.name,
						type: skills.type,
						deletedAt: skills.deletedAt,
					})
					.from(agentTemplateSkills)
					.innerJoin(skills, eq(agentTemplateSkills.skillId, skills.id))
					.where(inArray(agentTemplateSkills.agentTemplateId, ids));

	const bySkill = new Map<string, AgentTemplateRow["skills"]>();
	for (const s of skillRows) {
		const list = bySkill.get(s.agentTemplateId) ?? [];
		list.push({
			id: s.id,
			slug: s.slug,
			name: s.name,
			type: s.type,
			revoked: s.deletedAt !== null,
		});
		bySkill.set(s.agentTemplateId, list);
	}

	const useRows =
		ids.length === 0
			? []
			: await db
					.select({
						agentTemplateId: rosterEntries.agentTemplateId,
						n: sql<number>`count(*)::int`,
					})
					.from(rosterEntries)
					.where(inArray(rosterEntries.agentTemplateId, ids))
					.groupBy(rosterEntries.agentTemplateId);
	const useCount = new Map(useRows.map((r) => [r.agentTemplateId, r.n]));

	const items: AgentTemplateRow[] = page.map((r) => ({
		id: r.id,
		slug: r.slug,
		name: r.name,
		kind: r.kind,
		team: r.team,
		engagementId: r.engagementId,
		engagementName: r.engagementName,
		clientName: r.clientName,
		runtime: r.runtime,
		waveDefaults: r.waveDefaults,
		identityMd: r.identityMd,
		depthMd: r.depthMd,
		writablePaths: r.writablePaths,
		appendOnlyPaths: r.appendOnlyPaths,
		readonlyPaths: r.readonlyPaths,
		skills: bySkill.get(r.id) ?? [],
		rosterUseCount: useCount.get(r.id) ?? 0,
		revokedAt: isoOrNull(r.deletedAt),
		createdAt: iso(r.createdAt),
		updatedAt: iso(r.updatedAt),
	}));

	const nextCursor =
		rows.length > opts.limit ? (items.at(-1)?.createdAt ?? null) : null;
	/* includes-deleted: the total must match a list that returns them. */
	const [t] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(agentTemplates)
		.where(sql`true`);
	return { items, total: t?.n ?? 0, nextCursor };
}

/* ── skill sources ───────────────────────────────────────────────────────── */

export async function listSkillSources(
	db: Db,
	opts: Page,
): Promise<Listed<SkillSourceRow>> {
	const cursor = opts.cursor ? new Date(opts.cursor) : null;

	/* includes-deleted: revoked sources are shown and marked. */
	const rows = await db
		.select({
			id: skillSources.id,
			name: skillSources.name,
			url: skillSources.url,
			deletedAt: skillSources.deletedAt,
			createdAt: skillSources.createdAt,
			updatedAt: skillSources.updatedAt,
		})
		.from(skillSources)
		.where(cursor ? lt(skillSources.createdAt, cursor) : undefined)
		.orderBy(desc(skillSources.createdAt))
		.limit(opts.limit + 1);

	const page = rows.slice(0, opts.limit);
	const ids = page.map((r) => r.id);

	/**
	 * SPLIT COUNTS, never one total. A source with forty skills of which thirty
	 * are revoked is a different object from one with ten live skills, and a
	 * single number renders them identically. Two grouped counts rather than two
	 * queries per row.
	 */
	const counts =
		ids.length === 0
			? []
			: /* includes-deleted: the split counts are ABOUT deleted rows. */
				await db
					.select({
						sourceId: skills.sourceId,
						live: sql<number>`count(*) filter (where ${skills.deletedAt} is null)::int`,
						revoked: sql<number>`count(*) filter (where ${skills.deletedAt} is not null)::int`,
					})
					.from(skills)
					.where(inArray(skills.sourceId, ids))
					.groupBy(skills.sourceId);
	const byId = new Map(counts.map((c) => [c.sourceId, c]));

	const items: SkillSourceRow[] = page.map((r) => ({
		id: r.id,
		name: r.name,
		url: r.url,
		liveSkillCount: byId.get(r.id)?.live ?? 0,
		revokedSkillCount: byId.get(r.id)?.revoked ?? 0,
		revokedAt: isoOrNull(r.deletedAt),
		createdAt: iso(r.createdAt),
		updatedAt: iso(r.updatedAt),
	}));

	const nextCursor =
		rows.length > opts.limit ? (items.at(-1)?.createdAt ?? null) : null;
	/* includes-deleted: the total must match a list that returns them. */
	const [t] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(skillSources)
		.where(sql`true`);
	return { items, total: t?.n ?? 0, nextCursor };
}
