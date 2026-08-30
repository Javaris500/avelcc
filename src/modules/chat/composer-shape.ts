/**
 * Pill or box.
 *
 * Operator ruling: the composer is a rounded pill. A full pill on a box that
 * has grown to four lines reads as a stadium, so the radius steps down once the
 * text wraps and the control becomes a rounded box instead.
 *
 * The signal is the textarea's own height. `field-sizing-content` grows the
 * element with its content in CSS, so the height IS the line count, including
 * soft wraps that counting newlines in the value would miss. That is the whole
 * reason to measure rather than to parse.
 *
 * Here rather than in the component for the usual reason: it is a decision that
 * can be wrong, and vitest runs `environment: node` over `src/**\/*.test.ts`,
 * so nothing in a .tsx can be tested at all.
 */

export type ComposerShape = "pill" | "box";

/**
 * Sub-pixel line heights and a browser that rounds differently on zoom both
 * produce a height a fraction over the baseline on a single line. Without
 * slack the composer flickers between shapes as the operator types.
 */
const TOLERANCE_PX = 6;

export type ComposerShapeInput = {
	/** Current measured height of the textarea. */
	height: number;
	/**
	 * Height of the same textarea holding one line, captured on mount before
	 * anything is typed. Zero until the first measurement lands.
	 */
	oneLine: number;
	tolerance?: number;
};

export function composerShapeFor({
	height,
	oneLine,
	tolerance = TOLERANCE_PX,
}: ComposerShapeInput): ComposerShape {
	// Not measured yet. Pill is the resting shape and the composer is empty at
	// that point, so it is also the correct one. Guessing `box` here would show
	// a box for one frame on every load.
	if (oneLine <= 0) return "pill";
	return height > oneLine + tolerance ? "box" : "pill";
}

/**
 * The radius and the cross-axis alignment move together, so they are decided
 * together. On one line the controls centre against the text. Once it wraps
 * they sit at the bottom, beside the last line, which is where the operator is
 * looking.
 */
export function composerShapeClasses(shape: ComposerShape): string {
	return shape === "pill"
		? "items-center rounded-full"
		: "items-end rounded-lg";
}
