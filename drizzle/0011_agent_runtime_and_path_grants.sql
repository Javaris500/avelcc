CREATE TYPE "public"."agent_runtime" AS ENUM('model', 'human', 'code');--> statement-breakpoint
ALTER TABLE "agent_templates" ADD COLUMN "append_only_paths" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_templates" ADD COLUMN "readonly_paths" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_templates" ADD COLUMN "runtime" "agent_runtime" DEFAULT 'model' NOT NULL;--> statement-breakpoint
ALTER TABLE "roster_entries" ADD COLUMN "append_only_paths" text[];--> statement-breakpoint
ALTER TABLE "roster_entries" ADD COLUMN "readonly_paths" text[];