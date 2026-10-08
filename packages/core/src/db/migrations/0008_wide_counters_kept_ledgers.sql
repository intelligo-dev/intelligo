ALTER TABLE "user_memory_audit" DROP CONSTRAINT "user_memory_audit_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_memory_audit" DROP CONSTRAINT "user_memory_audit_workspace_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "usage_records" DROP CONSTRAINT "usage_records_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "credit_purchases" ALTER COLUMN "price_minor" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "finance_events" ALTER COLUMN "amount_minor" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "amount_minor" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "user_memory_audit" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_memory_audit" ALTER COLUMN "workspace_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "monthly_usage" ALTER COLUMN "tokens_used" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "user_memory_audit" ADD CONSTRAINT "user_memory_audit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_memory_audit" ADD CONSTRAINT "user_memory_audit_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- NOT VALID: the constraint holds for every row written from here on and
-- cascades deletes, without failing on rows that already name a user or
-- workspace that is gone.
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action NOT VALID;--> statement-breakpoint
CREATE INDEX "attachments_user_id_idx" ON "attachments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "accounts_provider_account_idx" ON "accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "finance_events_workspace_id_idx" ON "finance_events" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "trial_credits_created_by_ip_idx" ON "trial_credits" USING btree ("created_by_ip");--> statement-breakpoint
CREATE INDEX "usage_records_user_id_idx" ON "usage_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_workspace_id_idx" ON "notifications" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "audit_events_actor_id_idx" ON "audit_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "executions_user_id_idx" ON "executions" USING btree ("user_id");;--> statement-breakpoint
-- The append-only rule for the memory audit, with one UPDATE allowed: one
-- that only clears the columns that name or describe a person (the
-- subject, the workspace, the actor, the values and the reason) and
-- leaves every other column as it was. The database's own ON DELETE SET
-- NULL is such an update, and so is an erasure that clears the values.
CREATE OR REPLACE FUNCTION public.user_memory_audit_block_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
	IF TG_OP = 'UPDATE'
		AND (NEW.user_id IS NULL OR NEW.user_id = OLD.user_id)
		AND (NEW.workspace_id IS NULL OR NEW.workspace_id = OLD.workspace_id)
		AND (NEW.actor_id IS NULL OR NEW.actor_id = OLD.actor_id)
		AND (NEW.before_value IS NULL OR NEW.before_value = OLD.before_value)
		AND (NEW.after_value IS NULL OR NEW.after_value = OLD.after_value)
		AND (NEW.reason IS NULL OR NEW.reason = OLD.reason)
		AND (NEW.user_id, NEW.workspace_id, NEW.actor_id, NEW.before_value, NEW.after_value, NEW.reason)
			IS DISTINCT FROM (OLD.user_id, OLD.workspace_id, OLD.actor_id, OLD.before_value, OLD.after_value, OLD.reason)
		AND NEW.id = OLD.id
		AND NEW.target_kind = OLD.target_kind
		AND NEW.target_id = OLD.target_id
		AND NEW.action = OLD.action
		AND NEW.actor_kind = OLD.actor_kind
		AND NEW.created_at = OLD.created_at
	THEN
		RETURN NEW;
	END IF;
	RAISE EXCEPTION 'user_memory_audit is append-only'
		USING ERRCODE = 'P0001', HINT = 'INSERT new audit rows; do not UPDATE or DELETE existing ones.';
END;
$$;
--> statement-breakpoint
-- The append-only rule for audit_events, now also letting the actor's
-- email be cleared: an UPDATE passes when it only sets the workspace,
-- the actor or the actor's email to NULL and touches nothing else.
CREATE OR REPLACE FUNCTION public.audit_events_block_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
	IF TG_OP = 'UPDATE'
		AND (NEW.workspace_id IS NULL OR NEW.workspace_id = OLD.workspace_id)
		AND (NEW.actor_id IS NULL OR NEW.actor_id = OLD.actor_id)
		AND (NEW.actor_email IS NULL OR NEW.actor_email = OLD.actor_email)
		AND (NEW.workspace_id, NEW.actor_id, NEW.actor_email)
			IS DISTINCT FROM (OLD.workspace_id, OLD.actor_id, OLD.actor_email)
		AND NEW.id = OLD.id
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
