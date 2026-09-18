-- A database built by the framework's pre-1.0 migration chain is adopted
-- at 0000_baseline without running it. That chain never quite matched
-- the schema the code was written against — every environment used to
-- be provisioned with `db:push` — so this brings such a database to the
-- baseline's shape. On a database created from the baseline every
-- statement is a no-op.

-- conversations.metadata was created as text; the code reads and writes
-- it as jsonb.
DO $$
BEGIN
	IF (SELECT data_type FROM information_schema.columns
	    WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'metadata') = 'text' THEN
		ALTER TABLE "conversations" ALTER COLUMN "metadata" TYPE jsonb USING NULLIF("metadata", '')::jsonb;
	END IF;
END $$;
--> statement-breakpoint
-- Deleting a user keeps the invitations they sent, without an inviter.
ALTER TABLE "invitation" ALTER COLUMN "inviter_id" DROP NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invitation_inviter_id_users_id_fk' AND confdeltype <> 'n') THEN
		ALTER TABLE "invitation" DROP CONSTRAINT "invitation_inviter_id_users_id_fk";
		ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_users_id_fk"
			FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE SET NULL;
	END IF;
END $$;
--> statement-breakpoint
-- Deleting a workspace keeps its finance events for the books.
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'finance_events_workspace_id_organization_id_fk' AND confdeltype <> 'n') THEN
		ALTER TABLE "finance_events" DROP CONSTRAINT "finance_events_workspace_id_organization_id_fk";
		ALTER TABLE "finance_events" ADD CONSTRAINT "finance_events_workspace_id_organization_id_fk"
			FOREIGN KEY ("workspace_id") REFERENCES "organization"("id") ON DELETE SET NULL;
	END IF;
END $$;
--> statement-breakpoint
-- One quota row per user per workspace. The old chain made this a
-- unique index of the same name, which serves ON CONFLICT equally.
DO $$
BEGIN
	IF to_regclass('public.user_quotas_user_workspace_unique') IS NULL THEN
		ALTER TABLE "user_quotas" ADD CONSTRAINT "user_quotas_user_workspace_unique" UNIQUE ("user_id", "workspace_id");
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_workspace_user_idx" ON "conversations" USING btree ("workspace_id", "user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_user_id_idx" ON "documents" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "member_organization_user_uniq" ON "member" USING btree ("organization_id", "user_id");
