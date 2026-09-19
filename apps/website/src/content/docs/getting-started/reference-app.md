---
title: Explore the reference app
description: A complete workspace AI SaaS built from nothing but the public packages and registry blocks — clone the framework and run it.
order: 1
label: The reference app
---

The framework repository contains `apps/app`: a generic workspace AI product — sign-up, verification, login, the app shell, dashboard, team, billing, usage, notifications, chat with a stub model, and artifacts — built **only** from the published packages and installed registry items.

```bash
git clone https://github.com/intelligo-dev/intelligo
cd intelligo
docker compose up -d   # local PostgreSQL with pgvector
pnpm install
pnpm dev               # the reference app on :4002
```

Configure `DATABASE_URL` once in the repository-root `.env`; every workspace app reads it as a fallback.

## Generated, not written

The reference app is not maintained by hand. `pnpm app:regenerate` runs `intelligo create` and `shadcn add` for every item, then keeps only the files listed — each with a reason — in `scripts/reference-app-owned.json`. CI regenerates it on every run and fails on drift outside those seams.

That makes it the executable answer to "what does an installed Intelligo app look like": if a framework change needs a product-specific edit to this app to keep working, the boundary moved, and the change is wrong.
