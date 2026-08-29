import type { RenderMission } from "#/modules/export/render/types";

/**
 * The slice-1 mission, as the renderer's INPUT.
 *
 * PROVENANCE, because it changes what the byte-for-byte test proves. The
 * structural fields — agents, phases, edges, gates, mounts, the gate config —
 * were entered by hand from the specification. The prose bodies (brief,
 * conventions, identity, depth) were extracted from the hand-written package,
 * because that prose IS the stored data: in production it is the identity_md
 * column, not something the renderer derives.
 *
 * So a passing test proves different things for different files. For MISSION.md,
 * playbook.md, roster.json and manifest.json it proves the renderer BUILDS the
 * bytes correctly from fields. For the prose files it proves normalization and
 * placement, and nothing about derivation, because there is nothing to derive.
 */
export const fixtureMission: RenderMission = {
	avelVersion: "1",
	missionId: "01J8Z4K2QW3E5R7T9Y1V3J5P7A",
	sprint: 1,
	cut: "vertical",
	cutSource: "derived",
	cutEvidence: "feature-organized codebase",
	missionType: "full-build",
	client: "Meridian Law",
	title: "CounselOS Slice 1 — Transactions",
	whatShips:
		"One vertical slice: the transactions module, backend through UI,\ngated by both an API test and a browser test.",
	doneCommands: ["pnpm --filter api test:e2e", "pnpm --filter web test:e2e"],
	phases: ["A", "B", "C", "D"],
	agents: [
		{
			slug: "operator",
			phase: "A",
			kind: "horizontal",
			runtime: "human",
			owns: "The composition root, the api common layer, and shared packages",
			writable: [
				"apps/api/src/app.module.ts",
				"apps/api/src/common/**",
				"packages/shared/**",
			],
			appendOnly: [
				".avel/process/log/decision-log.md",
				".avel/process/reports/**",
			],
			readonly: ["**"],
			skills: [],
		},
		{
			slug: "transactions",
			phase: "B",
			kind: "feature",
			runtime: "model",
			owns: "The transactions feature, every layer",
			writable: [
				"apps/api/src/modules/transactions/**",
				"apps/web/src/app/transactions/**",
				"apps/web/src/components/features/transactions/**",
			],
			appendOnly: [
				".avel/process/log/decision-log.md",
				".avel/process/reports/**",
				"apps/api/src/app.module.ts",
			],
			readonly: [
				".avel/contract/**",
				".avel/conventions/**",
				"packages/shared/**",
			],
			identityMd:
				"# transactions\n\nYou own the transactions feature end to end: schema, service,\ncontroller, guards, state, and components.\n\n## Mount\n\nWritable:\n  apps/api/src/modules/transactions/**\n  apps/web/src/app/transactions/**\n  apps/web/src/components/features/transactions/**\n\nAppend-only:\n  .avel/process/log/decision-log.md\n  .avel/process/reports/**\n  apps/api/src/app.module.ts\n\nA write outside this set fails the ownership check and the mission\ndoes not ship. This is enforced by the filesystem, not by your\njudgment.\n\n## Never\n\n- Write another feature's module\n- Modify shared packages — file a blocker instead\n- Edit tests you did not author\n\n## Blockers\n\nIf the dispatch forbids something you need, file it in\nprocess/findings/ with a documented workaround. Do not absorb\nit silently and do not route around the boundary.\n",
			depthMd:
				"# transactions — depth\n\nReach for this when the common path does not cover what you hit.\n\n## Registering in the composition root\n\n`apps/api/src/app.module.ts` is append-only. Add your module to the\n`imports` array and change nothing else. Do not reorder the existing\nentries, do not touch providers, do not reformat the file. The\nownership check reads the diff, and a reformat reads as a rewrite.\n\nIf the module cannot load without a change that is not an append,\nfile a blocker. Do not edit around the restriction.\n\n## Crossing into the web app\n\nThe transactions feature owns three roots, two of them under\n`apps/web`. Route files live in `apps/web/src/app/transactions/`,\ncomponents in `apps/web/src/components/features/transactions/`.\nShared UI primitives live under `packages/shared`, which is\nread-only to you. If a primitive is missing, file a blocker rather\nthan copying it into your tree.\n\n## Contract changes\n\n`.avel/contract/phase1.openapi.json` is read-only. It is the frozen\nphase-1 surface and the conformance gate diffs phase 2 against it.\nA response shape that disagrees with the contract is a gate failure,\nnot a contract update. If the contract is wrong, file a finding.\n\n## DTOs are an edge\n\n`apps/api/src/modules/transactions/*.dto.ts` is a declared edge to\nnemi. Renaming an exported DTO breaks a consumer you cannot see and\ncannot fix, because their tests are outside your mount. Add fields;\ndo not rename or remove them within a sprint.\n\n## Migrations\n\nMigrations are forward-only and one per change. Never edit an\napplied migration. If a migration must be undone, write the next\none.\n\n## When the test you need is not yours\n\nYou author tests for your own modules. Browser tests under\n`apps/web/e2e/**` belong to nemi. A failing browser test is a\nfinding you file, not a file you edit.\n",
			skills: [
				{
					slug: "drizzle-migrate",
					body: "---\nname: Drizzle Migration\nrecommended_for:\n  - backend\nslug: drizzle-migrate\nsource: counselos-house\ntype: capability\n---\n\n# Drizzle Migration\n\nGenerate and apply schema migrations with Drizzle Kit.\n\nThis skill declares a tool grant. It does not enforce one. Nothing in\nthe current runtime restricts which tools an agent may invoke, so\ntreat the grant as the boundary you are accountable to rather than\none you will be stopped at.\n\n## Grant\n\n```\npnpm --filter api drizzle-kit generate\npnpm --filter api drizzle-kit migrate\n```\n\nGeneration reads the schema and writes a migration. Application runs\nit against the connected database.\n\n## Procedure\n\nEdit the schema first. Generate second. Read the generated SQL before\napplying it, every time, because a rename that Drizzle cannot see is\nemitted as a drop followed by an add, and that is data loss rather\nthan a rename.\n\nApply against the local database. Run the API test suite. Commit the\nschema change and the generated migration in the same commit.\n\n## Rules\n\nMigrations are forward-only. One migration per change. Never edit a\nmigration that has been applied anywhere, including locally, because\nthe checksum is what tells the next environment whether it has run.\n\nIf a migration is wrong, write the next one that corrects it.\n\nA migration file is generated output. Do not hand-edit it to tidy the\nSQL. If the SQL is wrong, the schema is wrong.\n\n## Out of grant\n\nDropping a column that any deployed code still reads. Truncating a\ntable. Running `drizzle-kit push` against anything, which skips the\nmigration history and leaves environments unable to agree on state.\nFile a blocker instead.\n",
				},
				{
					slug: "nestjs-module",
					body: "---\nname: NestJS Feature Module\nrecommended_for:\n  - backend\nslug: nestjs-module\nsource: counselos-house\ntype: knowledge\n---\n\n# NestJS Feature Module\n\nA feature module is one directory and it owns every layer of one\nfeature. Nothing in it is imported by another feature except through\nthe module's exported service.\n\n## Shape\n\n```\nmodules/<feature>/\n  <feature>.module.ts       declares, wires, exports\n  <feature>.controller.ts   HTTP only\n  <feature>.service.ts      business logic\n  <feature>.repository.ts   database only\n  <feature>.dto.ts          request and response shapes\n  dto/                      split here once <feature>.dto.ts exceeds one screen\n```\n\n## Rules\n\nThe module declares its controller, provides its service and\nrepository, and exports only the service. A repository is never\nexported. A module that exports its repository has published its\nschema to every consumer.\n\nThe controller takes the request, validates it through the DTO, calls\none service method, and returns. No branching on business state, no\ndatabase access, no orchestration of two services.\n\nThe service holds the logic and owns the transaction boundary. If two\nrepositories must change together, the service is where that happens.\n\nThe repository is the only layer that names a table.\n\n## Registering\n\nAdd the module to the `imports` array in the composition root and\nchange nothing else in that file. The composition root belongs to no\nfeature, and every feature must register in it.\n\n## What breaks this\n\nInjecting another module's repository. Reaching into a sibling\nfeature's directory. A controller that calls two services to make one\ndecision, which means the decision belongs in a service that does not\nexist yet.\n",
				},
			],
		},
		{
			slug: "nemi",
			phase: "C",
			kind: "horizontal",
			runtime: "model",
			owns: "Frontend tests and the accessibility audit",
			writable: ["apps/web/e2e/**", "apps/web/src/**/*.test.tsx"],
			appendOnly: [
				".avel/process/log/decision-log.md",
				".avel/process/reports/**",
			],
			readonly: ["**"],
			identityMd:
				"# nemi\n\nYou own frontend verification for this mission: browser tests,\ncomponent tests, and the accessibility audit. You own no feature\nand you write no product code.\n\n## Mount\n\nWritable:\n  apps/web/e2e/**\n  apps/web/src/**/*.test.tsx\n\nAppend-only:\n  .avel/process/log/decision-log.md\n  .avel/process/reports/**\n\nRead-only:\n  everything else\n\nA write outside this set fails the ownership check and the mission\ndoes not ship. This is enforced by the filesystem, not by your\njudgment.\n\n## Never\n\n- Modify the code under test to make a test pass\n- Author a test with no assertion\n- Edit another agent's tests\n- Change a DTO you consume — it belongs to transactions\n\n## Blockers\n\nIf the dispatch forbids something you need, file it in\nprocess/findings/ with a documented workaround. Do not absorb\nit silently and do not route around the boundary.\n",
			depthMd:
				"# nemi — depth\n\nReach for this when the common path does not cover what you hit.\n\n## Why your mount excludes the code under test\n\nA tester that can edit the code it tests can make any failing test\npass by changing the code instead of fixing the bug. The mount is\nthe mechanism; your judgment is not being relied on. When a test\nfails because the product is wrong, the output is a finding in\n`process/findings/`, not an edit.\n\n## A green suite is not evidence\n\nA test with no assertions passes every time. Every test you author\nasserts on observable state: rendered text, a response body, a\nroute change, an ARIA property. Asserting that a function was\ncalled is not asserting that it worked.\n\n## What you consume from transactions\n\n`apps/api/src/modules/transactions/*.dto.ts` is a declared edge into\nyour work. Read those types; do not restate them. If a DTO does not\nmatch what the API returns, that is a finding against transactions,\nand the contract at `.avel/contract/phase1.openapi.json` is the\ntiebreaker.\n\n## Accessibility\n\nThe audit is part of the qa gate, not a separate deliverable. Cover\nkeyboard reachability, focus order, accessible names on every\ninteractive element, and colour contrast on text. Report violations\nby rule id and selector so they are actionable without a rerun.\n\n## Flake\n\nA test that fails intermittently is a failing test. Do not retry it,\ndo not mark it skipped. Fix the wait condition or file a finding\nsaying you could not. A skipped test is an absent test that reads\nas a present one.\n\n## Timing\n\nYou run in phase C, after transactions has closed phase B. If the\nfeature is not ready, you are blocked, and blocked is a report you\nfile. It is not a reason to write the feature.\n",
			skills: [
				{
					slug: "playwright-gate",
					body: "---\nname: Playwright Gate\nrecommended_for:\n  - qa\nslug: playwright-gate\nsource: counselos-house\ntype: knowledge\n---\n\n# Playwright Gate\n\nThe browser test suite is one of two gates on this mission. It runs\nas `pnpm --filter web test:e2e` and one red run means no ship.\n\n## What a gate test asserts\n\nObservable state a user could see: rendered text, a visible element,\na URL after navigation, a form's validation message, an accessible\nname. Not a spy, not a call count, not an internal store value. A\ntest that asserts a function was called does not assert the feature\nworks.\n\nEvery test carries at least one assertion. A test with no assertion\npasses every time and reads as coverage.\n\n## Selectors\n\nUse role and accessible name first: `getByRole('button', { name:\n'Post transaction' })`. Fall back to `getByLabel` and `getByText`.\nUse a test id only when no accessible handle exists, and when that\nhappens, the missing accessible name is itself a finding.\n\nCSS and XPath selectors couple the test to markup that is not yours\nto stabilise. Do not use them.\n\n## Waiting\n\nAssert on a condition, never on a duration. Playwright's expectations\nretry; `waitForTimeout` does not. A test that needs a sleep is a test\nthat has not found its condition yet.\n\nA test that fails intermittently is a failing test. Do not retry it\nand do not skip it. Fix the condition or file a finding stating that\nyou could not.\n\n## Fixtures\n\nEach test creates the state it needs and does not depend on another\ntest having run. Order dependence turns one real failure into a wall\nof noise that hides it.\n\n## Accessibility\n\nThe audit runs inside this suite, not beside it. Check keyboard\nreachability, focus order, an accessible name on every interactive\nelement, and text contrast. Report each violation by rule id and\nselector.\n\n## Boundary\n\nThe code under test is read-only to you. When a test fails because\nthe product is wrong, the output is a finding, not an edit.\n",
				},
			],
		},
	],
	edges: [
		{
			from: "operator",
			artifact: ".avel/contract/phase1.openapi.json",
			to: ["transactions"],
		},
		{
			from: "transactions",
			artifact: "apps/api/src/modules/transactions/*.dto.ts",
			to: ["nemi"],
		},
	],
	playbook: {
		missionType: "full-build",
		waves: ["A", "B", "C", "D"],
		gates: [
			{ gate: "phase1-close", policy: "mandatory" },
			{ gate: "alignment", policy: "mandatory" },
			{ gate: "qa", policy: "mandatory" },
			{ gate: "security", policy: "warn" },
			{ gate: "acceptance", policy: "mandatory" },
		],
		deliverable: "pr",
		requiredFields: ["brief", "contract", "roster", "conventions"],
		hardBlock:
			"The mission must contain at least one active agent in the earliest\nwave this playbook declares.",
	},
	brief:
		"# Brief: CounselOS Slice 1 — Transactions\n\n## Client\n\nMeridian Law, a twelve-person practice running matter billing on a\nspreadsheet and a shared mailbox. CounselOS is the replacement.\n\n## Problem\n\nEvery billable event is entered twice: once by the fee earner in a\ntimesheet, once by the practice manager into the invoice run. The\nsecond entry is where the errors are, and there is no record that\nlinks an invoice line back to the event it came from.\n\n## What this slice is\n\nOne vertical slice through the transactions module: a transaction can\nbe recorded once, listed, and read back, through the API and through\nthe UI, with the same shape at both ends.\n\nThis is the first slice. It establishes the layering, the contract,\nand the two gates. Every slice after it follows the pattern this one\nsets, so the pattern matters more here than the feature does.\n\n## In scope\n\n- The transactions table, service, repository, and controller\n- Create, list, and read a single transaction\n- The transactions route and list view in the web app\n- The phase-1 API surface, frozen as the contract\n- An API test suite and a browser test suite, both gating\n\n## Out of scope\n\nEditing and deleting a transaction. Invoicing. Matter linkage.\nAuthentication beyond what already exists. Pagination beyond a\ndefault limit. Currency other than GBP.\n\nAnything in this list that turns out to be load-bearing is a\nblocker, not a quiet addition.\n\n## Constraints\n\nThe contract at `.avel/contract/phase1.openapi.json` is frozen. Phase\n2 is diffed against it and a breaking change fails the conformance\ngate.\n\n`packages/shared` is read-only to every agent on this mission. A\nmissing shared primitive is a blocker.\n\nThe composition root is append-only. Register the module; change\nnothing else in that file.\n\n## Definition of done\n\nBoth gates green, neither optional:\n\n- `pnpm --filter api test:e2e`\n- `pnpm --filter web test:e2e`\n\nPlus zero ownership violations, coverage delta at or above zero, and\nmutation score at or above the global floor.\n\n## What would make this slice a failure\n\nA working feature with a shape the next slice cannot follow. The\ndeliverable is the pattern as much as the transactions module, and a\nslice that ships green while establishing a layering the second\nfeature has to break has not shipped.\n",
	conventions: [
		{
			slug: "layering",
			body: "# Layering\n\ncontroller → service → repository\n\nA controller handles the HTTP request and nothing else.\nA service holds business logic.\nA repository talks to the database.\n\nA controller never queries the database directly.\nA module imports another module's service, never its repository.\n\nEnforced by ESLint and a bootstrap guard. Violations fail the build.\n",
		},
		{
			slug: "naming",
			body: "# Naming\n\n## Files\n\nkebab-case, always. `transaction-list.tsx`, not `TransactionList.tsx`.\n\nBackend files carry their layer: `transactions.controller.ts`,\n`transactions.service.ts`, `transactions.repository.ts`,\n`transactions.module.ts`, `transactions.dto.ts`.\n\nTest files sit beside what they test: `transactions.service.spec.ts`.\nBrowser tests live under `apps/web/e2e/` and end in `.spec.ts`.\n\n## Code\n\nTypes and components PascalCase. Functions and variables camelCase.\nConstants that are genuinely constant SCREAMING_SNAKE_CASE.\n\nA boolean reads as a predicate: `isPosted`, `hasMatter`, `canVoid`.\nNever `posted` for a boolean and never a negative name like\n`notPosted`.\n\n## Database\n\nTables plural snake_case: `transactions`. Columns snake_case.\nForeign keys are `<singular>_id`: `matter_id`. Money is stored in\nminor units as an integer, in a column ending `_minor`, never a\nfloat.\n\nTimestamps end `_at` and are `timestamptz`. Never a bare `date`\ncolumn for something that happens at a moment.\n\n## API\n\nPaths are plural nouns, lowercase, kebab-case: `/transactions`,\n`/transactions/{id}`. No verbs in a path. The method is the verb.\n\nJSON fields are camelCase at the boundary even though columns are\nsnake_case. The mapping happens in the repository and nowhere else.\n\n## Modules and features\n\nA feature directory is the singular domain word, plural only if the\ndomain is plural: `transactions`. The same word names the module,\nthe route, the component directory, and the table. One feature, one\nword, everywhere.\n",
		},
		{
			slug: "testing",
			body: "# Testing\n\nTwo suites gate this codebase. Both must be green to ship.\n\napi    `pnpm --filter api test:e2e`     the HTTP surface, against a real database\nweb    `pnpm --filter web test:e2e`     the browser, against a running app\n\nEvery test asserts on observable state. A test with no assertion\npasses every time.\n\nTest the contract, not the implementation. Assert on the response\nbody and status code, not on which service method was called.\n\nEach test creates the state it needs. No test depends on another\ntest having run first.\n\nAssert on a condition, never on a duration. No sleeps.\n\nAn intermittent failure is a failure. Do not retry it and do not skip\nit. Fix the condition or file a finding.\n\nName a test for the behaviour it pins, not for the function it calls.\n\nAn agent authors tests for the code it owns. Browser tests belong to\nthe verification agent. Nobody edits a test they did not author.\n\nNobody edits the code under test to make a test pass.\n",
		},
	],
	contract: {
		components: {
			schemas: {
				Currency: {
					description: "Phase 1 is GBP only.",
					enum: ["GBP"],
					type: "string",
				},
				Error: {
					additionalProperties: false,
					description:
						"Every error response carries this shape. Clients switch on code and never parse message.",
					properties: {
						code: {
							description: "Stable machine-readable error code.",
							type: "string",
						},
						details: {
							description: "Field-level detail, present on validation errors.",
							type: "object",
						},
						message: {
							description: "Human-readable text. Not stable. Never parsed.",
							type: "string",
						},
					},
					required: ["code", "message"],
					type: "object",
				},
				Transaction: {
					additionalProperties: false,
					description: "One recorded billable event.",
					properties: {
						amountMinor: {
							description: "Amount in minor units. Never a float.",
							type: "integer",
						},
						createdAt: {
							description: "When the record was written.",
							format: "date-time",
							type: "string",
						},
						currency: {
							$ref: "#/components/schemas/Currency",
						},
						description: {
							maxLength: 500,
							minLength: 1,
							type: "string",
						},
						id: {
							format: "uuid",
							type: "string",
						},
						occurredAt: {
							description: "When the billable event happened.",
							format: "date-time",
							type: "string",
						},
						reference: {
							description: "Client-supplied idempotency reference. Unique.",
							maxLength: 64,
							type: "string",
						},
						status: {
							$ref: "#/components/schemas/TransactionStatus",
						},
					},
					required: [
						"amountMinor",
						"createdAt",
						"currency",
						"description",
						"id",
						"occurredAt",
						"status",
					],
					type: "object",
				},
				TransactionCreate: {
					additionalProperties: false,
					description:
						"The request body for recording a transaction. Server-assigned fields are absent.",
					properties: {
						amountMinor: {
							type: "integer",
						},
						currency: {
							$ref: "#/components/schemas/Currency",
						},
						description: {
							maxLength: 500,
							minLength: 1,
							type: "string",
						},
						occurredAt: {
							format: "date-time",
							type: "string",
						},
						reference: {
							maxLength: 64,
							type: "string",
						},
					},
					required: ["amountMinor", "currency", "description", "occurredAt"],
					type: "object",
				},
				TransactionList: {
					additionalProperties: false,
					properties: {
						items: {
							items: {
								$ref: "#/components/schemas/Transaction",
							},
							type: "array",
						},
						limit: {
							type: "integer",
						},
						offset: {
							type: "integer",
						},
						total: {
							description:
								"Total matching the filter, ignoring limit and offset.",
							type: "integer",
						},
					},
					required: ["items", "limit", "offset", "total"],
					type: "object",
				},
				TransactionStatus: {
					description:
						"Phase 1 records and posts. Voiding arrives in a later phase and adding a member here is a breaking change for consumers that exhaustively switch.",
					enum: ["draft", "posted"],
					type: "string",
				},
			},
		},
		info: {
			description:
				"Phase 1 surface for the transactions slice. Frozen. Phase 2 is diffed against this document and a breaking change fails the conformance gate.",
			title: "CounselOS API",
			version: "1.0.0",
		},
		openapi: "3.1.0",
		paths: {
			"/transactions": {
				get: {
					operationId: "listTransactions",
					parameters: [
						{
							description: "Maximum number of transactions to return.",
							in: "query",
							name: "limit",
							required: false,
							schema: {
								default: 50,
								maximum: 200,
								minimum: 1,
								type: "integer",
							},
						},
						{
							description: "Number of transactions to skip.",
							in: "query",
							name: "offset",
							required: false,
							schema: {
								default: 0,
								minimum: 0,
								type: "integer",
							},
						},
						{
							description: "Filter by transaction status.",
							in: "query",
							name: "status",
							required: false,
							schema: {
								$ref: "#/components/schemas/TransactionStatus",
							},
						},
					],
					responses: {
						"200": {
							content: {
								"application/json": {
									schema: {
										$ref: "#/components/schemas/TransactionList",
									},
								},
							},
							description: "A page of transactions, newest first.",
						},
						"400": {
							content: {
								"application/json": {
									schema: {
										$ref: "#/components/schemas/Error",
									},
								},
							},
							description: "The query parameters were not valid.",
						},
					},
					summary: "List transactions",
					tags: ["transactions"],
				},
				post: {
					operationId: "createTransaction",
					requestBody: {
						content: {
							"application/json": {
								schema: {
									$ref: "#/components/schemas/TransactionCreate",
								},
							},
						},
						required: true,
					},
					responses: {
						"201": {
							content: {
								"application/json": {
									schema: {
										$ref: "#/components/schemas/Transaction",
									},
								},
							},
							description: "The transaction was recorded.",
						},
						"400": {
							content: {
								"application/json": {
									schema: {
										$ref: "#/components/schemas/Error",
									},
								},
							},
							description: "The request body was not valid.",
						},
						"409": {
							content: {
								"application/json": {
									schema: {
										$ref: "#/components/schemas/Error",
									},
								},
							},
							description: "A transaction with this reference already exists.",
						},
					},
					summary: "Record a transaction",
					tags: ["transactions"],
				},
			},
			"/transactions/{id}": {
				get: {
					operationId: "getTransaction",
					parameters: [
						{
							description: "The transaction identifier.",
							in: "path",
							name: "id",
							required: true,
							schema: {
								format: "uuid",
								type: "string",
							},
						},
					],
					responses: {
						"200": {
							content: {
								"application/json": {
									schema: {
										$ref: "#/components/schemas/Transaction",
									},
								},
							},
							description: "The transaction.",
						},
						"404": {
							content: {
								"application/json": {
									schema: {
										$ref: "#/components/schemas/Error",
									},
								},
							},
							description: "No transaction with that identifier.",
						},
					},
					summary: "Read one transaction",
					tags: ["transactions"],
				},
			},
		},
		servers: [
			{
				description: "Local development",
				url: "http://localhost:3000",
			},
		],
		tags: [
			{
				description: "Recording and reading billable events.",
				name: "transactions",
			},
		],
	},
	decisionLog: [
		{
			sequence: "0001",
			agent: "operator",
			sprint: 1,
			phase: "A",
			decision: "The cut for this mission is vertical.",
			context:
				"The connected repository organises `apps/api/src/modules/` and\n  `apps/web/src/components/features/` by feature, not by layer. The\n  cut is read from that structure.",
			alternatives:
				"A horizontal cut was not considered. The cut is derived from the\n  directory structure rather than chosen, so there was no decision to\n  make once the structure was read.",
			consequence:
				"Agents are scoped to features rather than to layers. The\n  transactions agent owns every layer of one feature, which is why\n  its writable set spans both the api and web applications.",
			supersedes: "none",
		},
	],
	gate: {
		mutationFloor: 60,
		coverageDeltaMin: 0,
		configPreimage: "mutation_floor=60\ncoverage_delta_min=0\n",
	},
};
