# ============================================
# Required — the app will not boot without these.
# ============================================

# Postgres with the pgvector extension (Neon, Supabase, RDS, or local).
DATABASE_URL=
# Driver is chosen from the URL (Neon hosts get the WebSocket driver,
# everything else node-postgres). Force it with pg | neon-serverless.
# INTELLIGO_DB_DRIVER=

# At least 32 characters. Generate with: openssl rand -base64 32
BETTER_AUTH_SECRET=

NEXT_PUBLIC_APP_URL=http://localhost:3000

# Which product's plans the billing engine bills against. Your
# composition root also sets this via setDefaultProductSlug(); the
# variable is here so CLI tooling can check it without booting the app.
INTELLIGO_BILLING_PRODUCT=__APP_SLUG__

# ============================================
# Optional — everything works locally without these.
# ============================================

# Email. Without a provider, emails (verification, invitations, reset
# links) are printed to the server console.
# RESEND_API_KEY=
# EMAIL_FROM=noreply@example.com

# Stripe. Billing pages say "not configured" until these are set; the
# webhook at /api/webhooks/stripe verifies with the secret.
# STRIPE_SECRET_KEY=
# STRIPE_WEBHOOK_SECRET=

# AI providers. Chat runs on a built-in stub model until lib/chat-model.ts
# names a real one.
# OPENAI_API_KEY=
# ANTHROPIC_API_KEY=
# GOOGLE_GENERATIVE_AI_API_KEY=

# Bearer token your scheduler sends to /api/cron/maintenance
# (`intelligo add maintenance`). At least 32 characters.
# CRON_SECRET=

# Comma-separated emails allowed to reach the Intelligo admin console.
# Closed by default: with no value, nobody is a platform admin.
# PLATFORM_ADMIN_EMAILS=
