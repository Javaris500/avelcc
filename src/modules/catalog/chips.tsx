import type { LucideIcon } from "lucide-react";
import { BookOpen, Bot, Terminal, User, Wrench } from "lucide-react";

import type { AgentRuntime, SkillType } from "#/contract/catalog";
import { StatusChip } from "#/modules/catalog/ui";
import { Pill } from "#/ui/badge";

/**
 * THE FOUR DOMAIN LABELS THE CATALOG PRINTS, MAPPED ONCE.
 *
 * Three screens render a skill type, a runtime and a revocation state. Three
 * copies of that mapping is how one screen ends up calling a capability skill
 * "tool" while another calls it "capability", and it is the same drift
 * CLAUDE.md rule 5 is about, one layer down from documents.
 *
 * Every chip pairs a GLYPH with a WORD. badge.tsx states the rule: "Icons never
 * carry meaning alone. Every state has glyph AND label AND colour." That is an
 * accessibility rule and it is also the reason a revoked row cannot be missed
 * by an operator who is scanning rather than reading.
 */

/* ── revocation ──────────────────────────────────────────────────────────── */

/**
 * THE LOUDEST THING ON A ROW, on purpose.
 *
 * The failure being defended against is specific and it has happened: a revoked
 * skill rendered into a client package without anybody noticing. A withdrawn
 * row that differs from a live row only by being slightly greyer is the same
 * failure waiting on the next person who is in a hurry, so this is `block`
 * tone, which badge.tsx pairs with a ✕, next to the word Revoked.
 *
 * Nothing renders for a live row. A "Live" chip on every row spends the
 * operator's attention on the normal case and leaves nothing to notice.
 */
export function RevocationChip({
	revokedAt,
	testId,
}: {
	revokedAt: string | null;
	testId: string;
}) {
	if (revokedAt === null) return null;
	return (
		<StatusChip data-testid={testId} tone="block">
			Revoked
		</StatusChip>
	);
}

/* ── skill type ──────────────────────────────────────────────────────────── */

const SKILL_TYPE: Record<SkillType, { icon: LucideIcon; label: string }> = {
	knowledge: { icon: BookOpen, label: "Knowledge" },
	/**
	 * "DECLARATIVE" IS NOT DECORATION AND IT IS NOT OPTIONAL.
	 *
	 * schema.ts:64, on `skill_type`: "`capability` DECLARES a tool grant; it does
	 * not enforce one. Enforcement needs a runtime that can restrict a tool and
	 * none exists. The UI is required to label it declarative, because a badge
	 * implying enforcement would be the product lying about itself."
	 *
	 * So the word travels with the chip everywhere the chip goes, rather than
	 * living in a tooltip an operator has to know to hover.
	 */
	capability: { icon: Wrench, label: "Capability · declarative" },
};

export function SkillTypeChip({
	type,
	testId,
}: {
	type: SkillType;
	testId: string;
}) {
	const { icon: Icon, label } = SKILL_TYPE[type];
	return (
		<Pill data-skill-type={type} data-testid={testId}>
			<Icon aria-hidden="true" className="size-3" strokeWidth={1.8} />
			{label}
		</Pill>
	);
}

/* ── agent runtime ───────────────────────────────────────────────────────── */

/**
 * WHAT ACTUALLY EXECUTES THE AGENT, and the field that has to be unmissable.
 *
 * The second shipped bug this interface is asked to prevent: model context sent
 * to an agent that is not a model. `render.ts` branches on `runtime` and emits
 * identity.md and depth.md only for `model`, so a template's runtime decides
 * whether half its content is real. A column an operator has to squint at
 * cannot carry that.
 *
 * Three distinct icons, three distinct words, and `data-runtime` on the
 * element. Not three colours: `human` and `code` are not failures and giving
 * them a warning tone would teach the operator to read a normal roster as
 * broken.
 */
const RUNTIME: Record<AgentRuntime, { icon: LucideIcon; label: string }> = {
	model: { icon: Bot, label: "AI model" },
	human: { icon: User, label: "Person" },
	code: { icon: Terminal, label: "Script" },
};

export function RuntimeChip({
	runtime,
	testId,
}: {
	runtime: AgentRuntime;
	testId: string;
}) {
	const { icon: Icon, label } = RUNTIME[runtime];
	return (
		<Pill data-runtime={runtime} data-testid={testId}>
			<Icon aria-hidden="true" className="size-3" strokeWidth={1.8} />
			{label}
		</Pill>
	);
}

/** The word alone, for prose. One spelling, from the same table. */
export function runtimeLabel(runtime: AgentRuntime): string {
	return RUNTIME[runtime].label;
}

/* ── an attachment that should not exist ─────────────────────────────────── */

/**
 * Marks a skill on an agent's list that has been revoked in the catalog.
 *
 * The agents screen needs this because the agent is where the exposure lives:
 * the skills page can tell you a revoked skill is still attached to two
 * templates, and this tells you which of the twelve skills on THIS template is
 * the one.
 *
 * A different label from `RevocationChip`, not a different component doing the
 * same job. "Revoked" on a catalog row is the row's own state; "Revoked in
 * catalog" on an agent's skill list is a fact about something else, and reading
 * it as the agent's own state would be wrong.
 */
export function RevokedAttachmentChip({ testId }: { testId: string }) {
	return (
		<StatusChip data-testid={testId} tone="block">
			Revoked in catalog
		</StatusChip>
	);
}
