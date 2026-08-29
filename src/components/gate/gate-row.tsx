import { GateGlyph } from "#/components/gate/gate-glyph";
import { StatusBadge } from "#/components/ui/badge";
import { cn } from "#/components/cn";
import type {
	GatePolicy,
	GateSource,
	GateState,
} from "#/contract/shared/errors";

/**
 * A domain component, built by WRAPPING primitives rather than forking them.
 *
 * StatusBadge is the shadcn-based primitive from ui/. GateGlyph is ours,
 * because nothing in shadcn expresses a gate verdict. That split is the point:
 * the domain layer sits on the primitive layer and never reimplements it.
 *
 * `source` is REQUIRED. A gate cannot be rendered without stating how it was
 * decided, because "an attestation rendered identically to a mechanical pass
 * is the failure mode this project exists to prevent, appearing inside the
 * product". Making it optional would make that failure a one-line omission.
 */
export type GateRowProps = {
	name: string;
	policy: GatePolicy;
	state: GateState;
	source: GateSource;
	/** Defaults from the gate name, so the wrapper supplies it, not the caller. */
	testId?: string;
};

const STATE_LABEL: Record<GateState, string> = {
	pass: "passed",
	block: "failed",
	warn: "warning",
	pending: "not run",
	stale: "stale",
};

export function GateRow({ name, policy, state, source, testId }: GateRowProps) {
	const attested = source === "attested";
	return (
		<div
			className={cn(
				"grid grid-cols-[var(--icon-inline)_1fr_auto_auto] items-center gap-3 px-4 py-2",
				"border-b border-[var(--elevation-border-rest)] last:border-b-0",
			)}
			data-policy={policy}
			data-source={source}
			data-state={state}
			data-testid={testId ?? `gate-row-${name}`}
		>
			<GateGlyph state={state} />

			<span className="font-mono text-sm text-foreground">{name}</span>

			{/* Policy is not a status, so it is a Pill-weight neutral badge. */}
			<StatusBadge
				data-testid={`gate-policy-${name}`}
				glyph={false}
				tone="neutral"
			>
				{policy}
			</StatusBadge>

			{/* The verdict, and how it was reached, in one control. An attested
			    gate is deliberately WARN-toned even when it passed: nothing
			    mechanical checked it, and that is worth an operator's attention
			    every single time. */}
			<StatusBadge
				data-testid={`gate-state-${name}`}
				tone={attested ? "warn" : state}
			>
				{attested ? `attested · ${STATE_LABEL[state]}` : STATE_LABEL[state]}
			</StatusBadge>
		</div>
	);
}
