/**
 * Path normalization for the blast radius.
 *
 * "Path normalization happens before every comparison. POSIX separators, no
 * leading slash, NFC Unicode normalization. A path that changes under
 * normalization is itself a violation." - BLAST-RADIUS.md
 */

/** POSIX separators, no leading slash, NFC. */
export function normalizePath(raw: string): string {
	return raw.replace(/\\/g, "/").replace(/^\/+/, "").normalize("NFC");
}

/** True if the path is unchanged by normalization. */
export function isNormalized(raw: string): boolean {
	return normalizePath(raw) === raw;
}

/** Absolute in the POSIX sense, or carrying a Windows drive letter or UNC prefix. */
export function isAbsolutePath(raw: string): boolean {
	return (
		raw.startsWith("/") || raw.startsWith("\\") || /^[a-zA-Z]:[/\\]/.test(raw)
	);
}

/** True if any segment is exactly `..`. A file literally named `..x` is fine. */
export function hasTraversalSegment(path: string): boolean {
	return path.split("/").includes("..");
}

/**
 * The first path segment, used for the PRESERVE summary. For a root-level file
 * this is the filename itself, which the doc's own example includes.
 */
export function topLevelSegment(path: string): string {
	const slash = path.indexOf("/");
	return slash === -1 ? path : path.slice(0, slash);
}

/** Codepoint ordering. Not locale-sensitive: the render must be deterministic. */
export function byCodepoint(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}
