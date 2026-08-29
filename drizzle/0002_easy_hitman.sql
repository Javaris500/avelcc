ALTER TABLE "agent_templates" DROP CONSTRAINT "agent_templates_slug_engagement_unique";--> statement-breakpoint
ALTER TABLE "skills" DROP CONSTRAINT "skills_slug_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "agent_templates_slug_engagement_live_unique" ON "agent_templates" USING btree ("slug","engagement_id") WHERE "agent_templates"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_templates_slug_horizontal_unique" ON "agent_templates" USING btree ("slug") WHERE "agent_templates"."engagement_id" is null and "agent_templates"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "skills_slug_live_unique" ON "skills" USING btree ("slug") WHERE "skills"."deleted_at" is null;