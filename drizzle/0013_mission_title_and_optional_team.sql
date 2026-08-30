ALTER TABLE "agent_templates" ALTER COLUMN "team" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "agent_templates" ADD CONSTRAINT "agent_templates_horizontal_requires_team" CHECK (("agent_templates"."kind" = 'horizontal') = ("agent_templates"."team" IS NOT NULL));