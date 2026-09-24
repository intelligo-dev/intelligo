ALTER TABLE "rate_limit_entries" DROP CONSTRAINT "rate_limit_entries_workspace_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "usage_records" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "rate_limit_entries" ADD COLUMN "window_seconds" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "price_micros" bigint;