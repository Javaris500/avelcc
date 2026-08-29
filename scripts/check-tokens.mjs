#!/usr/bin/env node
/**
 * Fails on a literal where a token belongs.
 *
 * Turns token discipline from a convention into a mechanism — the same move as
 * requiring all four Surface states and a data-testid at the type level.
 *
 * Scoped to the three things the design system actually owns: COLOUR, TYPE
 * SIZE and RADIUS. Arbitrary values for layout (h-[0.9em], max-w-[18ch],
 * ring-[3px]) are legitimate escape hatches and are not flagged — the rule is
 * "a className may adjust layout, never appearance".
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src/components", "src/routes"];
const RULES = [
	[/#[0-9a-fA-F]{6}\b/, "hex colour — use a token"],
	[/\b(rgb|rgba|hsl|hsla)\(/, "literal colour function — use a token"],
	[/\btext-\[[^\]]*\d+(px|rem|em)[^\]]*\]/, "arbitrary font size — use the type scale"],
	[/\brounded-\[(?!var\()[^\]]+\]/, "arbitrary radius — use the radius scale"],
];

function walk(dir) {
	return readdirSync(dir).flatMap((f) => {
		const p = join(dir, f);
		if (statSync(p).isDirectory()) return walk(p);
		// Tests and specs assert painted values, so the literal IS the assertion.
		if (/\.(test|e2e\.spec)\.tsx?$/.test(p)) return [];
		return p.endsWith(".tsx") || p.endsWith(".ts") ? [p] : [];
	});
}

let failures = 0;
for (const root of ROOTS) {
	for (const file of walk(root)) {
		const lines = readFileSync(file, "utf8").split("\n");
		let inBlockComment = false;
		lines.forEach((line, i) => {
			// Comments explain the tokens and legitimately quote values.
			if (line.includes("/*")) inBlockComment = true;
			const isComment = inBlockComment || line.trim().startsWith("//") || line.trim().startsWith("*");
			if (line.includes("*/")) inBlockComment = false;
			if (isComment) return;
			for (const [re, why] of RULES) {
				const m = line.match(re);
				if (m) {
					console.error(`${file}:${i + 1}  ${m[0]}  — ${why}`);
					failures++;
				}
			}
		});
	}
}

if (failures) {
	console.error(`\n${failures} literal${failures === 1 ? "" : "s"} where a token belongs.`);
	process.exit(1);
}
console.log("tokens: no literals in components or routes");
