import { createFileRoute } from "@tanstack/react-router";
import { Bookmark } from "lucide-react";

import { PageEmpty } from "#/components/ui/page-empty";

export const Route = createFileRoute("/_app/presets")({
	staticData: { device: "construction" as const },
	component: Page,
});

function Page() {
	return (
		<PageEmpty
			body="A preset is a roster you reuse. Applying one materialises RosterEntries — copy-then-edit, so the preset holds no mission state and editing a roster never mutates the preset it came from."
			blocked="Blocked: RosterPreset is an entity and Playbook.default_preset_id references it, but the contract has no preset route group."
			icon={Bookmark}
			title="No saved squads"
		/>
	);
}
