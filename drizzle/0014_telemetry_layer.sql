CREATE TYPE "public"."blocker_status" AS ENUM('open', 'escalated', 'closed', 'wont-fix');--> statement-breakpoint
CREATE TYPE "public"."completion_status" AS ENUM('complete', 'partial', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."cost_actor_kind" AS ENUM('agent', 'operator');--> statement-breakpoint
CREATE TYPE "public"."dispatch_builds_against" AS ENUM('mock', 'live');--> statement-breakpoint
CREATE TABLE "blockers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mission_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"ledger_ref" integer NOT NULL,
	"dispatch_id" uuid,
	"agent_slug" text,
	"slice" text,
	"raised_on" date,
	"blocker" text NOT NULL,
	"escalated_to" text,
	"resolution" text,
	"status" "blocker_status" NOT NULL,
	"closes_blocker_id" uuid,
	"raised_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blockers_ledger_ref_positive" CHECK ("blockers"."ledger_ref" >= 1),
	CONSTRAINT "blockers_closes_not_self" CHECK ("blockers"."closes_blocker_id" <> "blockers"."id")
);
--> statement-breakpoint
CREATE TABLE "completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispatch_id" uuid NOT NULL,
	"status" "completion_status" NOT NULL,
	"branch" text,
	"completed_on" date,
	"summary" text,
	"files_touched" text[] DEFAULT '{}' NOT NULL,
	"shared_files_touched" text[] DEFAULT '{}' NOT NULL,
	"components_created" text[] DEFAULT '{}' NOT NULL,
	"error_codes_handled" text[] DEFAULT '{}' NOT NULL,
	"contract_drift" text[] DEFAULT '{}' NOT NULL,
	"testids_added" boolean,
	"four_states_covered" boolean,
	"mock_used" boolean,
	"self_check_passed" boolean,
	"gate_measurements" jsonb,
	"decisions_count" integer,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "completions_decisions_count_nonnegative" CHECK ("completions"."decisions_count" is null or "completions"."decisions_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "cost_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mission_id" uuid NOT NULL,
	"dispatch_id" uuid,
	"actor_kind" "cost_actor_kind" NOT NULL,
	"actor_ref" text NOT NULL,
	"occurred_on" date,
	"model" text,
	"input_uncached" bigint,
	"input_cache_write" bigint,
	"input_cache_read" bigint,
	"output_tokens" bigint,
	"usd" numeric(12, 2),
	"wall_seconds" integer,
	"assistant_turns" integer,
	"outcome" text,
	"note" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cost_entries_operator_has_no_dispatch" CHECK ("cost_entries"."actor_kind" <> 'operator' or "cost_entries"."dispatch_id" is null),
	CONSTRAINT "cost_entries_tokens_nonnegative" CHECK (("cost_entries"."input_uncached" is null or "cost_entries"."input_uncached" >= 0)
			    and ("cost_entries"."input_cache_write" is null or "cost_entries"."input_cache_write" >= 0)
			    and ("cost_entries"."input_cache_read" is null or "cost_entries"."input_cache_read" >= 0)
			    and ("cost_entries"."output_tokens" is null or "cost_entries"."output_tokens" >= 0)),
	CONSTRAINT "cost_entries_wall_nonnegative" CHECK ("cost_entries"."wall_seconds" is null or "cost_entries"."wall_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "dispatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mission_id" uuid NOT NULL,
	"agent_slug" text NOT NULL,
	"roster_entry_id" uuid,
	"dispatch_ref" text NOT NULL,
	"slice" text NOT NULL,
	"branch" text,
	"issued_on" date,
	"scope" text,
	"writable_paths" text[] DEFAULT '{}' NOT NULL,
	"append_only_paths" text[] DEFAULT '{}' NOT NULL,
	"readonly_paths" text[] DEFAULT '{}' NOT NULL,
	"builds_against" "dispatch_builds_against",
	"exit_condition" text,
	"slice_hard_stops" text[] DEFAULT '{}' NOT NULL,
	"dispatched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dispatches_ref_present" CHECK (length(btrim("dispatches"."dispatch_ref")) > 0)
);
--> statement-breakpoint
CREATE TABLE "finding_dispositions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"finding_id" uuid NOT NULL,
	"disposition" text NOT NULL,
	"note" text,
	"author" text,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mission_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"source_file" text,
	"ordinal" integer,
	"rule" text NOT NULL,
	"subject" text NOT NULL,
	"target_agent" text,
	"file_path" text,
	"severity" text NOT NULL,
	"category" text,
	"reviewer_kind" text,
	"reviewer_ref" text NOT NULL,
	"detail" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "findings_ordinal_positive" CHECK ("findings"."ordinal" is null or "findings"."ordinal" >= 1)
);
--> statement-breakpoint
ALTER TABLE "blockers" ADD CONSTRAINT "blockers_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blockers" ADD CONSTRAINT "blockers_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blockers" ADD CONSTRAINT "blockers_dispatch_id_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blockers" ADD CONSTRAINT "blockers_closes_blocker_id_blockers_id_fk" FOREIGN KEY ("closes_blocker_id") REFERENCES "public"."blockers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completions" ADD CONSTRAINT "completions_dispatch_id_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_dispatch_id_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_roster_entry_id_roster_entries_id_fk" FOREIGN KEY ("roster_entry_id") REFERENCES "public"."roster_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_dispositions" ADD CONSTRAINT "finding_dispositions_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "blockers_engagement_ref_unique" ON "blockers" USING btree ("engagement_id","ledger_ref");--> statement-breakpoint
CREATE INDEX "blockers_mission_idx" ON "blockers" USING btree ("mission_id");--> statement-breakpoint
CREATE INDEX "blockers_dispatch_idx" ON "blockers" USING btree ("dispatch_id");--> statement-breakpoint
CREATE INDEX "blockers_closes_idx" ON "blockers" USING btree ("closes_blocker_id");--> statement-breakpoint
CREATE UNIQUE INDEX "completions_dispatch_unique" ON "completions" USING btree ("dispatch_id");--> statement-breakpoint
CREATE INDEX "cost_entries_mission_idx" ON "cost_entries" USING btree ("mission_id");--> statement-breakpoint
CREATE INDEX "cost_entries_dispatch_idx" ON "cost_entries" USING btree ("dispatch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dispatches_ref_unique" ON "dispatches" USING btree ("dispatch_ref");--> statement-breakpoint
CREATE INDEX "dispatches_mission_idx" ON "dispatches" USING btree ("mission_id");--> statement-breakpoint
CREATE INDEX "dispatches_roster_entry_idx" ON "dispatches" USING btree ("roster_entry_id");--> statement-breakpoint
CREATE INDEX "finding_dispositions_finding_idx" ON "finding_dispositions" USING btree ("finding_id");--> statement-breakpoint
CREATE INDEX "findings_mission_idx" ON "findings" USING btree ("mission_id");--> statement-breakpoint
CREATE INDEX "findings_engagement_idx" ON "findings" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "findings_rule_idx" ON "findings" USING btree ("rule");