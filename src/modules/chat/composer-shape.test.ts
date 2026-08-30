import { describe, expect, it } from "vitest";
import {
	composerShapeClasses,
	composerShapeFor,
} from "#/modules/chat/composer-shape";

/** One line of `text-sm` at `leading-relaxed`, plus the box's own padding. */
const ONE_LINE = 33;

describe("composerShapeFor", () => {
	it("is a pill at rest", () => {
		expect(composerShapeFor({ height: ONE_LINE, oneLine: ONE_LINE })).toBe(
			"pill",
		);
	});

	it("becomes a box once the text wraps", () => {
		expect(composerShapeFor({ height: ONE_LINE * 2, oneLine: ONE_LINE })).toBe(
			"box",
		);
		expect(composerShapeFor({ height: ONE_LINE * 4, oneLine: ONE_LINE })).toBe(
			"box",
		);
	});

	/**
	 * Sub-pixel line heights and browser rounding put a single line a fraction
	 * over the baseline. Without slack the shape flickers as the operator types,
	 * which is worse than either shape.
	 */
	it("tolerates a sub-pixel overshoot on one line", () => {
		expect(composerShapeFor({ height: ONE_LINE + 3, oneLine: ONE_LINE })).toBe(
			"pill",
		);
	});

	it("steps at the tolerance, not before it", () => {
		expect(composerShapeFor({ height: 40, oneLine: 33, tolerance: 6 })).toBe(
			"box",
		);
		expect(composerShapeFor({ height: 39, oneLine: 33, tolerance: 6 })).toBe(
			"pill",
		);
	});

	/**
	 * Before the first measurement lands there is no baseline, and the box is
	 * empty. Pill is both the safe answer and the correct one; guessing `box`
	 * would flash the wrong shape on every load.
	 */
	it("is a pill before anything has been measured", () => {
		expect(composerShapeFor({ height: 0, oneLine: 0 })).toBe("pill");
		expect(composerShapeFor({ height: 120, oneLine: 0 })).toBe("pill");
	});

	it("survives a negative baseline rather than inverting", () => {
		expect(composerShapeFor({ height: 120, oneLine: -1 })).toBe("pill");
	});
});

describe("composerShapeClasses", () => {
	it("pairs the pill radius with centred controls", () => {
		expect(composerShapeClasses("pill")).toContain("rounded-full");
		expect(composerShapeClasses("pill")).toContain("items-center");
	});

	/** Wrapped, the controls sit beside the last line rather than floating. */
	it("pairs the box radius with bottom-aligned controls", () => {
		expect(composerShapeClasses("box")).toContain("rounded-lg");
		expect(composerShapeClasses("box")).toContain("items-end");
	});

	it("never emits both radii", () => {
		for (const shape of ["pill", "box"] as const) {
			const classes = composerShapeClasses(shape);
			expect(
				classes.includes("rounded-full") && classes.includes("rounded-lg"),
			).toBe(false);
		}
	});
});
