CREATE TYPE "public"."export_target" AS ENUM('zip', 'github_pr', 'github_push');--> statement-breakpoint
CREATE TABLE "repo_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_url" text NOT NULL,
	"label" text,
	"allow_direct_push_to_default" boolean DEFAULT false NOT NULL,
	"default_target" "export_target",
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "repo_policies_repo_url_live_unique" ON "repo_policies" USING btree ("repo_url") WHERE "repo_policies"."deleted_at" is null;