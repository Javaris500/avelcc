import { createFileRoute } from "@tanstack/react-router";
import { Inbox } from "lucide-react";

import { PageEmpty } from "#/components/ui/page-empty";

export const Route = createFileRoute("/_app/intake")({
	staticData: { device: "capture" as const },
	component: Page,
});

function Page() {
	return (
		<PageEmpty
			body="Canon proposes a structured brief and a list of open questions. Nothing is executable until you approve it, and the raw source sits alongside the proposal so you can check the interpretation against what was actually said."
			icon={Inbox}
			title="Nothing awaiting review"
		/>
	);
}
