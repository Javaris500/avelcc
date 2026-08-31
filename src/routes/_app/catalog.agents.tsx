import { createFileRoute, useNavigate } from "@tanstack/react-router";

import {
	type AgentsSearch,
	AgentTemplateCatalog,
} from "#/modules/catalog/agents-view";

const RUNTIMES = ["all", "model", "human", "code"] as const;
const KINDS = ["all", "horizontal", "feature"] as const;
const STATES = ["all", "live", "revoked"] as const;
const ORDERS = ["added", "name", "scope", "skills"] as const;

function one<T extends string>(
	allowed: readonly T[],
	value: unknown,
): T | undefined {
	return typeof value === "string" &&
		(allowed as readonly string[]).includes(value)
		? (value as T)
		: undefined;
}

/** See catalog.skills.tsx for why this never throws. */
export const Route = createFileRoute("/_app/catalog/agents")({
	staticData: { device: "construction" as const },
	validateSearch: (search: Record<string, unknown>): AgentsSearch => ({
		runtime: one(RUNTIMES, search.runtime),
		kind: one(KINDS, search.kind),
		state: one(STATES, search.state),
		order: one(ORDERS, search.order),
	}),
	component: Page,
});

function Page() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	return (
		<AgentTemplateCatalog
			onSearch={(next) => void navigate({ replace: true, search: next })}
			search={search}
		/>
	);
}
