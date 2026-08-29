# Required — the app will not boot without these.
DATABASE_URL=
BETTER_AUTH_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Which product's plans the billing engine bills against. Your
# composition root also sets this via setDefaultProductSlug(); the
# variable is here so CLI tooling can check it without booting the app.
INTELLIGO_BILLING_PRODUCT=__APP_SLUG__

# Comma-separated emails allowed to reach the Intelligo admin console.
# Closed by default: with no value, nobody is a platform admin.
PLATFORM_ADMIN_EMAILS=
