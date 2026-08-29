import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "#/modules/db/schema";

/**
 * THE RUNTIME DATABASE CLIENT. Server-only.
 *
 * The app uses DATABASE_URL — the POOLED string — because route handlers run in
 * short-lived serverless invocations and the pooler is what survives that.
 * drizzle.config.ts uses DATABASE_URL_DIRECT instead, and only it: the pooler
 * makes drizzle-kit fail confusingly. STACK-AND-RESOURCES flags the split twice.
 *
 * neon-http, not the websocket Pool: every query here is a one-shot request,
 * which is the mode neon() over HTTP is built for. A path that needs a real
 * multi-statement transaction — applyPreset materializing a squad is the first
 * one coming — will import the Pool driver separately rather than promote this
 * one, so the common case stays on the connectionless path.
 *
 * NEVER import this from a file that reaches the client bundle. It reads
 * process.env and holds the connection; a component that imports it ships the
 * server's database URL to the browser. The route handlers under src/routes/api
 * are the only callers.
 */

function mustEnv(name: string): string {
	const v = process.env[name];
	if (!v) {
		throw new Error(
			`${name} is not set. Copy .env.example to .env and fill it in.`,
		);
	}
	return v;
}

export const db = drizzle(neon(mustEnv("DATABASE_URL")), { schema });

export type Db = typeof db;
