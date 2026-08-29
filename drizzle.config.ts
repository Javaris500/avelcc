import { defineConfig } from "drizzle-kit";

/**
 * MIGRATIONS USE THE DIRECT STRING, NOT THE POOLED ONE.
 *
 * STACK-AND-RESOURCES flags this twice — at :102 and again at :192 — because
 * drizzle-kit fails confusingly against the pooler rather than saying "wrong
 * connection string". The app uses DATABASE_URL (pooled, for serverless
 * connections); only this file uses DATABASE_URL_DIRECT.
 *
 * If you are debugging a migration that hangs or errors incomprehensibly, check
 * this line first.
 */
function mustEnv(name: string): string {
	const v = process.env[name];
	if (!v) throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`);
	return v;
}

export default defineConfig({
	dialect: "postgresql",
	schema: "./src/modules/db/schema.ts",
	out: "./drizzle",
	dbCredentials: {
		// Throw rather than defaulting to "". An empty string produces an opaque
		// drizzle-kit parse error, which is the same confusing failure this
		// file's comment exists to warn about.
		url: mustEnv("DATABASE_URL_DIRECT"),
	},
	strict: true,
	verbose: true,
});
