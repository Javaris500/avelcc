import { createFileRoute, useNavigate } from "@tanstack/react-router";

import {
	SkillsCatalog,
	type SkillsSearch,
} from "#/modules/catalog/skills-view";

/**
 * SELECTION LIVES IN THE URL, so a skill can be linked and survives a reload.
 *
 * `validateSearch` is hand-rolled rather than a zod schema because it must never
 * throw: a stale or hand-edited query string should open the default skill, not
 * an error boundary. An unrecognised filter value falls back to `all` for the
 * same reason.
 */
const STATES = ["all", "live", "revoked"] as const;
const TYPES = ["all", "knowledge", "capability"] as const;

function one<T extends string>(
	allowed: readonly T[],
	value: unknown,
): T | undefined {
	return typeof value === "string" &&
		(allowed as readonly string[]).includes(value)
		? (value as T)
		: undefined;
}

export const Route = createFileRoute("/_app/catalog/skills")({
	staticData: { device: "construction" as const },
	validateSearch: (search: Record<string, unknown>): SkillsSearch => ({
		skill: typeof search.skill === "string" ? search.skill : undefined,
		state: one(STATES, search.state),
		type: one(TYPES, search.type),
	}),
	component: Page,
});

function Page() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	return (
		<SkillsCatalog
			onSearch={(next) =>
				// `replace`, so filtering and reading do not fill the back stack with
				// every row the operator glanced at.
				void navigate({ replace: true, search: next })
			}
			search={search}
		/>
	);
}
