/**
 * The determinism rules from GOLDEN-FIXTURE.md, as code.
 *
 * Every one of these exists because getting it wrong produces a package that
 * renders correctly on one machine and hashes differently on another.
 */

/**
 * Sort strings by Unicode codepoint, never by locale.
 *
 * `localeCompare` is the specific hazard: under LANG=tr_TR it orders dotted
 * and dotless I differently, so a package rendered on a Turkish locale would
 * disagree with one rendered anywhere else. `Array.prototype.sort` with no
 * comparator stringifies and compares by UTF-16 code unit, which is close but
 * not the same thing above the BMP. This is explicit on purpose.
 */
export function byCodepoint(a: string, b: string): number {
	const as = [...a];
	const bs = [...b];
	const n = Math.min(as.length, bs.length);
	for (let i = 0; i < n; i += 1) {
		const d =
			(as[i] as string).codePointAt(0)! - (bs[i] as string).codePointAt(0)!;
		if (d !== 0) return d;
	}
	return as.length - bs.length;
}

/** Sort a copy. The renderer never mutates its input. */
export function sorted<T>(items: readonly T[], key: (item: T) => string): T[] {
	return [...items].sort((a, b) => byCodepoint(key(a), key(b)));
}

/**
 * Normalized text: NFC, LF line endings, exactly one trailing newline.
 *
 * NFC matters because the same accented character can be composed or
 * decomposed, and the two are different bytes with identical rendering — a
 * hash difference nobody can see by reading the file.
 */
export function normalizeText(text: string): string {
	const nfc = text.normalize("NFC").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	return `${nfc.replace(/\n+$/, "")}\n`;
}

/** Normalized text as UTF-8 bytes. Every file in the package goes through here. */
export function encode(text: string): Uint8Array {
	return new TextEncoder().encode(normalizeText(text));
}
