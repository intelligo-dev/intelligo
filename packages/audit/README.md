# @intelligo-dev/audit

Append-only audit events for multi-tenant apps, with a Postgres trigger that refuses every update and delete.

Part of [Intelligo](https://intelligo.dev), an application framework and
operational platform for vertical AI SaaS products. Every `@intelligo-dev/*`
package is released at one version and shares one database schema;
`pnpm dlx @intelligo-dev/cli@beta create my-app` installs the set an
application needs. Documentation:
[intelligo.dev/docs/packages/audit](https://intelligo.dev/docs/packages/audit).

## Install

```bash
pnpm add @intelligo-dev/audit@beta drizzle-orm
```

`drizzle-orm` is a peer. The `audit_events` table and its trigger are part of
the framework's schema, which `intelligo migrate` from
[`@intelligo-dev/cli`](https://www.npmjs.com/package/@intelligo-dev/cli)
applies.

## Use

```ts
import { recordAuditEvent } from "@intelligo-dev/audit";

await recordAuditEvent({
  workspaceId,
  actorId: user.id,
  action: "member.removed",
  resourceKind: "member",
  resourceId: memberId,
  metadata: { role: "admin" },
});
```

An event with no `actorId` is a system actor's — a cron, a webhook, the job
runner; `actorKind: "support"` marks an operator acting on a tenant. `outcome`
is `"ok"` unless the caller says `"failed"`.

`recordAuditEvent` never throws — an audit failure must not fail the action it
records. `recordAuditEventOrThrow` exists for the callers where the record _is_
the action: impersonation, a destructive support operation.

`queryAuditEvents({ workspaceId, action, resourceKind, resourceId, before, limit })`
reads the trail most recent first, paginated by `before`.

## Append-only, in the database

`audit_events` refuses `UPDATE` and `DELETE` at the database level, with one
exception: the `ON DELETE SET NULL` the foreign keys perform, so deleting a
workspace does not require deleting its trail.

## Sinks

```ts
import { registerAuditSink } from "@intelligo-dev/audit";

registerAuditSink("siem", async (event) => {
  await ship(event);
});
```

A sink registered from the composition root receives every event after it is
durably recorded, with failure isolation: an exporter with an expired
credential breaks neither the audited operation nor the other sinks. It is how
tamper-evidence, a retention policy or a SIEM export attaches without this
package knowing about it.

## Licence

Apache-2.0
