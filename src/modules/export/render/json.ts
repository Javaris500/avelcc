import { byCodepoint, encode } from "#/modules/export/render/bytes";

/** A JSON document with no clock, no randomness and no undefined. */
export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

/**
 * Canonical JSON: object keys sorted by codepoint at every depth, two-space
 * indent, one trailing newline.
 *
 * Array order is NOT touched. Arrays carry meaning through their order — the
 * phases list is a sequence, not a set — so ordering them is the caller's
 * decision, made with a declared key, and never a side effect of serializing.
 *
 * `JSON.stringify(value, null, 2)` alone is not enough: its key order is
 * insertion order, which is stable within one process and not guaranteed to
 * survive a round trip through anything else.
 */
export function canonicalJson(value: JsonValue): string {
	return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

export function encodeJson(value: JsonValue): Uint8Array {
	return encode(canonicalJson(value));
}

function sortKeys(value: JsonValue): JsonValue {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value === null || typeof value !== "object") return value;
	const out: { [key: string]: JsonValue } = {};
	for (const key of Object.keys(value).sort(byCodepoint)) {
		out[key] = sortKeys(value[key] as JsonValue);
	}
	return out;
}
