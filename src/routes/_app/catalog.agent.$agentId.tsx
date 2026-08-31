import { createFileRoute } from "@tanstack/react-router";

import { AgentTemplatePage } from "#/modules/catalog/agent-page";

export const Route = createFileRoute("/_app/catalog/agent/$agentId")({
	staticData: { device: "construction" as const },
	component: Page,
});

function Page() {
	const { agentId } = Route.useParams();
	return <AgentTemplatePage agentId={agentId} />;
}
