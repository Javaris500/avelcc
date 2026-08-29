import type { GateState } from "#/contract/shared/errors";

/**
 * Shape first, colour second. Distinct glyphs rather than one dot in five
 * colours, so the state survives colour blindness and a greyscale print.
 * aria-hidden because GateRow states it in text as well — "icons never carry
 * meaning alone".
 */
const GLYPH: Record<GateState, string> = {
	pass: "✓",
	block: "✕",
	warn: "⚠",
	pending: "·",
	stale: "◦",
};

const TONE: Record<GateState, string> = {
	pass: "text-gate-pass",
	block: "text-gate-block",
	warn: "text-gate-warn",
	pending: "text-gate-pending",
	stale: "text-gate-stale",
};

export function GateGlyph({ state }: { state: GateState }) {
	return (
		<span
			aria-hidden="true"
			className={`font-mono text-sm leading-none ${TONE[state]}`}
			data-testid={`gate-glyph-${state}`}
		>
			{GLYPH[state]}
		</span>
	);
}
