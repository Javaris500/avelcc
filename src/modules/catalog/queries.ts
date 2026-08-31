import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import type { z } from "zod";

import {
	type AgentTemplateListResponse,
	agentTemplateListResponse,
	type SkillListResponse,
	type SkillSourceListResponse,
	skillListResponse,
	skillSourceListResponse,
} from "#/contract/catalog";
import {
	presentScreenError,
	type ScreenError,
} from "#/modules/errors/screenError";

/**
 * THE READ PATH FOR THE CATALOG, AND THE ONE THING IT HAS TO BE HONEST ABOUT.
 *
 * ALL THREE ENDPOINTS EXIST AS OF `a0ef4dd` and answer 200 with JSON, verified
 * against the running app rather than inferred from the commit. `[built]` This
 * header described them as absent until then, and the earlier version of that
 * paragraph is worth keeping in one line because it is why this file has the
 * shape it does: the screens were built against endpoints that did not exist,
 * and the choice made then was to call the real paths and render a designed
 * "not built" state rather than to hold a few plausible rows in a constant.
 *
 * That choice is what made this switch free. Nothing in this module changed
 * when the routes landed except which module the shapes are imported from.
 * A fixture would have had to be found and removed, and CLAUDE.md's opening
 * line is about exactly the screen that looks finished while it is not.
 *
 * ENDPOINT_ABSENT IS STILL DETECTED, AND IS NOT DEAD CODE. It is now the
 * treatment for a route that BREAKS rather than one nobody has written, which
 * is the same fact from the operator's side: nothing answered. CLAUDE.md rule
 * 1 — "If a tool fails, say the tool failed. Do not interpret an error as a
 * result." A missing API route in TanStack Start does not reliably answer 404;
 * an unmatched path can fall through to the SPA document and answer 200 with
 * HTML. Both are read as the same code, and neither is read as "the catalog is
 * empty", because an empty catalog and an unreachable one look identical on
 * screen unless something distinguishes them here.
 *
 * THAT DISTINCTION IS NOW LIVE. `skills` and `skill_sources` hold zero rows,
 * so those two screens render a true EmptyState — there is nothing here yet —
 * while a broken route would still render "not built". Until `a0ef4dd` only
 * one of those two states had ever been seen.
 */

/**
 * CLIENT-ONLY FAILURE LABELS, the same device `missions.index.tsx` uses and for
 * the same reason: these failures arrive with no envelope to carry a code.
 * Neither crosses the wire and nothing switches on them but this module.
 */
const SHAPE_MISMATCH = "SHAPE_MISMATCH";
const ENDPOINT_ABSENT = "ENDPOINT_ABSENT";
const httpFailure = (status: number) => `HTTP_${status}`;

async function readList<T extends z.ZodTypeAny>(
	path: string,
	schema: T,
): Promise<z.infer<T>> {
	const res = await fetch(path);

	// Checked BEFORE the body is read. A route that is missing or broken answers
	// with the SPA document, and `res.json()` on HTML throws a parse error that
	// would otherwise be reported as a transport failure the operator could
	// retry forever.
	const contentType = res.headers.get("content-type") ?? "";
	if (res.status === 404 || !contentType.includes("application/json")) {
		throw new Error(ENDPOINT_ABSENT);
	}

	const body = await res.json().catch(() => null);

	// Codes are the contract; messages change freely. Nothing here parses one.
	if (body?.success === false) throw new Error(body.error.code);
	if (!res.ok || body === null) throw new Error(httpFailure(res.status));

	const parsed = schema.safeParse(body);
	if (!parsed.success) throw new Error(SHAPE_MISMATCH);
	return parsed.data;
}

/**
 * WHAT EACH FAILURE MEANS ON A CATALOG SCREEN.
 *
 * Written per-module rather than per-screen because all three catalog screens
 * fail in exactly the same ways, and three copies of this would drift. The
 * `noun` is the only part that differs.
 *
 * Every body says what was NOT done as well as what was. These screens only
 * read, so nothing was written on any failure, and an operator who does not
 * know that has to assume the worst.
 */
export function describeCatalogFailure(
	code: string,
	noun: string,
): { title: string; body: string; canRetry: boolean } {
	const title = `The ${noun} could not be read.`;
	switch (code) {
		case ENDPOINT_ABSENT:
			return {
				title: `The ${noun} is not connected yet.`,
				body: `This screen is built and the endpoint behind it is not. Nothing answered the request, so there is nothing to show and nothing is wrong with your data. The screen fills in on its own once the route exists.`,
				// The route will not appear because it was asked for twice.
				canRetry: false,
			};
		case "FORBIDDEN":
			return {
				title,
				body: `This session is not permitted to read the ${noun}. Nothing was loaded.`,
				canRetry: false,
			};
		case SHAPE_MISMATCH:
			return {
				title,
				body: `The endpoint answered, but the body did not match the shape this screen expects. The screen and the route have drifted apart, and rendering it anyway would be a guess.`,
				// Deterministic: the same request produces the same mismatch.
				canRetry: false,
			};
		default:
			return {
				title,
				body: `The request did not complete, so nothing was loaded. This screen only reads, so nothing was written either.`,
				// No envelope arrived, so this is transport and genuinely retryable.
				canRetry: true,
			};
	}
}

/** True where the failure is "nobody built this yet" rather than a fault. */
export function isEndpointAbsent(error: Error): boolean {
	return error.message === ENDPOINT_ABSENT;
}

export function presentCatalogError(error: Error, noun: string): ScreenError {
	return presentScreenError(
		error.message,
		describeCatalogFailure(error.message, noun),
	);
}

/* ── the three reads ─────────────────────────────────────────────────────── */

/**
 * PATHS ARE A PROPOSAL. `/api/clients` and `/api/missions` are the established
 * shape, so these follow it. Whoever builds the routes owns the final names; if
 * they differ, this constant is the only place that changes.
 */
export const CATALOG_ENDPOINTS = {
	skills: "/api/skills",
	agentTemplates: "/api/agent-templates",
	sources: "/api/skill-sources",
} as const;

// Fail visibly and immediately, as the mission list does. The error state
// carries its own retry, so silent backoffs only delay telling the operator.
const QUERY = { retry: false } as const;

export function useSkills(): UseQueryResult<SkillListResponse, Error> {
	return useQuery({
		...QUERY,
		queryKey: ["catalog", "skills"],
		queryFn: () => readList(CATALOG_ENDPOINTS.skills, skillListResponse),
	});
}

export function useAgentTemplates(): UseQueryResult<
	AgentTemplateListResponse,
	Error
> {
	return useQuery({
		...QUERY,
		queryKey: ["catalog", "agent-templates"],
		queryFn: () =>
			readList(CATALOG_ENDPOINTS.agentTemplates, agentTemplateListResponse),
	});
}

export function useSkillSources(): UseQueryResult<
	SkillSourceListResponse,
	Error
> {
	return useQuery({
		...QUERY,
		queryKey: ["catalog", "sources"],
		queryFn: () => readList(CATALOG_ENDPOINTS.sources, skillSourceListResponse),
	});
}
