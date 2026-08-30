import { createFileRoute } from "@tanstack/react-router";

import { AgentTemplateCatalog } from "#/modules/catalog/agents-view";

export const Route = createFileRoute("/_app/catalog/agents")({
	staticData: { device: "construction" as const },
	component: AgentTemplateCatalog,
});
