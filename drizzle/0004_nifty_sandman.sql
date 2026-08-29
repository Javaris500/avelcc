CREATE TYPE "public"."mission_cut" AS ENUM('horizontal', 'vertical');--> statement-breakpoint
CREATE TYPE "public"."mission_cut_source" AS ENUM('derived', 'overridden');--> statement-breakpoint
CREATE TYPE "public"."playbook_deliverable" AS ENUM('pr', 'report', 'recommendation');--> statement-breakpoint
CREATE TABLE "missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"type" text NOT NULL,
	"brief" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sprint_n" integer DEFAULT 1 NOT NULL,
	"status" text NOT NULL,
	"cut" "mission_cut" NOT NULL,
	"cut_source" "mission_cut_source" DEFAULT 'derived' NOT NULL,
	"cut_rationale" text,
	"repo_url" text,
	"spend_ceiling_usd" numeric(12, 2),
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "missions_override_requires_rationale" CHECK ("missions"."cut_source" <> 'overridden' or ("missions"."cut_rationale" is not null and length(btrim("missions"."cut_rationale")) > 0)),
	CONSTRAINT "missions_sprint_n_positive" CHECK ("missions"."sprint_n" >= 1)
);
--> statement-breakpoint
CREATE TABLE "playbooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mission_type" text NOT NULL,
	"name" text NOT NULL,
	"waves_applicable" text[] DEFAULT '{}' NOT NULL,
	"gates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deliverable" "playbook_deliverable" NOT NULL,
	"required_fields" text[] DEFAULT '{}' NOT NULL,
	"default_preset_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playbooks_version_positive" CHECK ("playbooks"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "roster_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mission_id" uuid NOT NULL,
	"agent_template_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"waves" text[] DEFAULT '{}' NOT NULL,
	"monitor_priority" integer,
	"customized_md" text,
	"writable_paths" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roster_entries_monitor_priority_positive" CHECK ("roster_entries"."monitor_priority" is null or "roster_entries"."monitor_priority" >= 0)
);
--> statement-breakpoint
CREATE TABLE "roster_entry_skills" (
	"roster_entry_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	CONSTRAINT "roster_entry_skills_roster_entry_id_skill_id_pk" PRIMARY KEY("roster_entry_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "roster_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbooks" ADD CONSTRAINT "playbooks_default_preset_id_roster_presets_id_fk" FOREIGN KEY ("default_preset_id") REFERENCES "public"."roster_presets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_agent_template_id_agent_templates_id_fk" FOREIGN KEY ("agent_template_id") REFERENCES "public"."agent_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_entry_skills" ADD CONSTRAINT "roster_entry_skills_roster_entry_id_roster_entries_id_fk" FOREIGN KEY ("roster_entry_id") REFERENCES "public"."roster_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_entry_skills" ADD CONSTRAINT "roster_entry_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "missions_engagement_idx" ON "missions" USING btree ("engagement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "playbooks_mission_type_live_unique" ON "playbooks" USING btree ("mission_type") WHERE "playbooks"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "playbooks_default_preset_idx" ON "playbooks" USING btree ("default_preset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roster_entries_mission_agent_unique" ON "roster_entries" USING btree ("mission_id","agent_template_id");--> statement-breakpoint
CREATE INDEX "roster_entries_mission_idx" ON "roster_entries" USING btree ("mission_id");--> statement-breakpoint
CREATE INDEX "roster_entries_agent_template_idx" ON "roster_entries" USING btree ("agent_template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roster_presets_name_live_unique" ON "roster_presets" USING btree ("name") WHERE "roster_presets"."deleted_at" is null;