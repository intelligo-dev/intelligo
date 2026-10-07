CREATE TABLE "rate_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limits_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "trial_credits" DROP CONSTRAINT "trial_credits_workspace_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "trial_credits" ALTER COLUMN "workspace_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "actor_email" text;--> statement-breakpoint
ALTER TABLE "trial_credits" ADD CONSTRAINT "trial_credits_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_share_token_idx" ON "conversations" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX "usage_records_workspace_request_idx" ON "usage_records" USING btree ("workspace_id","request_id");--> statement-breakpoint
-- Each audit row names its actor's email as it was when the row was
-- written. `actor_id` is cleared when the user is deleted; the email
-- is what keeps "who did this" answerable afterwards. A row inserted
-- with an email keeps it.
CREATE OR REPLACE FUNCTION public.audit_events_snapshot_actor() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
	IF NEW.actor_email IS NULL AND NEW.actor_id IS NOT NULL THEN
		SELECT email INTO NEW.actor_email FROM public.users WHERE id = NEW.actor_id;
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_events_snapshot_actor BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.audit_events_snapshot_actor();
--> statement-breakpoint
-- The append-only rule, now also holding the actor's email fixed: the
-- one UPDATE that passes is still the database's own ON DELETE SET
-- NULL, which clears a reference and touches nothing else.
CREATE OR REPLACE FUNCTION public.audit_events_block_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
	IF TG_OP = 'UPDATE'
		AND (NEW.workspace_id IS NULL OR NEW.workspace_id = OLD.workspace_id)
		AND (NEW.actor_id IS NULL OR NEW.actor_id = OLD.actor_id)
		AND (NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.actor_id IS DISTINCT FROM OLD.actor_id)
		AND NEW.id = OLD.id
		AND NEW.actor_email IS NOT DISTINCT FROM OLD.actor_email
		AND NEW.actor_kind = OLD.actor_kind
		AND NEW.action = OLD.action
		AND NEW.resource_kind = OLD.resource_kind
		AND NEW.resource_id IS NOT DISTINCT FROM OLD.resource_id
		AND NEW.outcome = OLD.outcome
		AND NEW.metadata IS NOT DISTINCT FROM OLD.metadata
		AND NEW.created_at = OLD.created_at
	THEN
		RETURN NEW;
	END IF;
	RAISE EXCEPTION 'audit_events is append-only'
		USING ERRCODE = 'P0001', HINT = 'INSERT new audit rows; do not UPDATE or DELETE existing ones.';
END;
$$;
--> statement-breakpoint
-- Row triggers do not see TRUNCATE, which would empty either log in one
-- statement. A role that must clear them drops the trigger first, which
-- is itself a change someone has to make on purpose.
CREATE OR REPLACE FUNCTION public.audit_block_truncate() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
	RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
		USING ERRCODE = 'P0001', HINT = 'Audit rows are never removed in bulk.';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON public.audit_events FOR EACH STATEMENT EXECUTE FUNCTION public.audit_block_truncate();
--> statement-breakpoint
CREATE TRIGGER user_memory_audit_no_truncate BEFORE TRUNCATE ON public.user_memory_audit FOR EACH STATEMENT EXECUTE FUNCTION public.audit_block_truncate();
