import { createFileRoute } from "@tanstack/react-router";
import { Library } from "lucide-react";

import { PageEmpty } from "#/ui/page-empty";

export const Route = createFileRoute("/_app/catalog/skills")({
	staticData: { device: "construction" as const },
	component: Page,
});

function Page() {
	return (
		<PageEmpty
			body="Skills carry a type: knowledge or capability. Capability is labelled declarative in the UI because it names a tool grant, it does not enforce one. A badge implying enforcement would be the product lying about itself."
			icon={Library}
			title="No skills yet"
		/>
	);
}
