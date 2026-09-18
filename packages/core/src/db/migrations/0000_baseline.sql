-- The framework's schema as of 1.0: every table Intelligo owns, in one
-- migration. It replaces the chain that grew before the release (see
-- legacy-chain.json and the README); a database that ran that whole
-- chain is adopted by `intelligo migrate` without running this file.
--
-- pgvector backs the identity graph's memory embeddings.
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb NOT NULL,
	"system_prompt_key" text NOT NULL,
	"system_prompt" jsonb,
	"model_config" jsonb,
	"icon" text NOT NULL,
	"default_model" text NOT NULL,
	"max_steps" integer NOT NULL,
	"context_window_size" integer NOT NULL,
	"tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"base_path" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_system" boolean DEFAULT true NOT NULL,
	"feature_key" text,
	"color" text DEFAULT 'bg-gray-500' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"media_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"extracted_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"title" text,
	"model_id" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"kind" text DEFAULT 'text' NOT NULL,
	"metadata" jsonb,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	CONSTRAINT "documents_id_created_at_pk" PRIMARY KEY("id","created_at")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text,
	"parts" text NOT NULL,
	"attachments" text,
	"tool_invocations" text,
	"token_count" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"chat_id" text NOT NULL,
	"message_id" text NOT NULL,
	"is_upvoted" boolean NOT NULL,
	CONSTRAINT "votes_chat_id_message_id_pk" PRIMARY KEY("chat_id","message_id")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"inviter_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"logo" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"impersonated_by" text,
	"active_organization_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"onboarding_step" text,
	"preferred_language" text DEFAULT 'en' NOT NULL,
	"role" text,
	"banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"ban_expires" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"usd_rate_micros" bigint DEFAULT 1000000 NOT NULL,
	"margin_bp" integer DEFAULT 40000 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_balances" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"balance_micros" bigint DEFAULT 0 NOT NULL,
	"total_purchased_micros" bigint DEFAULT 0 NOT NULL,
	"total_used_micros" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credit_balances_workspace_id_unique" UNIQUE("workspace_id")
);
--> statement-breakpoint
CREATE TABLE "credit_purchases" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"price_minor" integer,
	"price_currency" text,
	"granted_micros" bigint,
	"granted_currency" text,
	"stripe_payment_intent_id" text,
	"stripe_checkout_session_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"request_id" text NOT NULL,
	"estimated_micros" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"settled_at" timestamp,
	CONSTRAINT "credit_reservations_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "finance_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"stripe_event_id" text NOT NULL,
	"type" text NOT NULL,
	"amount_minor" integer,
	"currency" text DEFAULT 'USD',
	"metadata" text,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "finance_events_stripe_event_id_unique" UNIQUE("stripe_event_id")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"price_monthly" integer NOT NULL,
	"price_yearly" integer NOT NULL,
	"stripe_price_id_monthly" text,
	"stripe_price_id_yearly" text,
	"features" text NOT NULL,
	"limits" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plans_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"billing_mode" text DEFAULT 'subscription' NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id"),
	CONSTRAINT "subscriptions_workspace_id_unique" UNIQUE("workspace_id")
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"enabled_plans" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "feature_flags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "user_facts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"category" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"confidence" double precision NOT NULL,
	"importance" integer DEFAULT 5 NOT NULL,
	"source_product" text,
	"source_session_id" text,
	"source_message_id" text,
	"extraction_method" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_confirmed_at" timestamp,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user_memories" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"source_product" text,
	"source_session_id" text,
	"source_message_ids" text[],
	"importance" integer DEFAULT 5 NOT NULL,
	"decay_factor" double precision DEFAULT 1 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_memory_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" text NOT NULL,
	"action" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_id" text,
	"before_value" jsonb,
	"after_value" jsonb,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profile_snapshots" (
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"version" integer NOT NULL,
	"summary" text NOT NULL,
	"summary_en" text,
	"summary_mn" text,
	"facts_digest" jsonb NOT NULL,
	"active_goals" jsonb,
	"personality_signals" jsonb,
	"relationship_notes" jsonb,
	"synthesized_by_model" text,
	"synthesized_at" timestamp DEFAULT now() NOT NULL,
	"next_synthesis_at" timestamp,
	"trigger_reason" text,
	CONSTRAINT "user_profile_snapshots_user_id_workspace_id_pk" PRIMARY KEY("user_id","workspace_id")
);
--> statement-breakpoint
CREATE TABLE "monthly_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"allowance_used_micros" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_usage_workspace_period_unique" UNIQUE("workspace_id","period_start")
);
--> statement-breakpoint
CREATE TABLE "notification_history" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"type" text NOT NULL,
	"period_key" text NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"channel" text DEFAULT 'console' NOT NULL,
	"metadata" text,
	CONSTRAINT "notification_history_dedup_unique" UNIQUE("workspace_id","type","period_key")
);
--> statement-breakpoint
CREATE TABLE "rate_limit_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"endpoint" text DEFAULT 'chat' NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"minute_bucket" timestamp NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "rate_limit_entries_unique_bucket_idx" UNIQUE("workspace_id","endpoint","minute_bucket")
);
--> statement-breakpoint
CREATE TABLE "trial_credits" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"initial_credits" integer DEFAULT 100000 NOT NULL,
	"credits_used" integer DEFAULT 0 NOT NULL,
	"credits_remaining" integer DEFAULT 100000 NOT NULL,
	"initial_micros" bigint DEFAULT 0 NOT NULL,
	"used_micros" bigint DEFAULT 0 NOT NULL,
	"remaining_micros" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"provisioned_at" timestamp DEFAULT now() NOT NULL,
	"trial_end_date" timestamp,
	"depleted_at" timestamp,
	"converted_at" timestamp,
	"created_by_ip" text,
	"created_by_email" text,
	"normalized_email" text,
	CONSTRAINT "trial_credits_workspace_id_unique" UNIQUE("workspace_id")
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"model" text,
	"agent" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"provider_cost_micros" bigint DEFAULT 0 NOT NULL,
	"margin_bp" integer DEFAULT 0 NOT NULL,
	"usd_rate_micros" bigint DEFAULT 0 NOT NULL,
	"charged_micros" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"request_id" text,
	"execution_id" text,
	"conversation_id" text,
	"metadata" text,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_quotas" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"usage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"total_cost_usd" real DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_quotas_user_workspace_unique" UNIQUE("user_id","workspace_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"actor_id" text,
	"actor_kind" text DEFAULT 'user' NOT NULL,
	"action" text NOT NULL,
	"resource_kind" text NOT NULL,
	"resource_id" text,
	"outcome" text DEFAULT 'ok' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "executions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text,
	"capability" text NOT NULL,
	"request_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"total_tokens" integer,
	"charged_micros" bigint,
	"reserved_micros" bigint,
	"currency" text,
	"refusal_reason" text,
	"error_message" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"duration_ms" integer,
	"metadata" jsonb,
	CONSTRAINT "executions_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"kind" text NOT NULL,
	"payload" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_chat_id_conversations_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_balances" ADD CONSTRAINT "credit_balances_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_purchases" ADD CONSTRAINT "credit_purchases_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_events" ADD CONSTRAINT "finance_events_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_facts" ADD CONSTRAINT "user_facts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_facts" ADD CONSTRAINT "user_facts_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_memories" ADD CONSTRAINT "user_memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_memories" ADD CONSTRAINT "user_memories_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_memory_audit" ADD CONSTRAINT "user_memory_audit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_memory_audit" ADD CONSTRAINT "user_memory_audit_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile_snapshots" ADD CONSTRAINT "user_profile_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile_snapshots" ADD CONSTRAINT "user_profile_snapshots_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_usage" ADD CONSTRAINT "monthly_usage_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_history" ADD CONSTRAINT "notification_history_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_limit_entries" ADD CONSTRAINT "rate_limit_entries_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_credits" ADD CONSTRAINT "trial_credits_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_quotas" ADD CONSTRAINT "user_quotas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_quotas" ADD CONSTRAINT "user_quotas_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_workspace_id_idx" ON "attachments" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "attachments_conversation_id_idx" ON "attachments" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_storage_key_idx" ON "attachments" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "conversations_workspace_id_idx" ON "conversations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "conversations_user_id_idx" ON "conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversations_workspace_updated_idx" ON "conversations" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "conversations_workspace_user_idx" ON "conversations" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "documents_workspace_id_idx" ON "documents" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "documents_user_id_idx" ON "documents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_id_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "votes_message_id_idx" ON "votes" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitation_organization_id_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_organization_id_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_user_id_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_organization_user_uniq" ON "member" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role") WHERE "users"."role" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "credit_purchases_workspace_id_idx" ON "credit_purchases" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "credit_reservations_active_idx" ON "credit_reservations" USING btree ("workspace_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "subscriptions_workspace_id_idx" ON "subscriptions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "user_facts_user_idx" ON "user_facts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_facts_workspace_idx" ON "user_facts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "user_facts_category_idx" ON "user_facts" USING btree ("workspace_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "user_facts_user_workspace_category_key_uniq" ON "user_facts" USING btree ("user_id","workspace_id","category","key");--> statement-breakpoint
CREATE INDEX "user_memories_user_idx" ON "user_memories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_memories_workspace_idx" ON "user_memories" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "user_memories_kind_idx" ON "user_memories" USING btree ("workspace_id","kind");--> statement-breakpoint
CREATE INDEX "user_memory_audit_user_idx" ON "user_memory_audit" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_memory_audit_workspace_idx" ON "user_memory_audit" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "user_memory_audit_target_idx" ON "user_memory_audit" USING btree ("target_kind","target_id");--> statement-breakpoint
CREATE INDEX "user_profile_snapshots_workspace_idx" ON "user_profile_snapshots" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "monthly_usage_workspace_id_idx" ON "monthly_usage" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "notification_history_workspace_id_idx" ON "notification_history" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "rate_limit_entries_window_idx" ON "rate_limit_entries" USING btree ("workspace_id","endpoint","requested_at");--> statement-breakpoint
CREATE INDEX "trial_credits_expiry_idx" ON "trial_credits" USING btree ("status","trial_end_date");--> statement-breakpoint
CREATE INDEX "trial_credits_normalized_email_idx" ON "trial_credits" USING btree ("normalized_email");--> statement-breakpoint
CREATE INDEX "usage_records_workspace_id_idx" ON "usage_records" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "usage_records_workspace_recorded_at_idx" ON "usage_records" USING btree ("workspace_id","recorded_at");--> statement-breakpoint
CREATE INDEX "usage_records_workspace_type_idx" ON "usage_records" USING btree ("workspace_id","type");--> statement-breakpoint
CREATE INDEX "usage_records_conversation_id_idx" ON "usage_records" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "usage_records_execution_id_idx" ON "usage_records" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "user_quotas_user_id_idx" ON "user_quotas" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_quotas_workspace_id_idx" ON "user_quotas" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_events_workspace_created_idx" ON "audit_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_action_idx" ON "audit_events" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_resource_idx" ON "audit_events" USING btree ("resource_kind","resource_id");--> statement-breakpoint
CREATE INDEX "executions_workspace_started_idx" ON "executions" USING btree ("workspace_id","started_at");--> statement-breakpoint
CREATE INDEX "executions_status_idx" ON "executions" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "executions_capability_idx" ON "executions" USING btree ("capability","started_at");--> statement-breakpoint
CREATE INDEX "jobs_claim_idx" ON "jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "jobs_kind_idx" ON "jobs" USING btree ("kind","status");--> statement-breakpoint
CREATE INDEX "jobs_workspace_idx" ON "jobs" USING btree ("workspace_id");
--> statement-breakpoint
-- Nearest-neighbour search over memory embeddings. HNSW keeps recall
-- good from the first row on, where IVFFlat needs a trained list count.
CREATE INDEX "user_memories_embedding_hnsw" ON "user_memories" USING hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64);
--> statement-breakpoint
-- The audit log is append-only. The one UPDATE that passes is the
-- database's own: ON DELETE SET NULL on workspace_id / actor_id runs as
-- an UPDATE of the row, so an update that only clears one or both of
-- those references, and touches nothing else, is allowed — otherwise a
-- workspace or user with any audit history could never be deleted.
CREATE OR REPLACE FUNCTION public.audit_events_block_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
	IF TG_OP = 'UPDATE'
		AND (NEW.workspace_id IS NULL OR NEW.workspace_id = OLD.workspace_id)
		AND (NEW.actor_id IS NULL OR NEW.actor_id = OLD.actor_id)
		AND (NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.actor_id IS DISTINCT FROM OLD.actor_id)
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
--> statement-breakpoint
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.audit_events_block_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.audit_events_block_mutation();
--> statement-breakpoint
-- Memory audit rows are append-only, with no exception.
CREATE OR REPLACE FUNCTION public.user_memory_audit_block_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
	RAISE EXCEPTION 'user_memory_audit is append-only'
		USING ERRCODE = 'P0001', HINT = 'INSERT new audit rows; do not UPDATE or DELETE existing ones.';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER user_memory_audit_no_update BEFORE UPDATE ON public.user_memory_audit FOR EACH ROW EXECUTE FUNCTION public.user_memory_audit_block_mutation();
--> statement-breakpoint
CREATE TRIGGER user_memory_audit_no_delete BEFORE DELETE ON public.user_memory_audit FOR EACH ROW EXECUTE FUNCTION public.user_memory_audit_block_mutation();
