import { createHash } from "node:crypto";

/**
 * The git blob SHA of a byte sequence.
 *
 *   sha1("blob " + <byte_length> + "\0" + <content>)
 *
 * The length in the header is the BYTE length, not the character length. For
 * `héllo — 世界 🚀\n` those differ: 14 characters, 23 bytes. A string-length
 * implementation returns a well-formed hash that is simply wrong, which is why
 * this takes bytes and never a string.
 *
 * Synchronous and Node-only by decision: the Trees read and this computation
 * both run in a server function so the client never holds a token. The
 * pre-flight screen renders in a browser; the hash is not computed there.
 *
 * Equivalent to `git hash-object <file>`, verified against it in
 * gitBlobSha.test.ts on ten real files.
 */
export function gitBlobSha(bytes: Uint8Array): string {
	const header = Buffer.from(`blob ${bytes.byteLength}\0`, "utf8");
	return createHash("sha1").update(header).update(bytes).digest("hex");
}
