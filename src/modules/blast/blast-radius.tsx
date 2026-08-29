import { StatusBadge, Tag } from "#/ui/badge";
import { cn } from "#/utils/cn";

/**
 * The blast radius panel — section 4 of the pre-flight screen.
 *
 * DIFF STATE IS NOT GATE STATE. The token layer aliases them separately and
 * says why: "nobody should reach for --gate-block to mean overwrite, which
 * would say an overwrite is a failure." An overwrite is destructive and worth
 * attention; it is not a failed check.
 *
 * PRESERVE IS A COUNT, NEVER A LIST. BLAST-RADIUS.md: "A client repo has
 * thousands of untouched files. Listing them is noise that buries the three
 * lines that matter."
 */

export type BlastRadiusView = {
	create: { path: string; size: number }[];
	overwrite: { path: string; size: number; remoteBlobSha: string }[];
	unchanged: { path: string; size: number }[];
	preserveSummary: { fileCount: number; topLevelDirs: string[] };
	violations: { code: string; path: string; detail: string }[];
	totals: {
		create: number;
		overwrite: number;
		unchanged: number;
		violations: number;
	};
	baseCommitSha: string | null;
	baseRef: string;
	target: { owner: string; repo: string; branch: string };
};

function Row({
	label,
	count,
	tone,
	children,
}: {
	label: string;
	count: number;
	tone: "create" | "overwrite" | "unchanged";
	children?: React.ReactNode;
}) {
	const color = {
		create: "text-diff-create",
		overwrite: "text-diff-overwrite",
		unchanged: "text-diff-unchanged",
	}[tone];
	return (
		<div className="border-b border-[var(--elevation-border-rest)] px-4 py-3 last:border-b-0">
			<div className="flex items-baseline gap-3">
				<span
					className={cn("font-mono text-xs tracking-wider uppercase", color)}
				>
					{label}
				</span>
				<span className="font-mono text-sm tabular-nums">{count}</span>
			</div>
			{children}
		</div>
	);
}

export function BlastRadius({ data }: { data: BlastRadiusView }) {
	const { totals, preserveSummary, violations } = data;

	return (
		<div data-testid="blast-radius">
			{/* The base SHA and the target are ALWAYS visible. BLAST-RADIUS:
			    "Staleness is a first-class fact, not a surprise at submit." */}
			<div className="flex flex-wrap items-center gap-2 border-b border-[var(--elevation-border-rest)] px-4 py-3">
				<Tag data-testid="blast-target">
					{data.target.owner}/{data.target.repo}
				</Tag>
				<span className="text-xs text-text-subtle">on</span>
				<Tag data-testid="blast-ref">{data.baseRef}</Tag>
				<span className="text-xs text-text-subtle">base</span>
				<Tag data-testid="blast-base-sha">
					{data.baseCommitSha
						? data.baseCommitSha.slice(0, 8)
						: "empty repository"}
				</Tag>
			</div>

			<Row count={totals.create} label="create" tone="create" />

			<Row count={totals.overwrite} label="overwrite" tone="overwrite">
				{data.overwrite.length > 0 ? (
					<ul className="flex flex-col gap-1 pt-2" data-testid="overwrite-list">
						{data.overwrite.map((f) => (
							<li className="flex items-center gap-2" key={f.path}>
								<span className="font-mono text-xs text-text-muted">
									{f.path}
								</span>
								<StatusBadge
									data-testid={`overwrite-${f.path}`}
									glyph={false}
									tone="warn"
								>
									destructive
								</StatusBadge>
							</li>
						))}
					</ul>
				) : null}
			</Row>

			<Row count={totals.unchanged} label="unchanged" tone="unchanged" />

			{/* Count plus top-level directories. That is the whole entry. */}
			<div className="border-b border-[var(--elevation-border-rest)] px-4 py-3">
				<div className="flex items-baseline gap-3">
					<span className="font-mono text-xs tracking-wider text-diff-preserve uppercase">
						preserve
					</span>
					<span
						className="font-mono text-sm tabular-nums"
						data-testid="preserve-count"
					>
						{preserveSummary.fileCount} files untouched
					</span>
				</div>
				{preserveSummary.topLevelDirs.length > 0 ? (
					<p
						className="pt-1 font-mono text-xs text-text-subtle"
						data-testid="preserve-dirs"
					>
						{preserveSummary.topLevelDirs.join(" · ")}
					</p>
				) : null}
			</div>

			{violations.length > 0 ? (
				<div className="px-4 py-3" data-testid="violations">
					<span className="font-mono text-xs tracking-wider text-gate-block uppercase">
						violations
					</span>
					<ul className="flex flex-col gap-2 pt-2">
						{violations.map((v) => (
							<li className="flex flex-col gap-0.5" key={`${v.code}:${v.path}`}>
								<StatusBadge data-testid={`violation-${v.code}`} tone="block">
									{v.code}
								</StatusBadge>
								<span className="text-xs leading-relaxed text-text-muted">
									{v.detail}
								</span>
							</li>
						))}
					</ul>
				</div>
			) : null}
		</div>
	);
}
