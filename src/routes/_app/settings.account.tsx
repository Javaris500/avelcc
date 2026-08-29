import { createFileRoute } from "@tanstack/react-router";
import { UserCog } from "lucide-react";

import { PageEmpty } from "#/components/ui/page-empty";

export const Route = createFileRoute("/_app/settings/account")({
	staticData: { device: "capture" as const },
	component: Page,
});

function Page() {
	return (
		<PageEmpty
			body="Session and sign out. There is no auth provider yet: the session gate is real and refuses hard, but the identity behind it is a stub."
			icon={UserCog}
			title="Account"
		/>
	);
}
