import { createFileRoute } from "@tanstack/react-router";

import { SkillSourceCatalog } from "#/modules/catalog/sources-view";

export const Route = createFileRoute("/_app/catalog/sources")({
	staticData: { device: "construction" as const },
	component: SkillSourceCatalog,
});
