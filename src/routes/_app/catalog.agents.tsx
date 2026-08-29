import { createFileRoute } from "@tanstack/react-router";
import { Boxes } from "lucide-react";

import { PageEmpty } from "#/components/ui/page-empty";

export const Route = createFileRoute("/_app/catalog/agents")({
	staticData: { device: "construction" as const },
	component: Page,
});

function Page() {
	return (
		<PageEmpty
			body="The library each mission assembles its roster from. identity_md and depth_md are capped at 800 tokens by a Zod refinement, so the editor shows the count live rather than failing at save."
			icon={Boxes}
			title="No agent templates"
		/>
	);
}
