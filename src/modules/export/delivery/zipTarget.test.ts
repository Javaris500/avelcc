import { describe, expect, it } from "vitest";
import type { DeliveryContext } from "#/modules/export/delivery/types";
import { zipTarget } from "#/modules/export/delivery/zipTarget";
import { fixtureMission } from "#/modules/export/render/fixture-mission";
import { render } from "#/modules/export/render/render";

const ctx = (over: Partial<DeliveryContext> = {}): DeliveryContext => ({
	files: render(fixtureMission),
	snapshotSha256: "a".repeat(64),
	missionId: "11111111-1111-4111-8111-111111111111",
	sprintN: 1,
	target: null,
	baseCommitSha: null,
	message: "CounselOS slice 0",
	...over,
});

describe("zipTarget", () => {
	it("delivers the rendered package as an archive", async () => {
		const out = await zipTarget.deliver(ctx());
		expect(out.kind).toBe("zip");
		if (out.kind !== "zip") return;
		expect(out.byteLength).toBe(out.bytes.byteLength);
		expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
		// PK\x03\x04 — a real local file header, not an empty buffer.
		expect([...out.bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
	});

	it("is deterministic across calls", async () => {
		const a = await zipTarget.deliver(ctx());
		const b = await zipTarget.deliver(ctx());
		if (a.kind !== "zip" || b.kind !== "zip") throw new Error("wrong kind");
		expect(a.sha256).toBe(b.sha256);
	});

	/**
	 * The archive hash is over the CONTAINER and the snapshot hash is over the
	 * package. They are different preimages and must not be conflated — an
	 * export row recording one where the other belongs would compare a zip
	 * against a render and fail determinism on a correct package.
	 */
	it("does not return the context's snapshot hash as the archive hash", async () => {
		const c = ctx();
		const out = await zipTarget.deliver(c);
		if (out.kind !== "zip") throw new Error("wrong kind");
		expect(out.sha256).not.toBe(c.snapshotSha256);
	});

	/**
	 * A zip delivers nowhere remote. A context carrying a repository means
	 * something upstream built the wrong delivery, and failing loudly beats
	 * silently ignoring a field that says a write was expected somewhere.
	 */
	it("refuses a context that names a target repository", async () => {
		await expect(
			zipTarget.deliver(
				ctx({ target: { owner: "o", repo: "r", branch: "main" } }),
			),
		).rejects.toThrow(/delivers nowhere remote/);
	});

	it("carries every rendered path into the archive", async () => {
		const files = render(fixtureMission);
		const out = await zipTarget.deliver(ctx({ files }));
		if (out.kind !== "zip") throw new Error("wrong kind");
		// The central directory records one entry per file; the EOCD counts them.
		const view = new DataView(
			out.bytes.buffer,
			out.bytes.byteOffset,
			out.bytes.byteLength,
		);
		const eocd = out.bytes.byteLength - 22;
		expect(view.getUint16(eocd + 10, true)).toBe(files.size);
	});
});
