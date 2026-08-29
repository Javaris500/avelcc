import { createFileRoute, redirect } from "@tanstack/react-router";

/** ROUTES.md: `/` redirects to `/missions`. */
export const Route = createFileRoute("/")({
	beforeLoad: () => {
		throw redirect({ to: "/missions" });
	},
});
