CREATE TYPE "public"."agent_kind" AS ENUM('horizontal', 'feature');--> statement-breakpoint
CREATE TYPE "public"."agent_team" AS ENUM('frontend', 'backend', 'qa', 'root');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."engagement_status" AS ENUM('active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."skill_type" AS ENUM('knowledge', 'capability');--> statement-breakpoint
CREATE TABLE "agent_template_skills" (
	"agent_template_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	CONSTRAINT "agent_template_skills_agent_template_id_skill_id_pk" PRIMARY KEY("agent_template_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "agent_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" "agent_kind" NOT NULL,
	"engagement_id" uuid,
	"team" "agent_team" NOT NULL,
	"wave_defaults" text[] DEFAULT '{}' NOT NULL,
	"identity_md" text NOT NULL,
	"depth_md" text,
	"writable_paths" text[] DEFAULT '{}' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_templates_slug_engagement_unique" UNIQUE("slug","engagement_id")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" "client_status" DEFAULT 'active' NOT NULL,
	"primary_contact" text,
	"notes_md" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engagements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"scope_md" text,
	"status" "engagement_status" DEFAULT 'active' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"content_md" text NOT NULL,
	"avel_enhancement_md" text,
	"type" "skill_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"recommended_for" text[] DEFAULT '{}' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "agent_template_skills" ADD CONSTRAINT "agent_template_skills_agent_template_id_agent_templates_id_fk" FOREIGN KEY ("agent_template_id") REFERENCES "public"."agent_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_template_skills" ADD CONSTRAINT "agent_template_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_templates" ADD CONSTRAINT "agent_templates_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_source_id_skill_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."skill_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_templates_engagement_idx" ON "agent_templates" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "engagements_client_idx" ON "engagements" USING btree ("client_id");