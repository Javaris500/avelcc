ALTER TABLE "missions" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "missions" ALTER COLUMN "cut" DROP NOT NULL;