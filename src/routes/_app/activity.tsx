import { createFileRoute } from "@tanstack/react-router";
import { Activity } from "lucide-react";

import { PageEmpty } from "#/ui/page-empty";

export const Route = createFileRoute("/_app/activity")({
	staticData: { device: "capture" as const },
	component: Page,
});

function Page() {
	return (
		<PageEmpty
			body="Append-only. Filter by action domain, entity type, mission and date. Both vocabularies are closed, so the filters are enums rather than free text over a string column."
			icon={Activity}
			title="No activity yet"
		/>
	);
}
