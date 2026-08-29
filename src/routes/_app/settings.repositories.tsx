import { createFileRoute } from "@tanstack/react-router";
import { GitBranch } from "lucide-react";

import { PageEmpty } from "#/components/ui/page-empty";

export const Route = createFileRoute("/_app/settings/repositories")({
	staticData: { device: "construction" as const },
	component: Page,
});

function Page() {
	return (
		<PageEmpty
			body="This empty state is the correct state. A repository with no policy row is treated as no-direct-push, so safe behaviour needs no setup and only the permissive behaviour is opt-in."
			icon={GitBranch}
			title="No repository policies"
		/>
	);
}
