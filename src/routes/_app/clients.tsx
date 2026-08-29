import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";

import { PageEmpty } from "#/components/ui/page-empty";

export const Route = createFileRoute("/_app/clients")({
	staticData: { device: "construction" as const },
	component: Page,
});

function Page() {
	return (
		<PageEmpty
			body="Every engagement starts here. Onboarding is six steps: client, engagement, repository, cut derivation, policy, then Canon proposes a brief from your call notes."
			blocked="Blocked: ROUTES.md lists no client, engagement or intake route groups in the contract. Three entities, no procedures."
			icon={Users}
			title="No clients yet"
		/>
	);
}
