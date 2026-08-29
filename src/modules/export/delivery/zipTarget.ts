import type {
	DeliveryContext,
	DeliveryOutcome,
	DeliveryTarget,
} from "#/modules/export/delivery/types";
import { writeZip } from "#/modules/export/zip/writeZip";

/**
 * The zip target: the rendered package as one archive.
 *
 * The simplest of the three, and the only one that writes nothing anybody else
 * owns. A zip authorizes no remote access, resolves no Connection, and has no
 * target repository — which is why `exports_remote_target_requires_connection`
 * exempts it, why the guards skip the tip check for it, and why BLAST-RADIUS's
 * Open section concludes a zip should not compute a blast radius at all.
 *
 * NOTHING IS PERSISTED HERE. The bytes are returned to the caller and that is
 * the end of this function's responsibility. R2 was never provisioned
 * (STACK-AND-RESOURCES:143 is still an unchecked box, and there are no bucket
 * credentials), so `snapshot_key` cannot be written — and because
 * `exports_snapshot_all_or_none` requires all three snapshot columns or none,
 * the export row stores none of them rather than two-thirds of a record. The
 * hash is still computed and returned: it is what the determinism comparison
 * needs, and it costs nothing to hand back.
 */
export const zipTarget: DeliveryTarget = {
	kind: "zip",

	/**
	 * `async` even though the work is synchronous, and that is not cosmetic: a
	 * non-async function declared to return a Promise throws SYNCHRONOUSLY, so
	 * `deliver(ctx).catch(...)` would not catch the guard below and a caller
	 * handling delivery failures uniformly would get an uncaught exception from
	 * exactly one of the three targets. Async makes every failure a rejection.
	 */
	async deliver(ctx: DeliveryContext): Promise<DeliveryOutcome> {
		// `target` is null for a zip by construction. Asserted rather than
		// assumed, because a non-null one means the caller built a zip context
		// from a GitHub request and something upstream is confused about which
		// delivery this is.
		if (ctx.target !== null) {
			throw new Error(
				`zipTarget: expected no target repository, got ${ctx.target.owner}/${ctx.target.repo}. A zip delivers nowhere remote.`,
			);
		}

		const { bytes, sha256, byteLength } = writeZip(ctx.files);

		return { kind: "zip", bytes, sha256, byteLength };
	},
};
