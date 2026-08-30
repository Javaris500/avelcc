CREATE TYPE "public"."intake_status" AS ENUM('draft', 'proposed', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "intakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"status" "intake_status" DEFAULT 'draft' NOT NULL,
	"source_md" text,
	"proposed_brief" jsonb,
	"open_questions" text[] DEFAULT '{}' NOT NULL,
	"derived_cut" "mission_cut",
	"derived_cut_evidence" text,
	"suggested_preset_id" uuid,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"mission_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intakes_approved_has_mission" CHECK ("intakes"."status" <> 'approved' or ("intakes"."mission_id" is not null and "intakes"."approved_at" is not null)),
	CONSTRAINT "intakes_mission_requires_decision" CHECK ("intakes"."mission_id" is null or "intakes"."status" = 'approved')
);
--> statement-breakpoint
ALTER TABLE "intakes" ADD CONSTRAINT "intakes_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intakes" ADD CONSTRAINT "intakes_suggested_preset_id_roster_presets_id_fk" FOREIGN KEY ("suggested_preset_id") REFERENCES "public"."roster_presets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intakes" ADD CONSTRAINT "intakes_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "intakes_engagement_idx" ON "intakes" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "intakes_status_idx" ON "intakes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "intakes_mission_idx" ON "intakes" USING btree ("mission_id");