import { createFileRoute } from "@tanstack/react-router";
import { Building2 } from "lucide-react";

import { PageEmpty } from "#/ui/page-empty";

/**
 * The third pane with nothing selected.
 *
 * This route used to be the clients list. The operator's three-pane ruling
 * moved the table into the layout at `clients.tsx`, which renders under both
 * `/clients` and `/clients/:id`, so what is left at this address is the detail
 * pane before a client has been picked.
 *
 * IT IS A REAL STATE, NOT A BLANK. `/clients` is where the nav sends every
 * operator, so this is the first thing seen on arrival — and the pane beside it
 * is already showing the table, which means the instruction is genuinely "pick
 * one" rather than "there is nothing here". An empty pane with no words would
 * read as a screen that failed to load.
 */
export const Route = createFileRoute("/_app/clients/")({
	staticData: { device: "construction" as const },
	component: NoClientSelected,
});

function NoClientSelected() {
	return (
		<PageEmpty
			body="Pick one from the list to see its requests, engagements, missions and everything that has been delivered."
			icon={Building2}
			title="No client selected"
		/>
	);
}
