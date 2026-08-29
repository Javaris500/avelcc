import { createHash } from "node:crypto";
import { constants, crc32, deflateRawSync } from "node:zlib";

import { byCodepoint } from "#/modules/export/render/bytes";

/**
 * writeZip(files) -> the frozen package as one byte sequence.
 *
 * The same file map must produce byte-identical output in every process, on
 * every machine, in every timezone and locale. That is not a nicety here: an
 * export's `snapshot_sha256` is compared against its preview's to catch
 * nondeterminism leaking into the render path, so a zip writer that varied by
 * itself would poison the one mechanism that check exists to provide. It would
 * report DETERMINISM_VIOLATION on a render that was perfectly deterministic.
 *
 * Hand-rolled against node:zlib for the same reason gitBlobSha is hand-rolled
 * against node:crypto: the format is small, the determinism requirements are
 * specific, and a library that quietly stamps the current time into a header
 * would be undetectable until two machines disagreed.
 *
 * NO ZIP64. The limits are asserted below rather than silently truncated,
 * because a 4 GiB export that wrapped its size field would produce an archive
 * that opens and is wrong.
 */

/* ── the frozen header fields ───────────────────────────────────────────── */

/**
 * 1980-01-01 00:00:00, the earliest DOS timestamp representable, encoded as
 * date=0x0021 time=0x0000.
 *
 * A CONSTANT, never `new Date()`. This is the field a zip writer leaks the
 * clock through, and the leak is invisible: the archive extracts correctly,
 * every file is right, and the hash differs on every run. The mtime of a file
 * inside a deterministic package carries no information anyway — the package
 * records when the mission ran, and that lives in the manifest, in bytes that
 * are part of what gets hashed.
 */
const DOS_DATE = 0x0021;
const DOS_TIME = 0x0000;

/** 2.0 — the minimum that understands deflate. */
const VERSION_NEEDED = 20;

/** Unix (3) << 8 | 2.0, so `external attributes` are read as a unix mode. */
const VERSION_MADE_BY = 0x0314;

/**
 * Bit 11 only: filenames are UTF-8.
 *
 * Set unconditionally rather than "when the name is non-ASCII", because a flag
 * that depends on the content is a branch, and a branch is where two runs
 * diverge. UTF-8 is a superset of ASCII, so declaring it for every entry is
 * always true and never varies.
 *
 * Bit 3 (data descriptor) stays clear. Sizes are known before the header is
 * written, so nothing is streamed and no trailing descriptor is emitted.
 */
const GP_FLAG = 0x0800;

/** Deflate, for every entry. See the comment on `deflateOf`. */
const METHOD_DEFLATE = 8;

/** Regular file, 0644. Fixed: the source map has no permissions to carry. */
const EXTERNAL_ATTRS = (0o100644 << 16) >>> 0;

/**
 * Every knob zlib exposes, pinned. Leaving any of them at a default means the
 * output moves if a default moves.
 *
 * RESIDUAL RISK, STATED RATHER THAN GLOSSED: this pins the output for a given
 * zlib build. DEFLATE does not standardise its encoder, so a future Node with a
 * different zlib could compress the same bytes differently and change the
 * archive hash without anything in this repo changing. `writeZip.test.ts` pins
 * the digest of a known fixture precisely so that day is a loud red test rather
 * than a silent hash drift. Built against zlib 1.3.1.
 */
const DEFLATE_OPTIONS = {
	level: 9,
	windowBits: 15,
	memLevel: 8,
	strategy: constants.Z_DEFAULT_STRATEGY,
} as const;

const LOCAL_HEADER_SIG = 0x04034b50;
const CENTRAL_HEADER_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

const LOCAL_HEADER_BYTES = 30;
const CENTRAL_HEADER_BYTES = 46;
const EOCD_BYTES = 22;

const UINT16_MAX = 0xffff;
const UINT32_MAX = 0xffffffff;

export interface ZipResult {
	/** The complete archive. */
	bytes: Uint8Array;
	/** Hex sha256 OVER `bytes`, which is what `snapshot_sha256` records. */
	sha256: string;
	/** What `snapshot_bytes` records. */
	byteLength: number;
}

/**
 * Rejects a path that would escape the extraction directory.
 *
 * WE ARE THE WRITER, so this is not defensive input handling — it is a refusal
 * to EMIT a zip-slip archive. An entry named `../../../.ssh/authorized_keys`
 * extracts outside the target on most tools, and this package is handed to
 * clients and unpacked into their repositories. The render map is built from
 * agent slugs and skill slugs, which are data, so "the paths are ours" is an
 * assumption rather than a guarantee.
 *
 * Backslash is rejected rather than rewritten: the zip spec says forward slash,
 * and a Windows caller passing a `join()`ed path has a bug that silently
 * rewriting it would hide.
 */
function assertSafePath(path: string): void {
	if (path.length === 0) {
		throw new Error("writeZip: empty entry path");
	}
	if (path.includes("\\")) {
		throw new Error(
			`writeZip: entry path contains a backslash: ${JSON.stringify(path)}. ` +
				"Zip paths are forward-slash separated; pass the render map's own keys.",
		);
	}
	if (path.startsWith("/")) {
		throw new Error(`writeZip: absolute entry path: ${JSON.stringify(path)}`);
	}
	if (path.split("/").some((segment) => segment === "..")) {
		throw new Error(
			`writeZip: entry path escapes the archive root: ${JSON.stringify(path)}`,
		);
	}
}

/**
 * Deflate, for EVERY entry, including empty ones.
 *
 * The alternative is "store when deflate does not help", which is what most
 * writers do and which is a size-dependent branch — one more place two builds
 * can disagree. Uniform deflate costs a few bytes on incompressible entries and
 * removes the branch. An empty file deflates to the 2-byte empty raw stream,
 * which is legal and round-trips through every reader.
 */
function deflateOf(data: Uint8Array): Buffer {
	return deflateRawSync(data, DEFLATE_OPTIONS);
}

export function writeZip(files: ReadonlyMap<string, Uint8Array>): ZipResult {
	// SORTED BY CODEPOINT, never by insertion order and never by localeCompare.
	// Insertion order would make the archive depend on the order render()
	// happened to populate its map; localeCompare would make it depend on the
	// machine's locale, which is the exact hazard byCodepoint exists for and
	// which the renderer's own tests prove is real.
	const paths = [...files.keys()].sort(byCodepoint);

	if (paths.length > UINT16_MAX) {
		throw new Error(
			`writeZip: ${paths.length} entries exceeds the ${UINT16_MAX} the ` +
				"end-of-central-directory record can count. Zip64 is not implemented.",
		);
	}

	const chunks: Buffer[] = [];
	const central: Buffer[] = [];
	let offset = 0;

	for (const path of paths) {
		assertSafePath(path);

		const data = files.get(path) as Uint8Array;
		const name = Buffer.from(path, "utf8");
		const compressed = deflateOf(data);
		const checksum = crc32(data);

		if (data.byteLength > UINT32_MAX || compressed.byteLength > UINT32_MAX) {
			throw new Error(
				`writeZip: entry ${JSON.stringify(path)} exceeds 4 GiB. ` +
					"Zip64 is not implemented; refusing rather than wrapping the size field.",
			);
		}

		const localHeader = Buffer.alloc(LOCAL_HEADER_BYTES);
		localHeader.writeUInt32LE(LOCAL_HEADER_SIG, 0);
		localHeader.writeUInt16LE(VERSION_NEEDED, 4);
		localHeader.writeUInt16LE(GP_FLAG, 6);
		localHeader.writeUInt16LE(METHOD_DEFLATE, 8);
		localHeader.writeUInt16LE(DOS_TIME, 10);
		localHeader.writeUInt16LE(DOS_DATE, 12);
		localHeader.writeUInt32LE(checksum, 14);
		localHeader.writeUInt32LE(compressed.byteLength, 18);
		localHeader.writeUInt32LE(data.byteLength, 22);
		localHeader.writeUInt16LE(name.byteLength, 26);
		localHeader.writeUInt16LE(0, 28); // no extra field

		const centralHeader = Buffer.alloc(CENTRAL_HEADER_BYTES);
		centralHeader.writeUInt32LE(CENTRAL_HEADER_SIG, 0);
		centralHeader.writeUInt16LE(VERSION_MADE_BY, 4);
		centralHeader.writeUInt16LE(VERSION_NEEDED, 6);
		centralHeader.writeUInt16LE(GP_FLAG, 8);
		centralHeader.writeUInt16LE(METHOD_DEFLATE, 10);
		centralHeader.writeUInt16LE(DOS_TIME, 12);
		centralHeader.writeUInt16LE(DOS_DATE, 14);
		centralHeader.writeUInt32LE(checksum, 16);
		centralHeader.writeUInt32LE(compressed.byteLength, 20);
		centralHeader.writeUInt32LE(data.byteLength, 24);
		centralHeader.writeUInt16LE(name.byteLength, 28);
		centralHeader.writeUInt16LE(0, 30); // no extra field
		centralHeader.writeUInt16LE(0, 32); // no comment
		centralHeader.writeUInt16LE(0, 34); // disk 0
		centralHeader.writeUInt16LE(0, 36); // internal attributes
		centralHeader.writeUInt32LE(EXTERNAL_ATTRS, 38);
		centralHeader.writeUInt32LE(offset, 42);

		chunks.push(localHeader, name, compressed);
		central.push(centralHeader, name);
		offset += localHeader.byteLength + name.byteLength + compressed.byteLength;

		if (offset > UINT32_MAX) {
			throw new Error(
				"writeZip: archive exceeds 4 GiB. Zip64 is not implemented; " +
					"refusing rather than wrapping the central-directory offset.",
			);
		}
	}

	const centralOffset = offset;
	const centralSize = central.reduce((n, b) => n + b.byteLength, 0);

	const eocd = Buffer.alloc(EOCD_BYTES);
	eocd.writeUInt32LE(EOCD_SIG, 0);
	eocd.writeUInt16LE(0, 4); // this disk
	eocd.writeUInt16LE(0, 6); // disk holding the central directory
	eocd.writeUInt16LE(paths.length, 8);
	eocd.writeUInt16LE(paths.length, 10);
	eocd.writeUInt32LE(centralSize, 12);
	eocd.writeUInt32LE(centralOffset, 16);
	eocd.writeUInt16LE(0, 20); // no archive comment

	const bytes = Buffer.concat([...chunks, ...central, eocd]);

	return {
		bytes: new Uint8Array(bytes),
		sha256: createHash("sha256").update(bytes).digest("hex"),
		byteLength: bytes.byteLength,
	};
}
