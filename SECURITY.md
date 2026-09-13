# Security policy

## Reporting a vulnerability

Report security issues privately — **do not open a public issue**.

Use either channel:

- a [private security advisory](https://github.com/intelligo-mn/framework/security/advisories/new)
  on GitHub, or
- email to **security@intelligo.dev**.

Include:

- what the issue is and which package or route it affects,
- the steps or request needed to reproduce it,
- what an attacker gets from it (data read, data written, access gained).

You will get an acknowledgement within three working days. If a report
is valid you will be told when a fix ships and, unless you ask
otherwise, credited in the release notes.

## What is in scope

The published `@intelligo-dev/*` packages and the reference application.
The parts most worth your attention, because getting them wrong is how
a tenant sees another tenant's data or a customer is charged wrongly:

- **tenant isolation** — any query reachable from a request that is not
  scoped by `workspaceId`, or by `userId` where the data is user-private;
- **authorization** — a platform-admin surface reachable through a
  workspace role, or a workspace role escalating itself;
- **the execution boundary** — a way to consume model tokens without an
  execution record, to settle the same execution twice, or to keep a
  credit hold open indefinitely;
- **impersonation** — acting as a user without an audit event, or a
  session that outlives its 30-minute cap;
- **webhooks** — accepting a Stripe event without a valid signature, or
  replaying one.

## What is out of scope

Findings that require a platform administrator to already be
compromised, denial of service through ordinary volume, missing
hardening headers with no demonstrated impact, and reports produced
solely by an automated scanner with no working reproduction.

## Supported versions

During the 1.0 beta, only the newest `@intelligo-dev/*@beta` release
receives security fixes. Once 1.0 is out, the latest minor release of
each published package does.
