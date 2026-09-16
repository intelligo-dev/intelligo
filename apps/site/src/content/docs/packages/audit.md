---
title: "@intelligo-dev/audit"
description: "Append-only audit events, enforced by the database."
order: 7
label: audit
---

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

[npm](https://www.npmjs.com/package/@intelligo-dev/audit) · [source](https://github.com/intelligo-mn/framework/tree/main/packages/audit)
