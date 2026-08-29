import { createFileRoute } from "@tanstack/react-router";
import { BookMarked } from "lucide-react";

import { PageEmpty } from "#/components/ui/page-empty";

export const Route = createFileRoute("/_app/playbooks")({
	staticData: { device: "construction" as const },
	component: Page,
});

function Page() {
	return (
		<PageEmpty
			body="Process per mission type: waves, gates, deliverable, required fields. This screen edits the rules that constrain you, so every edit shows its consequence — marking a gate warn changes what can ship."
			icon={BookMarked}
			title="No playbooks"
		/>
	);
}
