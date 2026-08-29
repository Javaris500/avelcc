import { createFileRoute } from "@tanstack/react-router";
import { Layers } from "lucide-react";

import { PageEmpty } from "#/components/ui/page-empty";

export const Route = createFileRoute("/_app/catalog/sources")({
	staticData: { device: "construction" as const },
	component: Page,
});

function Page() {
	return (
		<PageEmpty
			body="Where skills are imported from. The catalog is populated in-app rather than seeded."
			blocked="Blocked: no skillSource procedures exist. Something must write this catalog before it can list anything."
			icon={Layers}
			title="No skill sources"
		/>
	);
}
