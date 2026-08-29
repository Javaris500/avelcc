import picomatch from "picomatch";
import {
	byCodepoint,
	escapeNonAscii,
	hasTraversalSegment,
	isAbsolutePath,
	isNormalized,
	normalizePath,
	topLevelSegment,
} from "./paths.ts";
import {
	ALWAYS_PROTECTED_PREFIXES,
	type BlastRadiusCore,
	type BlastRadiusPolicy,
	type FileEntry,
	MODE,
	type OverwriteEntry,
	type RemoteTree,
	type RenderedFile,
	type Violation,
} from "./types.ts";

/**
 * What delivery would do to the target repository.
 *
 * Pure. No network, no database, no clock. It compares blob SHAs the caller
 * has already computed against the SHAs in a tree the caller has already read.
 * Content is present on the input but is never hashed here.
 *
 * The reported `size` is derived from `bytes.byteLength`, never copied from a
 * caller-supplied count. The function computes the number it reports, so a
 * wrong length has one fewer place to survive.
 *
 * Every rendered file is classified CREATE, OVERWRITE or UNCHANGED, and
 * everything remote that the package does not touch is summarised as PRESERVE.
 * Violations are ADDITIVE: a file that earns one is still classified and still
 * shown. Delivery is blocked by state, never by hiding rows from the operator.
 *
 * Output arrays are sorted by codepoint. The determinism gate in
 * BLAST-RADIUS.md compares a real export against its preview, so unstable
 * ordering here would surface as a false DETERMINISM_VIOLATION.
 */
export function computeBlastRadius(
	rendered: RenderedFile[],
	remote: RemoteTree,
	policy: BlastRadiusPolicy,
): BlastRadiusCore {
	const violations: Violation[] = [];
	const create: FileEntry[] = [];
	const overwrite: OverwriteEntry[] = [];
	const unchanged: FileEntry[] = [];

	const isWritable = picomatch(policy.declaredWritablePaths, { dot: true });
	const protectedPrefixes = [
		...ALWAYS_PROTECTED_PREFIXES,
		...(policy.denylist ?? []),
	];

	// Lowercased remote paths, for case-collision detection against the client's
	// filesystem rather than against git.
	const remoteByLowerCase = new Map<string, string[]>();
	for (const remotePath of remote.entries.keys()) {
		const key = remotePath.toLowerCase();
		const bucket = remoteByLowerCase.get(key);
		if (bucket) bucket.push(remotePath);
		else remoteByLowerCase.set(key, [remotePath]);
	}

	const renderedByLowerCase = new Map<string, string[]>();
	for (const file of rendered) {
		const key = normalizePath(file.path).toLowerCase();
		const bucket = renderedByLowerCase.get(key);
		if (bucket) bucket.push(normalizePath(file.path));
		else renderedByLowerCase.set(key, [normalizePath(file.path)]);
	}

	const touched = new Set<string>();

	for (const file of rendered) {
		const path = normalizePath(file.path);
		const flag = (code: Violation["code"], detail: string) =>
			violations.push({ code, path, detail });

		// --- PATH_TRAVERSAL -------------------------------------------------
		if (!isNormalized(file.path)) {
			flag(
				"PATH_TRAVERSAL",
				`renders to ${file.path}, which is not in normalized form and becomes ${path}. As escaped codepoints, ${escapeNonAscii(file.path)} becomes ${escapeNonAscii(path)}. Paths must use forward slashes, carry no leading slash, and be NFC Unicode. Fix the renderer that emitted it; the path does not leave the repository root.`,
			);
		}
		if (isAbsolutePath(file.path)) {
			flag(
				"PATH_TRAVERSAL",
				`renders to the absolute path ${file.path}. Delivery writes relative to the repository root, so an absolute path would land outside it. Emit ${path} instead.`,
			);
		}
		if (hasTraversalSegment(path)) {
			flag(
				"PATH_TRAVERSAL",
				`renders to ${path}, which contains a ".." segment and escapes the repository root. Re-render without the parent reference.`,
			);
		}

		// --- PATH_OUTSIDE_ALLOWED -------------------------------------------
		if (!policy.allowedPathPrefixes.some((prefix) => path.startsWith(prefix))) {
			flag(
				"PATH_OUTSIDE_ALLOWED",
				policy.allowedPathPrefixes.length === 0
					? `renders to ${path}, but no allowed path prefixes are configured, so no path is permitted. Set allowedPathPrefixes on the policy.`
					: `renders to ${path}, outside allowed prefix ${policy.allowedPathPrefixes.join(" and ")}. Either re-render it under ${policy.allowedPathPrefixes[0]} or widen the allowed prefixes for this engagement.`,
			);
		}

		// --- PROTECTED_PATH --------------------------------------------------
		const hitProtected = protectedPrefixes.find((prefix) =>
			path.startsWith(prefix),
		);
		if (hitProtected !== undefined) {
			flag(
				"PROTECTED_PATH",
				`renders to ${path}, inside the protected prefix ${hitProtected}. This is never writable by a delivery and is not overridable. Re-render without it.`,
			);
		}

		// --- OWNERSHIP_VIOLATION ---------------------------------------------
		// Path-level only. A pure function with this signature cannot see which
		// agent wrote the file, so no agent is named. See BLAST-RADIUS.md.
		if (!isWritable(path)) {
			flag(
				"OWNERSHIP_VIOLATION",
				policy.declaredWritablePaths.length === 0
					? `renders to ${path}, but no writable paths are declared, so nothing in this package is owned. Set declaredWritablePaths from the roster.`
					: `renders to ${path}, which matches none of the declared writable paths (${policy.declaredWritablePaths.join(", ")}). Either an agent wrote outside its mount, or the roster entry needs widening.`,
			);
		}

		// --- CASE_COLLISION ---------------------------------------------------
		const lower = path.toLowerCase();
		const siblings = (renderedByLowerCase.get(lower) ?? []).filter(
			(other) => other !== path,
		);
		if (siblings.length > 0) {
			flag(
				"CASE_COLLISION",
				`renders to ${path}, which differs only in case from ${[...new Set(siblings)].sort(byCodepoint).join(", ")} in the same package. Git treats these as separate files; a macOS or Windows client sees one file and loses the other. Rename one before delivery.`,
			);
		}
		const remoteSiblings = (remoteByLowerCase.get(lower) ?? []).filter(
			(other) => other !== path,
		);
		if (remoteSiblings.length > 0) {
			flag(
				"CASE_COLLISION",
				`renders to ${path}, which differs only in case from the existing remote file ${[...remoteSiblings].sort(byCodepoint).join(", ")}. On a case-insensitive client this would silently replace that file rather than create a new one. Match the remote casing or rename.`,
			);
		}

		// --- SPECIAL_FILE_COLLISION + classification ---------------------------
		touched.add(path);
		const entry = remote.entries.get(path);

		if (entry === undefined) {
			create.push({ path, size: file.bytes.byteLength, blobSha: file.blobSha });
			continue;
		}

		if (entry.mode === MODE.symlink) {
			flag(
				"SPECIAL_FILE_COLLISION",
				`${path} exists remotely as a symlink (mode ${entry.mode}), not a regular file. Writing it would replace the link rather than the file it points at. Re-scope the package to avoid this path.`,
			);
		} else if (entry.mode === MODE.submodule) {
			flag(
				"SPECIAL_FILE_COLLISION",
				`${path} exists remotely as a submodule (mode ${entry.mode}), not a regular file. Writing it would corrupt the submodule reference. Re-scope the package to avoid this path.`,
			);
		}
		// An LFS pointer is mode 100644 and is indistinguishable from a normal
		// blob given {sha, mode}. It is specified as a violation and is NOT
		// detected here. See the test that documents this gap.

		if (entry.sha === file.blobSha) {
			unchanged.push({
				path,
				size: file.bytes.byteLength,
				blobSha: file.blobSha,
			});
		} else {
			overwrite.push({
				path,
				size: file.bytes.byteLength,
				blobSha: file.blobSha,
				remoteBlobSha: entry.sha,
			});
		}
	}

	// --- PRESERVE -----------------------------------------------------------
	// Count and top-level entries only, never a path list. Trees are skipped;
	// the count is files.
	let preservedFiles = 0;
	const topLevel = new Set<string>();
	for (const [remotePath, entry] of remote.entries) {
		if (entry.mode === MODE.tree) continue;
		if (touched.has(remotePath)) continue;
		preservedFiles += 1;
		topLevel.add(topLevelSegment(remotePath));
	}

	const byPath = (a: FileEntry, b: FileEntry) => byCodepoint(a.path, b.path);
	create.sort(byPath);
	overwrite.sort(byPath);
	unchanged.sort(byPath);
	violations.sort(
		(a, b) => byCodepoint(a.path, b.path) || byCodepoint(a.code, b.code),
	);

	return {
		create,
		overwrite,
		unchanged,
		preserveSummary: {
			fileCount: preservedFiles,
			topLevelDirs: [...topLevel].sort(byCodepoint),
		},
		violations,
		totals: {
			create: create.length,
			overwrite: overwrite.length,
			unchanged: unchanged.length,
			violations: violations.length,
		},
	};
}
