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

# Where users reach the app. Auth callbacks, email links and redirects
# are built from it, so production needs the public https URL.
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Which product's plans the billing engine bills against. Your
# composition root also sets this via setDefaultProductSlug(); the
# variable is here so CLI tooling can check it without booting the app.
INTELLIGO_BILLING_PRODUCT=__APP_SLUG__

# ============================================
# Optional — everything works locally without these.
# ============================================

# Sign in with Google or GitHub. A provider's button appears once both
# of its values are set; the callback URL to register with the provider
# is NEXT_PUBLIC_APP_URL + /api/auth/callback/google (or /github).
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=

# Email. Without a provider, emails (verification, invitations, reset
# links) are printed to the server console, and sign-ups are not held
# for email verification.
# RESEND_API_KEY=
# EMAIL_FROM=noreply@example.com
# Loops sends by template id instead of HTML: map each template with
# LOOPS_TRANSACTIONAL_ID_<KEY>, e.g. LOOPS_TRANSACTIONAL_ID_VERIFY_EMAIL.
# LOOPS_API_KEY=
# With both keys set Resend wins; force one with resend | loops | console.
# EMAIL_PROVIDER=

# Stripe. Billing pages say "not configured" until these are set; the
# webhook at /api/webhooks/stripe verifies with the secret.
# STRIPE_SECRET_KEY=
# STRIPE_WEBHOOK_SECRET=

# Which registered payment provider serves payments outside Stripe
# (registerPaymentProvider in the composition root). Defaults to the
# in-memory mock, which production refuses.
# PAYMENT_MODE=

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
