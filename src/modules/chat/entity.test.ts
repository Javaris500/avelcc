import { describe, expect, it } from "vitest";
import {
	dedupeEntities,
	type EntityRef,
	entitiesFromToolOutput,
	hrefFor,
	toEntityRef,
} from "#/modules/chat/entity";

const MISSION = {
	kind: "mission",
	id: "01J8Z4K2QW3E5R7T9Y1V3J5P7A",
	title: "Northwind onboarding",
	status: "blocked",
	tone: "block",
	facts: [
		{ label: "Client", value: "Northwind" },
		{ label: "Gates", value: "1 of 6 blocking" },
	],
};

/** Non-null or fail loudly, so a broken parser cannot read as a passing test. */
function parsed(value: unknown): EntityRef {
	const ref = toEntityRef(value);
	if (!ref) throw new Error("expected a parsed entity");
	return ref;
}

describe("toEntityRef", () => {
	it("reads a well formed tool result", () => {
		const ref = parsed(MISSION);
		expect(ref.kind).toBe("mission");
		expect(ref.title).toBe("Northwind onboarding");
		expect(ref.facts).toHaveLength(2);
	});

	it("takes name when the tool wrote name instead of title", () => {
		expect(parsed({ kind: "client", id: "c1", name: "Northwind" }).title).toBe(
			"Northwind",
		);
	});

	it("refuses anything that is not an object", () => {
		for (const bad of [null, undefined, 3, "mission", [], true]) {
			expect(toEntityRef(bad)).toBeNull();
		}
	});

	it("refuses a kind it has no route for", () => {
		expect(toEntityRef({ ...MISSION, kind: "invoice" })).toBeNull();
	});

	it("refuses a row with no id, because a card with no target is a dead link", () => {
		expect(toEntityRef({ ...MISSION, id: "" })).toBeNull();
		expect(toEntityRef({ ...MISSION, id: undefined })).toBeNull();
	});

	it("refuses a row with no title", () => {
		expect(toEntityRef({ kind: "mission", id: "m1" })).toBeNull();
	});

	/**
	 * An unknown variant reaches cva, matches nothing, and renders a badge with
	 * no background. Silently, in both themes. Falling back to neutral is the
	 * difference between a wrong colour and no colour.
	 */
	it("falls back to neutral rather than passing an unknown tone to the badge", () => {
		expect(parsed({ ...MISSION, tone: "chartreuse" }).tone).toBe("neutral");
		expect(parsed({ ...MISSION, tone: undefined }).tone).toBe("neutral");
	});

	it("keeps status exactly as the server wrote it", () => {
		// mission.status is z.string() with no vocabulary. Mapping it here would
		// be inventing one on the way to the screen.
		expect(parsed({ ...MISSION, status: "awaiting review" }).status).toBe(
			"awaiting review",
		);
	});

	it("caps facts at three so a card stays a pointer", () => {
		const many = {
			...MISSION,
			facts: Array.from({ length: 9 }, (_, i) => ({
				label: `L${i}`,
				value: `V${i}`,
			})),
		};
		expect(parsed(many).facts).toHaveLength(3);
	});

	it("drops malformed facts without dropping the card", () => {
		const ref = parsed({
			...MISSION,
			facts: [
				{ label: "Client" },
				null,
				"nope",
				{ label: "Gates", value: "1" },
			],
		});
		expect(ref.facts).toEqual([{ label: "Gates", value: "1" }]);
	});

	it("survives facts that are not an array", () => {
		expect(parsed({ ...MISSION, facts: "two" }).facts).toEqual([]);
	});
});

describe("hrefFor", () => {
	it("links a mission at the route that exists", () => {
		expect(hrefFor(parsed(MISSION))).toBe(
			"/missions/01J8Z4K2QW3E5R7T9Y1V3J5P7A",
		);
	});

	/**
	 * Client detail is UI-PLAN section 5 and is not built. A card linking to a
	 * route that does not exist is a working-looking link, which is what the
	 * nav's `built: false` branch already exists to prevent.
	 */
	it("returns null for kinds with no detail route yet", () => {
		expect(hrefFor({ ...parsed(MISSION), kind: "client" })).toBeNull();
		expect(hrefFor({ ...parsed(MISSION), kind: "export" })).toBeNull();
	});
});

describe("dedupeEntities", () => {
	it("renders one card when two tool calls name the same row", () => {
		const ref = parsed(MISSION);
		expect(dedupeEntities([ref, { ...ref }])).toHaveLength(1);
	});

	it("keeps two rows that share an id across different kinds", () => {
		const ref = parsed(MISSION);
		expect(dedupeEntities([ref, { ...ref, kind: "client" }])).toHaveLength(2);
	});
});

describe("entitiesFromToolOutput", () => {
	it("reads a single row", () => {
		expect(entitiesFromToolOutput(MISSION)).toHaveLength(1);
	});

	it("reads a bare array", () => {
		expect(
			entitiesFromToolOutput([MISSION, { ...MISSION, id: "m2" }]),
		).toHaveLength(2);
	});

	it("reads the paginated envelope the contract uses", () => {
		expect(entitiesFromToolOutput({ items: [MISSION] })).toHaveLength(1);
	});

	it("drops the rows it cannot parse and keeps the ones it can", () => {
		expect(
			entitiesFromToolOutput([MISSION, null, { kind: "invoice" }]),
		).toHaveLength(1);
	});

	/**
	 * Empty rather than throwing. A tool that returns a number should render as
	 * raw output, not take the conversation down with it.
	 */
	it("returns nothing for a shape it does not recognise", () => {
		expect(entitiesFromToolOutput(42)).toEqual([]);
		expect(entitiesFromToolOutput(null)).toEqual([]);
		expect(entitiesFromToolOutput({ total: 3 })).toEqual([]);
	});
});
