import { createFileRoute } from "@tanstack/react-router";

import { SkillsCatalog } from "#/modules/catalog/skills-view";

/**
 * The route is a mount point and nothing else. The screen lives in
 * `src/modules/catalog/` so that the shape of it is reviewable without reading
 * a router file, and so the three catalog screens sit next to each other.
 *
 * `device: construction` is unchanged. A catalog with markdown bodies, path
 * globs and a wide table is not a phone screen.
 */
export const Route = createFileRoute("/_app/catalog/skills")({
	staticData: { device: "construction" as const },
	component: SkillsCatalog,
});
