# Required — the app will not boot without these.
DATABASE_URL=
# Driver is chosen from the URL (Neon hosts get the WebSocket driver,
# everything else node-postgres). Force it with pg | neon-serverless.
# INTELLIGO_DB_DRIVER=
BETTER_AUTH_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Which product's plans the billing engine bills against. Your
# composition root also sets this via setDefaultProductSlug(); the
# variable is here so CLI tooling can check it without booting the app.
INTELLIGO_BILLING_PRODUCT=__APP_SLUG__

# Stripe: the webhook endpoint at /api/webhooks/stripe verifies with this.
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Bearer token your scheduler sends to /api/cron/maintenance
# (`intelligo add maintenance`). At least 32 characters.
CRON_SECRET=

# Comma-separated emails allowed to reach the Intelligo admin console.
# Closed by default: with no value, nobody is a platform admin.
PLATFORM_ADMIN_EMAILS=
