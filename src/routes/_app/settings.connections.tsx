import { createFileRoute } from "@tanstack/react-router";
import { Plug } from "lucide-react";

import { PageEmpty } from "#/components/ui/page-empty";

export const Route = createFileRoute("/_app/settings/connections")({
	staticData: { device: "construction" as const },
	component: Page,
});

function Page() {
	return (
		<PageEmpty
			body="Scope, status, rotation and revocation. The token itself is never displayed — credential_ref names where it lives. Revocation is a step in engagement close, so it is one click with a confirmation rather than something buried in an edit form."
			icon={Plug}
			title="No connections"
		/>
	);
}
