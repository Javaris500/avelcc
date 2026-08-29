CREATE TYPE "public"."connection_scope_type" AS ENUM('owner', 'repo');--> statement-breakpoint
CREATE TYPE "public"."connection_service" AS ENUM('github');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('active', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."export_status" AS ENUM('pending', 'rendering', 'verifying', 'previewing', 'previewed', 'delivering', 'pr-open', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service" "connection_service" DEFAULT 'github' NOT NULL,
	"label" text NOT NULL,
	"engagement_id" uuid,
	"scope_type" "connection_scope_type" NOT NULL,
	"scope_value" text NOT NULL,
	"credential_ref" text NOT NULL,
	"status" "connection_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"last_rotated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connections_revoked_requires_timestamp" CHECK ("connections"."status" <> 'revoked' or "connections"."revoked_at" is not null),
	CONSTRAINT "connections_scope_value_present" CHECK (length(btrim("connections"."scope_value")) > 0)
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mission_id" uuid NOT NULL,
	"sprint_n" integer DEFAULT 1 NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"target_kind" "export_target" NOT NULL,
	"connection_id" uuid,
	"status" "export_status" DEFAULT 'pending' NOT NULL,
	"pr_status" text,
	"snapshot_key" text,
	"snapshot_sha256" text,
	"snapshot_bytes" integer,
	"version_manifest" jsonb,
	"contract_sha256" text,
	"verification" jsonb,
	"gate_override" jsonb,
	"replay_of" uuid,
	"dry_run" boolean DEFAULT false NOT NULL,
	"preview_export_id" uuid,
	"base_ref" text,
	"base_commit_sha" text,
	"blast_radius" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exports_remote_target_requires_connection" CHECK ("exports"."target_kind" = 'zip' or "exports"."connection_id" is not null),
	CONSTRAINT "exports_snapshot_all_or_none" CHECK (num_nonnulls("exports"."snapshot_key", "exports"."snapshot_sha256", "exports"."snapshot_bytes") in (0, 3)),
	CONSTRAINT "exports_snapshot_bytes_nonnegative" CHECK ("exports"."snapshot_bytes" is null or "exports"."snapshot_bytes" >= 0),
	CONSTRAINT "exports_sprint_n_positive" CHECK ("exports"."sprint_n" >= 1),
	CONSTRAINT "exports_replay_of_not_self" CHECK ("exports"."replay_of" <> "exports"."id"),
	CONSTRAINT "exports_preview_export_not_self" CHECK ("exports"."preview_export_id" <> "exports"."id")
);
--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_replay_of_exports_id_fk" FOREIGN KEY ("replay_of") REFERENCES "public"."exports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_preview_export_id_exports_id_fk" FOREIGN KEY ("preview_export_id") REFERENCES "public"."exports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connections_scope_idx" ON "connections" USING btree ("service","scope_type","scope_value");--> statement-breakpoint
CREATE INDEX "connections_engagement_idx" ON "connections" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "connections_status_idx" ON "connections" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "exports_idempotency_key_unique" ON "exports" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "exports_mission_idx" ON "exports" USING btree ("mission_id");--> statement-breakpoint
CREATE INDEX "exports_connection_idx" ON "exports" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "exports_replay_of_idx" ON "exports" USING btree ("replay_of");--> statement-breakpoint
CREATE INDEX "exports_preview_export_idx" ON "exports" USING btree ("preview_export_id");--> statement-breakpoint
CREATE INDEX "exports_status_idx" ON "exports" USING btree ("status");