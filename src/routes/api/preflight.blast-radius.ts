import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { createFileRoute } from "@tanstack/react-router";

import { computeBlastRadius } from "#/modules/export/blast/computeBlastRadius";
import { DEFAULT_ALLOWED_PATH_PREFIXES } from "#/modules/export/blast/types";
import { readTreeOrEmpty } from "#/modules/export/gateway/readTree";
import { GatewayError } from "#/modules/export/gateway/types";
import { gitBlobSha } from "#/modules/export/git/gitBlobSha";

/**
 * The pre-flight blast radius. SERVER-SIDE, and that is not incidental.
 *
 * STACK-AND-RESOURCES gives three reasons the Command Center needs a server at
 * all, and the first is that GitHub credential resolution must happen off the
 * client or the token leaks. A public repository needs no token TODAY, so this
 * route works without one — but putting the call here from the start means
 * adding a credential later changes an environment variable rather than an
 * architecture. STACK calls that the one-way door.
 *
 * The rendered side is the golden fixture, read from disk. Real bytes, hashed
 * by our own gitBlobSha. Nothing on this screen is invented.
 */

const FIXTURE = "fixtures/golden/slice-1";

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((f) => {
		const p = join(dir, f);
		return statSync(p).isDirectory() ? walk(p) : [p];
	});
}

function renderedFiles() {
	return walk(FIXTURE).map((abs) => {
		const bytes = new Uint8Array(readFileSync(abs));
		/**
		 * SEPARATORS NORMALISED HERE, and without it every file is a violation.
		 *
		 * `relative()` returns the platform's separator, so on Windows this
		 * produced `conventions\layering.md`. `isNormalized` then correctly
		 * refused it — BLAST-RADIUS requires POSIX separators and says "a path
		 * that changes under normalization is itself a violation" — so all 20
		 * files came back as PATH_TRAVERSAL and the pre-flight screen showed a
		 * package that could never be delivered.
		 *
		 * The blast radius was RIGHT. A backslash path is not normalized, and
		 * refusing it is the guard working. The defect was feeding it one.
		 *
		 * Invisible on Linux, where sep is already "/". Same class as the
		 * `git hash-object` separator bug in the export tests, and
		 * render.test.ts already does exactly this when loading the golden
		 * package.
		 */
		const rel = relative(FIXTURE, abs).split(sep).join("/");
		return { path: rel, bytes, blobSha: gitBlobSha(bytes) };
	});
}

export const Route = createFileRoute("/api/preflight/blast-radius")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url);
				const owner = url.searchParams.get("owner") ?? "octocat";
				const repo = url.searchParams.get("repo") ?? "Spoon-Knife";
				const ref = url.searchParams.get("ref") ?? "main";

				try {
					const remote = await readTreeOrEmpty({
						owner,
						repo,
						ref,
						// Absent is legal. Present later without touching this file.
						token: process.env.GITHUB_TOKEN,
					});

					const rendered = renderedFiles();
					const core = computeBlastRadius(rendered, remote, {
						allowedPathPrefixes: DEFAULT_ALLOWED_PATH_PREFIXES,
						declaredWritablePaths: ["**"],
					});

					// The envelope the pure function deliberately does NOT produce:
					// computedAt is a clock, and computeBlastRadius is forbidden one.
					// The caller stamps it. That split is why the core stays testable.
					return Response.json({
						success: true,
						data: {
							...core,
							computedAt: new Date().toISOString(),
							baseRef: ref,
							baseCommitSha: remote.commitSha || null,
							target: { owner, repo, branch: ref },
						},
					});
				} catch (e) {
					const code = e instanceof GatewayError ? e.code : "EXTERNAL_GITHUB";
					const message = e instanceof GatewayError ? e.detail : String(e);
					// The contract's error envelope. The screen's error map is keyed on
					// `code`; `message` is never parsed.
					return Response.json(
						{ success: false, error: { code, message } },
						{ status: 502 },
					);
				}
			},
		},
	},
});
