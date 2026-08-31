import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { z } from "zod";

import { intakePreview, intakeSchema } from "#/contract/intake";
import { success } from "#/contract/shared/envelope";
import { REQUEST_STATUS_TONE } from "#/modules/client/ui/status";
import { usePageHeader } from "#/modules/shell/use-page-header";
import { StatusBadge, Tag } from "#/ui/badge";
import { Button } from "#/ui/button";
import { SectionCard } from "#/ui/section-card";
import { SkeletonRows } from "#/ui/skeleton";
import { ErrorState } from "#/ui/states";
import { Surface } from "#/ui/surface";

/**
 * Request review. This is the absorbed `/intake`.
 *
 * MODELLED ON THE EXPORT PRE-FLIGHT, which UI-PLAN section 5 names as the shape
 * to reuse: "`request -> mission` has the same shape as `preview -> export`.
 * Review what will happen, then commit to something that materialises."
 *
 * Five regions, in the order the plan sets, and the order is the argument:
 *
 *   1  What was asked          the raw request, never behind a disclosure
 *   2  What we derived         AND ITS EVIDENCE
 *   3  What we suggest         the preset, with the roster it would produce
 *   4  What this will create   the Mission approval materialises
 *   5  Decision                one primary
 *
 * REGION 2 IS THE POINT OF THE SCREEN. `derived_cut` is computed by reading the
 * repository rather than proposed, and `derived_cut_evidence` is the directory
 * structure that decided it. Without the evidence beside it, an operator who is
 * not technical is being asked to rubber-stamp a decision they cannot check.
 * The contract, the column comment and the plan all say the same thing three
 * separate times, so it is rendered in full and never collapsed.
 *
 * TWO READS, NOT ONE. `GET /intakes/:id` is the proposal as stored;
 * `GET /intakes/:id/preview` is what approval WOULD produce, and it writes
 * nothing, which is what lets this screen show consequences while the operator
 * is still deciding.
 */
export const Route = createFileRoute(
	"/_app/clients/$clientId/requests/$requestId",
)({
	/**
	 * CAPTURE, NOT CONSTRUCTION, and this is a correction rather than a choice.
	 *
	 * I declared `construction` here by copying the pattern from the routes
	 * either side of it, and that quietly took a capability away: `/intake/:id`
	 * was phone-allowed, and ROUTES.md's reasoning was that "reviewing and
	 * approving is exactly the shape of work that happens between meetings".
	 *
	 * The device guard's OWN refusal screen says "Reviewing and approving still
	 * works on a phone." So a phone reaching this route was shown a screen
	 * telling it that the thing it was trying to do works on a phone. The
	 * product contradicted itself in one sentence.
	 *
	 * DAY-ONE-FRONTEND draws the line in the right place and this falls on the
	 * permitted side: "approving a gated export from mobile is fine. Initiating
	 * an irreversible one is not." Approval here materialises a Mission, which
	 * is a creation the operator has reviewed on a screen built to be reviewed —
	 * not a delivery fired off from a pocket.
	 *
	 * `useRouteDevice` takes the DEEPEST route that declares a device, so this
	 * overrides the construction boundary on the `/clients` layout above it. The
	 * client detail page stays construction: nine sections and a rail is a
	 * desktop screen, and nothing about it is a decision that has to be made
	 * between meetings.
	 */
	staticData: { device: "capture" as const },
	component: RequestReview,
});

const intakeResponse = success(intakeSchema);
const previewResponse = success(intakePreview);
type IntakeResponse = z.infer<typeof intakeResponse>;
type PreviewResponse = z.infer<typeof previewResponse>;

const SHAPE_MISMATCH = "SHAPE_MISMATCH";
const httpFailure = (status: number) => `HTTP_${status}`;

async function fetchJson<T>(
	url: string,
	schema: { safeParse: (v: unknown) => { success: boolean; data?: T } },
): Promise<T> {
	const res = await fetch(url);
	const body = await res.json().catch(() => null);

	if (body?.success === false) throw new Error(body.error.code);
	if (!res.ok || body === null) throw new Error(httpFailure(res.status));

	const parsed = schema.safeParse(body);
	if (!parsed.success || parsed.data === undefined) {
		throw new Error(SHAPE_MISMATCH);
	}
	return parsed.data;
}

/**
 * `intake.get` declares 404; `intake.preview` declares 404 and 422. The 422 is
 * the interesting one and it is NOT an error state: it means the proposal
 * cannot be previewed, which is a fact about the request the operator needs,
 * not a failure of the screen. It is surfaced in region 4 rather than replacing
 * the page, so regions 1 to 3 stay readable — an operator who cannot approve
 * still needs to see what was asked in order to fix it.
 */
function describeFailure(code: string): {
	title: string;
	body: string;
	canRetry: boolean;
} {
	switch (code) {
		case "NOT_FOUND":
			return {
				title: "There is no request at this address.",
				body: "It may have been deleted, or the link may be wrong. Nothing was loaded.",
				canRetry: false,
			};
		case SHAPE_MISMATCH:
			return {
				title: "The request could not be read.",
				body: "The endpoint answered, but the body did not match the intake contract. The screen and the route have drifted apart, and rendering it anyway would be a guess.",
				canRetry: false,
			};
		default:
			return {
				title: "The request could not be read.",
				body: "The read did not complete, so nothing was loaded. Nothing was approved and nothing was written.",
				canRetry: true,
			};
	}
}

/** A labelled block of raw source. Mono, because it is not prose we wrote. */
function SourceBlock({
	children,
	testId,
}: {
	children: string;
	testId: string;
}) {
	return (
		<pre
			className="overflow-x-auto rounded-sm bg-app-recessed px-3 py-2 font-mono text-micro leading-relaxed text-text-muted"
			data-testid={testId}
		>
			{children}
		</pre>
	);
}

function RequestReview() {
	const { clientId, requestId } = Route.useParams();

	const request = useQuery<IntakeResponse>({
		queryKey: ["intake", requestId],
		queryFn: () => fetchJson(`/api/intakes/${requestId}`, intakeResponse),
		retry: false,
	});

	/**
	 * Kept separate rather than folded into one query. The proposal is readable
	 * even when the preview cannot be computed, and merging them would make a
	 * 422 on the preview hide the request text that explains why.
	 */
	const preview = useQuery<PreviewResponse>({
		queryKey: ["intake-preview", requestId],
		queryFn: () =>
			fetchJson(`/api/intakes/${requestId}/preview`, previewResponse),
		enabled: request.isSuccess,
		retry: false,
	});

	/**
	 * The route claims the header. Called at the top level rather than inside
	 * the `Surface` render prop, which React calls conditionally.
	 *
	 * The title stays the plain word "Request" rather than an id. An operator
	 * cannot recognise a uuid, and the thing they are deciding about is
	 * described by the five regions below, not by its primary key. The status
	 * carries the orienting fact instead.
	 */
	// Named apart from the `intake` inside the render prop below, which is the
	// same row narrowed to non-null. Two bindings of one name in one component,
	// one nullable and one not, is a bug waiting for whoever edits this next.
	const loaded = request.data?.data;

	usePageHeader({
		title: "Request",
		subtitle:
			loaded === undefined
				? undefined
				: loaded.status === "approved" || loaded.status === "rejected"
					? `${loaded.status} · no decision left to make`
					: `${loaded.status} · awaiting your decision`,
	});

	return (
		<div className="flex max-w-[80ch] flex-col gap-4 px-6 py-5">
			<Surface
				empty={
					<ErrorState
						body="The read succeeded but carried no request. Nothing was loaded."
						code="EMPTY_RESPONSE"
						title="There is no request at this address."
					/>
				}
				error={({ error, retry }) => {
					const shown = describeFailure(error.message);
					return (
						<ErrorState
							action={
								<Link
									className="text-sm text-accent-text hover:text-accent-hover"
									data-testid="request-back-link"
									params={{ clientId }}
									to="/clients/$clientId"
								>
									Back to the client
								</Link>
							}
							body={shown.body}
							code={error.message}
							retry={shown.canRetry ? retry : undefined}
							title={shown.title}
						/>
					);
				}}
				isEmpty={(d) => d.data === null}
				loading={<SkeletonRows count={6} />}
				query={request}
			>
				{(data) => {
					const intake = data.data;
					const decided =
						intake.status === "approved" || intake.status === "rejected";

					return (
						<>
							<div className="flex flex-col gap-1">
								<Link
									className="w-fit text-micro text-text-subtle hover:text-text-muted"
									data-testid="request-breadcrumb"
									params={{ clientId }}
									to="/clients/$clientId"
								>
									Client
								</Link>
								{/*
								 * NO h1 HERE. The shell header owns the document's only one
								 * and this route claims it above, so printing "Request" again
								 * would be a second h1 saying the same word.
								 */}
								<div className="flex flex-wrap items-center gap-3">
									<StatusBadge
										data-testid="request-status"
										tone={REQUEST_STATUS_TONE[intake.status]}
									>
										{intake.status}
									</StatusBadge>
								</div>
								{/*
								 * THIS PAGE CANNOT PROVE THE REQUEST BELONGS TO THIS CLIENT.
								 *
								 * An intake carries `engagement_id`, an engagement carries
								 * `client_id`, and nothing on the wire joins the two. So a
								 * hand-edited or stale `clientId` in this URL would render
								 * another client's request under this client's breadcrumb,
								 * with no error anywhere. The engagement is printed so the
								 * mismatch is at least VISIBLE, which is the most this screen
								 * can honestly do until the read carries the client.
								 */}
								<p className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
									engagement{" "}
									<Tag data-testid="request-engagement">
										{intake.engagementId}
									</Tag>
								</p>
							</div>

							{/* ── 1 · what was asked ─────────────────────────────────── */}
							<SectionCard
								blurb="The request exactly as it arrived, unedited. Everything below is derived from this, so this is what you check the rest against."
								id="asked"
								testId="request-section-asked"
								state={intake.sourceMd === null ? "empty" : "populated"}
								title="What was asked"
							>
								{intake.sourceMd === null ? (
									<p className="text-sm text-text-subtle">
										This request carries no source text. There is nothing to
										check the derivation against, which is itself a reason not
										to approve it.
									</p>
								) : (
									<SourceBlock testId="request-source">
										{intake.sourceMd}
									</SourceBlock>
								)}

								{/*
								 * `[]` means "none surfaced", never "not asked" — the contract
								 * says so explicitly, and the two render differently here
								 * because an operator reading "no open questions" should be
								 * able to trust that something looked.
								 */}
								{intake.openQuestions.length === 0 ? (
									<p
										className="pt-3 text-sm text-text-subtle"
										data-testid="request-questions-none"
									>
										No open questions were surfaced.
									</p>
								) : (
									<div className="flex flex-col gap-1 pt-3">
										<p className="text-micro text-text-subtle uppercase">
											Open questions
										</p>
										<ul
											className="flex list-disc flex-col gap-1 pl-4"
											data-testid="request-questions"
										>
											{intake.openQuestions.map((q) => (
												<li className="text-sm text-text-muted" key={q}>
													{q}
												</li>
											))}
										</ul>
									</div>
								)}
							</SectionCard>

							{/* ── 2 · what we derived, and its evidence ──────────────── */}
							<SectionCard
								blurb="The cut is how the work is split: horizontal means by layer, vertical means by feature. It is computed by reading the repository's folders, never chosen by hand, and the evidence below is what decided it."
								id="derived"
								testId="request-section-derived"
								state={intake.derivedCut === null ? "empty" : "populated"}
								title="What we derived"
							>
								{intake.derivedCut === null ? (
									<p
										className="text-sm text-text-subtle"
										data-testid="request-cut-none"
									>
										Not yet derived. Deriving a cut means reading a connected
										repository, and there is none on this request yet. Nothing
										has been guessed in its place.
									</p>
								) : (
									<div className="flex flex-col gap-3">
										<div className="flex items-center gap-2">
											<span className="text-micro text-text-subtle uppercase">
												Cut
											</span>
											<Tag data-testid="request-cut">{intake.derivedCut}</Tag>
										</div>
										{/*
										 * NEVER BEHIND A DISCLOSURE. UI-PLAN: "The evidence is the
										 * point. It makes an automated decision reviewable." A
										 * collapsed panel is a decision nobody checks.
										 */}
										{intake.derivedCutEvidence === null ? (
											<p
												className="text-sm text-gate-warn"
												data-testid="request-evidence-missing"
											>
												A cut was derived but no evidence was recorded. There is
												nothing here to check it against.
											</p>
										) : (
											<div className="flex flex-col gap-1">
												<p className="text-micro text-text-subtle uppercase">
													Evidence
												</p>
												<SourceBlock testId="request-evidence">
													{intake.derivedCutEvidence}
												</SourceBlock>
											</div>
										)}
									</div>
								)}
							</SectionCard>

							{/* ── 3 · what we suggest ────────────────────────────────── */}
							{/* ── 4 · what this will create ──────────────────────────── */}
							<Surface
								empty={
									<p className="text-sm text-text-subtle">
										The preview returned nothing.
									</p>
								}
								error={({ error }) => (
									<SectionCard
										blurb="What approving this request would produce."
										id="creates"
										testId="request-section-creates"
										notBuiltReason={`The preview could not be computed (${error.message}). Until it can, there is nothing to approve, because approving without a preview is the one thing this screen exists to prevent.`}
										state="not-built"
										title="What this will create"
									/>
								)}
								isEmpty={(d) => d.data === null}
								loading={<SkeletonRows count={4} />}
								query={preview}
							>
								{(pv) => {
									const p = pv.data;
									return (
										<>
											<SectionCard
												blurb="A preset is a saved squad. This is the roster it would produce, expanded, so you can see who would be assigned rather than a name standing in for them."
												count={p.roster.length}
												id="suggest"
												testId="request-section-suggest"
												state={p.roster.length === 0 ? "empty" : "populated"}
												title="What we suggest"
											>
												{p.roster.length === 0 ? (
													<p
														className="text-sm text-text-subtle"
														data-testid="request-roster-empty"
													>
														No preset was suggested, so approving this would
														create a mission with nobody assigned to it.
													</p>
												) : (
													<ul
														className="flex flex-col gap-2"
														data-testid="request-roster"
													>
														{p.roster.map((r) => (
															<li
																className="flex flex-wrap items-baseline gap-x-3"
																key={r.agentTemplateId}
															>
																<span className="text-sm text-text">
																	{r.name}
																</span>
																<Tag data-testid="request-roster-slug">
																	{r.slug}
																</Tag>
																{r.wave === null ? null : (
																	<span className="text-micro text-text-subtle">
																		wave {r.wave}
																	</span>
																)}
															</li>
														))}
													</ul>
												)}
											</SectionCard>

											<SectionCard
												blurb="Approving creates this mission. A mission is the unit of work that gets dispatched, gated and delivered."
												id="creates"
												testId="request-section-creates"
												state="populated"
												title="What this will create"
											>
												<div className="flex flex-col gap-3">
													<dl
														className="grid gap-x-6 gap-y-2 sm:grid-cols-2"
														data-testid="request-mission"
													>
														<div className="flex flex-col gap-0.5">
															<dt className="text-micro text-text-subtle">
																Title
															</dt>
															{/*
															 * A null title is a real state — `missions.title`
															 * is nullable because "a mission titled
															 * 'Untitled' is a lie the schema told". Named
															 * here as unnamed rather than blank.
															 */}
															<dd className="text-sm text-text">
																{p.mission.title ?? "Unnamed mission"}
															</dd>
														</div>
														<div className="flex flex-col gap-0.5">
															<dt className="text-micro text-text-subtle">
																Type
															</dt>
															<dd className="text-sm text-text">
																{p.mission.type}
															</dd>
														</div>
														<div className="flex flex-col gap-0.5">
															<dt className="text-micro text-text-subtle">
																Cut
															</dt>
															<dd className="text-sm text-text">
																{p.mission.cut ?? "Not derived"}
															</dd>
														</div>
														<div className="flex flex-col gap-0.5">
															<dt className="text-micro text-text-subtle">
																Sprint
															</dt>
															<dd className="text-sm text-text">
																{p.mission.sprintN}
															</dd>
														</div>
													</dl>

													{/*
													 * Blockers and warnings are rendered SEPARATELY and
													 * labelled by what they do, not by severity colour
													 * alone. A blocker stops approval; a warning does
													 * not. An operator must be able to tell which of the
													 * two they are looking at without knowing the
													 * palette.
													 */}
													{p.blockers.length === 0 ? null : (
														<div
															className="flex flex-col gap-1"
															data-testid="request-blockers"
														>
															<p className="text-micro text-gate-block uppercase">
																Stops approval
															</p>
															<ul className="flex list-disc flex-col gap-1 pl-4">
																{p.blockers.map((b) => (
																	<li
																		className="text-sm text-text-muted"
																		key={b.code}
																	>
																		{b.detail}{" "}
																		<span className="font-mono text-micro text-text-subtle">
																			{b.code}
																		</span>
																	</li>
																))}
															</ul>
														</div>
													)}

													{p.warnings.length === 0 ? null : (
														<div
															className="flex flex-col gap-1"
															data-testid="request-warnings"
														>
															<p className="text-micro text-gate-warn uppercase">
																Worth seeing, does not stop approval
															</p>
															<ul className="flex list-disc flex-col gap-1 pl-4">
																{p.warnings.map((w) => (
																	<li
																		className="text-sm text-text-muted"
																		key={w.code}
																	>
																		{w.detail}{" "}
																		<span className="font-mono text-micro text-text-subtle">
																			{w.code}
																		</span>
																	</li>
																))}
															</ul>
														</div>
													)}
												</div>
											</SectionCard>
										</>
									);
								}}
							</Surface>

							{/* ── 5 · the decision ───────────────────────────────────── */}
							<SectionCard
								blurb="Approving creates the mission above. The request itself is kept either way, because it is the record of how the brief came to exist."
								id="decision"
								testId="request-section-decision"
								state="populated"
								title="Decision"
							>
								{decided ? (
									/*
									 * An already-decided request offers no decision. The contract
									 * answers 409 for a second approval, and a button whose only
									 * outcome is a conflict is a button that does not work.
									 */
									<div
										className="flex flex-col gap-2"
										data-testid="request-already-decided"
									>
										<p className="text-sm text-text-muted">
											This request was {intake.status}
											{intake.approvedBy === null
												? ""
												: ` by ${intake.approvedBy}`}
											. It cannot be decided again.
										</p>
										{intake.missionId === null ? null : (
											<Link
												className="text-sm text-accent-text hover:text-accent-hover"
												data-testid="request-mission-link"
												params={{ missionId: intake.missionId }}
												to="/missions/$missionId"
											>
												Open the mission it created
											</Link>
										)}
									</div>
								) : (
									<div className="flex flex-col gap-3">
										<div className="flex flex-wrap items-center gap-3">
											{/*
											 * THE ONE PRIMARY, AND IT IS DISABLED.
											 *
											 * Approval materialises a Mission and cannot be undone.
											 * UI-PLAN section 12 rule 3 — "nothing irreversible
											 * without a preview" — and section 5 both put it behind
											 * `ConfirmAction`, which avel-71 owns and which has not
											 * landed. Wiring the button now would ship the
											 * irreversible half of the pattern without the half that
											 * makes it safe, on the single screen the rule was
											 * written for.
											 *
											 * Disabled by STATE with the reason beside it, never by
											 * styling alone.
											 */}
											<Button
												data-testid="request-approve"
												disabled
												variant="primary"
											>
												Approve
											</Button>
											<span className="text-sm text-text-subtle">
												Disabled: approving creates a mission and cannot be
												undone, and the confirmation step is not built yet.
											</span>
										</div>

										<div className="flex flex-wrap items-center gap-3">
											<Button
												data-testid="request-reject"
												disabled
												variant="secondary"
											>
												Reject
											</Button>
											<span className="text-sm text-text-subtle">
												Disabled: rejecting records a decision and asks for a
												reason. The form is not built yet.
											</span>
										</div>

										{/*
										 * REVISE HAS NO ENDPOINT. UI-PLAN names three decisions;
										 * `intakeContract` has `approve` and `reject` and no
										 * update verb of any kind, so there is currently no way to
										 * change a request after it is created. Declared rather
										 * than omitted, following the pre-flight screen's
										 * treatment of its two unbuilt sections, so the shape of
										 * the decision is visible and the gap is not silently
										 * dropped from the plan.
										 */}
										<div className="flex flex-wrap items-center gap-3">
											<Button
												data-testid="request-revise"
												disabled
												variant="secondary"
											>
												Revise
											</Button>
											<span className="text-sm text-text-subtle">
												Disabled: nothing can edit a request yet. The contract
												has no verb for it.
											</span>
										</div>
									</div>
								)}
							</SectionCard>
						</>
					);
				}}
			</Surface>
		</div>
	);
}
