import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * EVERY BACKTICKED IDENTIFIER IN A COMMENT MUST RESOLVE SOMEWHERE IN THE CODE.
 *
 * Four comments in one day named something that was not there. The `min-h` a
 * comment promised and the file never had. A seam comment reading "NEUTRAL
 * RATHER THAN ACCENT, deliberately" directly above `var(--color-accent)`.
 * `export/service.ts` stating twice that the render assembler did not exist and
 * that its absence was why delivery could not run, while `assembleRenderMission`
 * sat built and unwired. And `assertNever`'s own docstring instructing the
 * reader to call it in a default branch, which two sessions then tried to do and
 * which would have thrown inside the error path.
 *
 * All four were SPECIFIC, well-phrased and load-bearing. Specificity is what
 * made them survive review — a vague comment gets checked, a precise one gets
 * believed. `SURPRISES.md` records the family: a comment that instructs, never
 * checked against what it instructs about.
 *
 * WHAT THIS CATCHES AND WHAT IT DOES NOT, stated plainly so nobody mistakes it
 * for full coverage. It catches a comment naming a SYMBOL. It cannot catch a
 * comment making a claim about INTENT. It would have caught the `min-h` and the
 * assembler; it would NOT have caught "NEUTRAL RATHER THAN ACCENT" or the
 * `assertNever` docstring, because those name nothing that has to exist. Half
 * the family, mechanically, forever — against four for four missed by people.
 *
 * THE SHARPER LIMIT, found the day this was written. A comment in
 * `scaffold.tsx` ended "see `SectionRailShell`" and that symbol was the LAST
 * LINE of a four-sentence argument whose every sentence described the deleted
 * rail. Renaming the symbol would have satisfied this check and left the lie
 * intact. So this does not verify comments. IT VERIFIES THE LAST CHECKABLE
 * TOKEN IN A COMMENT AND INFERS THE REST. A dangling symbol is a SYMPTOM of a
 * rotted comment, not the rot — it is just the symptom a regex can see.
 *
 * WORSE, AND UNREACHABLE BY ANY CHECK: in that case the CODE WAS STILL RIGHT.
 * The effect survived because it had a second reason nobody had written down.
 * A comment can be false while the code it describes is correct, and nothing
 * misbehaves, so nothing anywhere will catch it. The defence there is not a
 * test — it is writing the EVIDENCE into the comment, so a later reader can
 * tell which claim the comment was actually making.
 *
 * WHY BACKTICKS. Prose names things loosely and should. A backtick is the
 * author asserting "this is code, and it exists". That is a claim, so it is
 * checkable, and this is the check.
 *
 * WHAT IT ACTUALLY BOUGHT, honestly, on the run that introduced it: ONE real
 * dangling reference across 214 files, at a cost of SIXTEEN exemptions each
 * needing about thirty seconds of judgement. It was argued for on the claim
 * that it was red on four symbols deleted that evening; opening the files
 * showed three of those four were good comments naming something deliberately
 * absent. That claim was itself an instance of the family this file exists to
 * catch — specific, confident, unverified, and persuasive because it was
 * specific — which is why the honest number is recorded here rather than the
 * flattering one.
 *
 * It is still worth it, and rule 5 is the reason: deleting something means
 * grepping for its name across everything that mentions it. This is that grep,
 * run automatically, forever, on a codebase where nobody remembers to.
 *
 * THE CONVENTION THIS FILE IS MOVING TOWARDS, ruled but not yet applied:
 * BACKTICKS MEAN "THIS EXISTS". Something deliberately absent — a rejected
 * design, a deleted component, a field a response does not carry — gets named
 * WITHOUT them. Applying it retroactively means editing comment prose across
 * files other sessions are working in, which is how a night of swept commits
 * started, so the existing entries age out instead. Write new comments to the
 * convention and `ALLOW_SITE` stops growing.
 */

const ROOT = path.resolve("src");

/** Block and line comments. JSX `{/* … *​/}` falls out of the block branch. */
const COMMENT = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

/** A backticked span holding exactly one bare identifier and nothing else. */
const BARE_IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * SNAKE_CASE IS EXCLUDED STRUCTURALLY, NOT BY LIST. Database identifiers —
 * `created_at`, `data_type`, `exports_snapshot_all_or_none` — are named
 * constantly in comments and legitimately live in SQL, migrations and Postgres
 * catalogs rather than in TypeScript. Listing them one by one would be a list
 * that grows with the schema forever. The rule is mechanical and needs no
 * maintenance.
 */
const isSqlIdentifier = (s: string) => s.includes("_") && s === s.toLowerCase();

/**
 * Identifiers that legitimately do not resolve, keyed `<file>::<symbol>`, each
 * with the reason it is here. An entry without a reason is a TODO wearing a
 * disguise.
 *
 * BOTH DIRECTIONS ARE ASSERTED. An entry that starts resolving fails this
 * suite, so the list cannot quietly accumulate dead weight the way the thing it
 * guards against does. Same discipline as `APPEND_ONLY_TABLES`.
 *
 * THE GROWING CATEGORY IS HISTORY, and it is the one to watch. Four entries
 * below name something deliberately absent — a rejected design, a deleted
 * component, a field the response does not carry. Those are GOOD comments and
 * the check cannot tell them from a dangling reference, because the difference
 * is intent. If this category outgrows the others, the fix is a convention
 * rather than a longer list: backticks mean "exists", and something deliberately
 * absent gets named without them.
 */
/**
 * NEVER A SYMBOL, ANYWHERE. The exemption is a property of the NAME, not of
 * the place it is written, so these are keyed by symbol and hold at every site.
 */
const ALLOW_SYMBOL = new Map<string, string>([
	[
		"innerText",
		"A DOM property, named in wordmark.tsx to report what it RETURNED when the mark was a flex container. Describing observed platform behaviour, not calling it.",
	],
	[
		"BodyInit",
		"lib.dom type. Naming it explains what Response accepts; declaring it would redeclare the platform.",
	],
	["ai", "The npm package ai, not a local symbol."],
	["a0ef4dd", "A commit sha, cited as evidence for when a behaviour changed."],
	[
		"ch",
		"A CSS unit, the width of the zero glyph, which is the point of every comment it appears in.",
	],
	["lh", "A CSS unit, line-height relative."],
	["stretch", "A CSS value for align-items."],
	[
		"deployer",
		"An example slug VALUE, showing why two horizontal templates would collide.",
	],
	[
		"History",
		"A planned nav destination. NAV marks it built:false; the comment documents what is deliberately absent.",
	],
	["Settings", "A planned nav destination, built:false."],
	[
		"Timeline",
		"A section the client page will grow. Named so the next author does not invent a second name.",
	],
]);

/**
 * LEGITIMATE HERE, NOT NECESSARILY ELSEWHERE. Keyed `<file>::<symbol>`,
 * because the same name can be honest in one comment and dangling in another.
 *
 * SectionRailShell is the proof, and the reason this list is site-keyed rather
 * than symbol-keyed. In ONE file it appears twice: once recording that the
 * component WAS here and is gone, which is a good comment, and once as "see
 * SectionRailShell", which sends a reader to something that does not exist. A
 * symbol-level exemption would have silently covered both.
 *
 * THIS IS THE CATEGORY THAT GROWS. Every entry names something deliberately
 * absent: a rejected design, a deleted component, a field a response does not
 * carry. The check cannot tell those from a dangling reference, because the
 * difference is intent. If this list outgrows the other, the fix is a
 * convention rather than more entries: backticks mean "this exists", and
 * something deliberately absent gets named without them.
 *
 * THE FIRST ENTRY TO BE RETIRED WENT BY THE SECOND DEATH-MODE, NOT THE
 * FIRST. `scaffold.tsx` was deleted in the swap to the real SectionCard, so
 * its exemption could never match a comment again while its symbol still
 * resolved nowhere. The entry read PERMANENT and it was, right up until the
 * file stopped existing.
 */
const ALLOW_SITE = new Map<string, string>([
	[
		"routes/api/engagements.$id.ts::closedAt",
		"The comment states the response carries NO startedAt or closedAt. Naming the absent field is the content of the sentence.",
	],
	[
		"ui/heading.tsx::headingLevel",
		"A REJECTED design. The comment explains what a headingLevel prop would have done and why it was not built. Removing the name removes the argument.",
	],
	[
		"modules/client/ui/status.ts::blockedTone",
		"Renamed to clientBlockedTone and missionBlockedTone. The comment records that both call sites once reached for one function, which is why the split exists.",
	],
	[
		"contract/roster.ts::coherenceBlock",
		"Deleted from this file; the real definition is contract/shared/coherence.ts. The note names what was removed so it is not re-invented here.",
	],
	[
		"contract/roster.ts::coherenceResult",
		"Deleted from this file. See coherenceBlock above.",
	],
]);

/**
 * Symbols asserted to RESOLVE. A negative control: if the comment stripper or
 * the identifier regex breaks, every symbol stops resolving and the suite would
 * otherwise report a spectacular, entirely false result.
 *
 * This is not hypothetical. The first prototype of this check reported 415
 * misses out of 415 identifiers — a 100% failure rate — because a backslash
 * level was eaten passing the script through a shell, so `\b` became a
 * BACKSPACE character and every regex tested for a control code. The number
 * looked like a catastrophic finding about the codebase. It was a bug in the
 * instrument.
 */
const CONTROLS = ["createExport", "assertNever", "clientBlockedTone"];

/**
 * THIS FILE EXCLUDES ITSELF, and it did not at first.
 *
 * `ALLOW` holds every exempted symbol as a STRING LITERAL, which is code, not a
 * comment. So the corpus included the allowlist, every exempted symbol resolved
 * against its own exemption, and the both-directions check reported all sixteen
 * entries as dead weight to be removed. Following that would have deleted the
 * allowlist and turned the suite red on sixteen legitimate comments.
 *
 * A checker that reads the tree it lives in has to leave itself out of it.
 */
const SELF = path.join(ROOT, "commentSymbols.test.ts");

function sourceFiles(): string[] {
	const out: string[] = [];
	const walk = (dir: string) => {
		for (const e of readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, e.name);
			if (e.isDirectory()) walk(full);
			else if (/\.(ts|tsx)$/.test(e.name) && full !== SELF) out.push(full);
		}
	};
	walk(ROOT);
	return out;
}

const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");

const files = sourceFiles();
const sources = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));

/** All code with comments removed, so a comment cannot satisfy itself. */
const code = files
	.map((f) => (sources.get(f) as string).replace(COMMENT, " "))
	.join("\n");

const resolves = (id: string) =>
	new RegExp(`\\b${id.replace(/\$/g, "\\$")}\\b`).test(code);

/** `<file>::<symbol>` for every backticked bare identifier in a comment. */
function claims(): Map<string, string> {
	const out = new Map<string, string>();
	for (const f of files) {
		for (const c of (sources.get(f) as string).match(COMMENT) ?? []) {
			for (const m of c.matchAll(/`([^`\n]+)`/g)) {
				const id = m[1].trim();
				if (BARE_IDENT.test(id) && !isSqlIdentifier(id)) {
					out.set(`${rel(f)}::${id}`, id);
				}
			}
		}
	}
	return out;
}

describe("comments name things that exist", () => {
	it("the instrument works before it is believed", () => {
		expect(files.length).toBeGreaterThan(50);
		expect(code.length).toBeGreaterThan(100_000);
		// If these stop resolving, the stripper or the regex broke — not the code.
		for (const c of CONTROLS) expect(resolves(c), `control ${c}`).toBe(true);
	});

	it("every backticked identifier resolves, or is allowed with a reason", () => {
		const unresolved = [...claims()]
			.filter(([, id]) => !resolves(id))
			.map(([key]) => key)
			.filter(
				(key) =>
					!ALLOW_SITE.has(key) &&
					!ALLOW_SYMBOL.has(key.slice(key.indexOf("::") + 2)),
			)
			.sort();

		expect(
			unresolved,
			unresolved.length === 0
				? ""
				: `Comments name symbols that do not exist in the code.\n` +
						`Either the symbol was renamed or deleted and the comment was not swept ` +
						`(CLAUDE.md rule 5: delete the references, not just the thing), or the ` +
						`comment names something deliberately absent — in which case add it to ` +
						`ALLOW with the reason.\n\n` +
						unresolved.map((u) => `  ${u}`).join("\n"),
		).toEqual([]);
	});

	/**
	 * AN ENTRY DIES TWO WAYS AND THIS CHECKED ONLY ONE.
	 *
	 * The symbol comes back, or the SITE it is keyed to goes away. Only the
	 * first was asserted, so when scaffold.tsx was deleted its entry stayed
	 * green: the symbol still resolved nowhere, so by that definition the
	 * exemption was alive, while its file could never match a comment again.
	 *
	 * That entry's own text said it was PERMANENT and should not be removed
	 * unless the comment went. The comment went. THE RETIREMENT CONDITION WAS
	 * WRITTEN DOWN CORRECTLY AND THEN HAD TO BE NOTICED BY A PERSON, which is
	 * the attestation-versus-mechanism split this project keeps landing on,
	 * landing inside the mechanism built to catch it. Found by avel-71.
	 *
	 * ALLOW_SYMBOL cannot die this way. It is keyed to a name, not a place, so
	 * only the site list carries the second check.
	 */
	it("the allowlist has no dead entries, by symbol or by site", () => {
		const present = new Set(files.map(rel));

		const resolvedAgain = [
			...[...ALLOW_SITE.keys()].filter((k) =>
				resolves(k.slice(k.indexOf("::") + 2)),
			),
			...[...ALLOW_SYMBOL.keys()].filter((k) => resolves(k)),
		].sort();

		const siteGone = [...ALLOW_SITE.keys()]
			.filter((k) => !present.has(k.slice(0, k.indexOf("::"))))
			.sort();

		expect(
			resolvedAgain,
			`These exemptions resolve now, so they are dead weight. Remove them:`,
		).toEqual([]);

		expect(
			siteGone,
			`These exemptions are keyed to files that no longer exist, so they can ` +
				`never match a comment again. Remove them:`,
		).toEqual([]);
	});

	it("every allowlist entry carries a reason", () => {
		const bare = [...ALLOW_SITE, ...ALLOW_SYMBOL].filter(
			([, why]) => why.trim().length < 20,
		);
		expect(bare.map(([k]) => k)).toEqual([]);
	});
});
