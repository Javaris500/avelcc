/**
 * Formatting the catalog screens share, so three of them cannot disagree.
 */

/**
 * ISO IN, `YYYY-MM-DD` OUT, and deliberately not a locale format.
 *
 * A date is machine-produced, and CLAUDE.md's writing rule puts anything a
 * machine produced in mono. `toLocaleDateString` would render differently on
 * the operator's machine than in a test or a screenshot, and the format itself
 * would carry no information the operator needs: this is a catalog row's age,
 * not an appointment.
 *
 * An unparseable value renders as the raw string rather than as `Invalid Date`
 * or an em dash. If a route ever sends something that is not a timestamp, the
 * screen should show what it actually received.
 */
export function isoDate(value: string): string {
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return value;
	return parsed.toISOString().slice(0, 10);
}

/**
 * A count with its noun, singular where it is one.
 *
 * "1 agent templates" is the smallest possible tell that nobody read the
 * screen, and this catalog prints counts in about a dozen places.
 */
export function plural(n: number, one: string, many: string): string {
	return `${n} ${n === 1 ? one : many}`;
}
