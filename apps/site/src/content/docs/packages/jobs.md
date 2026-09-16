---
title: "@intelligo-dev/jobs"
description: "A Postgres-backed job queue. No Redis."
order: 8
label: jobs
---

## Install

```bash
pnpm add @intelligo-dev/jobs
```

Enqueue, claim with `FOR UPDATE SKIP LOCKED`, retry with backoff, prune. One
fewer moving part in an operational stack that already has Postgres.

[npm](https://www.npmjs.com/package/@intelligo-dev/jobs) · [source](https://github.com/intelligo-mn/framework/tree/main/packages/jobs)
