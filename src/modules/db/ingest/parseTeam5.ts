/**
 * Parsing `.team-5/` into the telemetry tables' shapes.
 *
 * PURE. Takes file contents and returns rows plus PROBLEMS. Nothing here reads
 * a filesystem, a clock or a database, so the whole parse is testable against a
 * string and a bad row surfaces as a reported problem rather than as an
 * exception halfway through a load.
 *
 * NOT A YAML PARSER, and deliberately not. No yaml dependency is installed and
 * adding one is out of scope, but the stronger reason is that a general parser
 * would silently accept shapes this corpus does not use and quietly coerce the
 * ones it does. This handles exactly the forms `.team-5/` writes, and REFUSES
 * anything else by reporting it.
 */

export interface Problem {
	file: string;
	field?: string;
	detail: string;
}

export type Scalar = string | string[] | undefined;

/** A parsed YAML-ish header: flat keys, plus one level of nesting. */
export interface Header {
	values: Map<string, Scalar>;
	nested: Map<string, Map<string, string[]>>;
}

/**
 * Strip a trailing ` # comment`.
 *
 * Only when the hash follows whitespace and sits outside brackets, because
 * `reviewer: axe-core/playwright 4.13.0` and
 * `branch: main + uncommitted polish work in the tree` are values, not
 * comments, and a naive split on "#" would truncate a bracketed list mid-way.
 */
function stripComment(line: string): string {
	let depth = 0;
	for (let i = 0; i < line.length; i += 1) {
		const c = line[i] as string;
		if (c === "[") depth += 1;
		else if (c === "]") depth -= 1;
		else if (
			c === "#" &&
			depth === 0 &&
			(i === 0 || /\s/.test(line[i - 1] as string))
		) {
			return line.slice(0, i);
		}
	}
	return line;
}

/** The first `---`-fenced block of a file. */
export function frontMatter(text: string): string | null {
	const lines = text.split(/\r?\n/);
	let start = -1;
	for (let i = 0; i < lines.length; i += 1) {
		if ((lines[i] as string).trim() === "---") {
			start = i;
			break;
		}
	}
	if (start === -1) return null;
	for (let i = start + 1; i < lines.length; i += 1) {
		if ((lines[i] as string).trim() === "---") {
			return lines.slice(start + 1, i).join("\n");
		}
	}
	return null;
}

export function parseHeader(block: string): Header {
	const values = new Map<string, Scalar>();
	const nested = new Map<string, Map<string, string[]>>();
	const lines = block.split(/\r?\n/);

	let i = 0;
	while (i < lines.length) {
		const raw = lines[i] as string;
		const line = stripComment(raw).replace(/\s+$/, "");
		i += 1;
		if (!line.trim() || line.trim().startsWith("#")) continue;

		const m = line.match(/^([a-z_]+):\s*(.*)$/);
		if (!m) continue;
		const key = m[1] as string;
		let rest = (m[2] as string).trim();

		// key: >   — a folded block, continuing while indented.
		if (rest === ">" || rest === "|") {
			const parts: string[] = [];
			while (i < lines.length && /^\s+\S/.test(lines[i] as string)) {
				parts.push((lines[i] as string).trim());
				i += 1;
			}
			values.set(key, parts.join(" "));
			continue;
		}

		// key: [ ... ]  — possibly spanning lines.
		if (rest.startsWith("[")) {
			while (!rest.includes("]") && i < lines.length) {
				rest += ` ${stripComment(lines[i] as string).trim()}`;
				i += 1;
			}
			const inner = rest.slice(rest.indexOf("[") + 1, rest.lastIndexOf("]"));
			values.set(
				key,
				inner
					.split(",")
					.map((s) => s.trim().replace(/^["']|["']$/g, ""))
					.filter(Boolean),
			);
			continue;
		}

		// key:  followed by an indented list, or by indented sub-keys.
		if (rest === "") {
			const items: string[] = [];
			const sub = new Map<string, string[]>();
			let sawSubKey = false;
			while (i < lines.length && /^\s+\S/.test(lines[i] as string)) {
				const child = stripComment(lines[i] as string).replace(/\s+$/, "");
				i += 1;
				if (!child.trim()) continue;
				const asItem = child.match(/^\s+-\s+(.*)$/);
				const asKey = child.match(/^\s+([a-z_]+):\s*(.*)$/);
				if (asItem) {
					items.push((asItem[1] as string).trim().replace(/^["']|["']$/g, ""));
				} else if (asKey) {
					sawSubKey = true;
					const subKey = asKey[1] as string;
					const subRest = (asKey[2] as string).trim();
					const list: string[] = [];
					if (subRest.startsWith("[")) {
						const inner = subRest.slice(1, subRest.lastIndexOf("]"));
						for (const s of inner.split(",")) {
							const v = s.trim().replace(/^["']|["']$/g, "");
							if (v) list.push(v);
						}
					} else {
						while (i < lines.length && /^\s+-\s+/.test(lines[i] as string)) {
							const it = stripComment(lines[i] as string).match(
								/^\s+-\s+(.*)$/,
							);
							i += 1;
							if (it)
								list.push((it[1] as string).trim().replace(/^["']|["']$/g, ""));
						}
					}
					sub.set(subKey, list);
				}
			}
			if (sawSubKey) nested.set(key, sub);
			else values.set(key, items);
			continue;
		}

		values.set(key, rest.replace(/^["']|["']$/g, ""));
	}

	return { values, nested };
}

export const str = (h: Header, k: string): string | undefined => {
	const v = h.values.get(k);
	return typeof v === "string" ? v.trim() || undefined : undefined;
};

export const list = (h: Header, k: string): string[] => {
	const v = h.values.get(k);
	if (Array.isArray(v)) return v;
	if (typeof v === "string" && v.trim()) return [v.trim()];
	return [];
};

export const bool = (h: Header, k: string): boolean | undefined => {
	const v = str(h, k);
	if (v === "true") return true;
	if (v === "false") return false;
	return undefined;
};

export const int = (h: Header, k: string): number | undefined => {
	const v = str(h, k);
	if (v === undefined) return undefined;
	const n = Number.parseInt(v.replace(/[^0-9-]/g, ""), 10);
	return Number.isFinite(n) ? n : undefined;
};

/** `3h01m` / `8h22m` / `7 days` -> seconds. Undefined when it does not fit. */
export function wallToSeconds(v: string | undefined): number | undefined {
	if (!v) return undefined;
	const hm = v.match(/^(\d+)h\s*(\d+)m$/);
	if (hm) return Number(hm[1]) * 3600 + Number(hm[2]) * 60;
	const days = v.match(/^(\d+)\s*days?$/);
	if (days) return Number(days[1]) * 86400;
	return undefined;
}

/** `$60.27` / `**unlogged**` -> a decimal string, or undefined. */
export function usd(v: string | undefined): string | undefined {
	if (!v) return undefined;
	const m = v.replace(/\*/g, "").match(/\$?\s*([0-9]+(?:\.[0-9]+)?)/);
	return m ? (m[1] as string) : undefined;
}

/** `83,670,625` / `**unlogged**` -> a number, or undefined. */
export function tokens(v: string | undefined): number | undefined {
	if (!v) return undefined;
	const cleaned = v.replace(/\*/g, "").replace(/,/g, "").trim();
	if (!/^\d+$/.test(cleaned)) return undefined;
	return Number(cleaned);
}

/** Rows of a GitHub-flavoured markdown table, as cell arrays. */
export function tableRows(text: string): string[][] {
	const out: string[][] = [];
	for (const line of text.split(/\r?\n/)) {
		const t = line.trim();
		if (!t.startsWith("|") || !t.endsWith("|")) continue;
		const cells = t
			.slice(1, -1)
			.split("|")
			.map((c) => c.trim());
		if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // separator
		out.push(cells);
	}
	return out;
}
