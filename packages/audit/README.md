# @intelligo-dev/audit

Append-only audit events, with a database trigger that means it.

Part of [Intelligo](https://github.com/intelligo-mn/framework), an application
framework and operational platform for vertical AI SaaS products. This package
is published from that repository and is not meant to be used on its own.

## Install

```bash
pnpm add @intelligo-dev/audit
```

`audit_events` refuses `UPDATE` and `DELETE` at the database level, with one
exception: the `ON DELETE SET NULL` the foreign keys perform, so deleting a
workspace does not require deleting its trail.

`recordAuditEvent` never throws — an audit failure must not fail the action it
records. `recordAuditEventOrThrow` exists for the callers where the record _is_
the action.

Sinks registered with `registerAuditSink` receive every event with failure
isolation, which is how a closed-source tamper-evidence module attaches without
this package knowing about it.

## Licence

Apache-2.0
