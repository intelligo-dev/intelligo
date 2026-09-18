# @intelligo-dev/jobs

A Postgres-backed job queue. No Redis.

Part of [Intelligo](https://github.com/intelligo-mn/framework), an application
framework and operational platform for vertical AI SaaS products. This package
is published from that repository and is not meant to be used on its own.

## Install

```bash
pnpm add @intelligo-dev/jobs@beta
```

Enqueue, claim with `FOR UPDATE SKIP LOCKED`, retry with backoff, prune. One
fewer moving part in an operational stack that already has Postgres.

## Licence

Apache-2.0
