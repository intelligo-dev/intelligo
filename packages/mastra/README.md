# @intelligo-dev/mastra

An optional bridge from a native Mastra agent to the execution boundary.

Part of [Intelligo](https://intelligo.dev), an application framework and
operational platform for vertical AI SaaS products. Every `@intelligo-dev/*`
package is released at one version and shares one database schema;
`pnpm dlx @intelligo-dev/cli@beta create my-app` installs the set an
application needs. Documentation:
[intelligo.dev/docs/packages/mastra](https://intelligo.dev/docs/packages/mastra).

## Install

```bash
pnpm add @intelligo-dev/mastra@beta
```

`@mastra/core` 1.x is an optional peer dependency and **nothing here imports
it** — the agent is typed structurally, so the bridge stays removable and the
agent stays native. What this package adds is the recording.

## Use

```ts
import { runWithExecution } from "@intelligo-dev/mastra";
import { executions } from "@/lib/intelligo";

const result = await runWithExecution(
  { executions, workspaceId, userId, capability: "support.reply" },
  () => supportAgent.generate(messages) // native Mastra, untouched
);
```

`runWithExecution` opens an execution, runs the agent and settles what it
cost, reading usage and the model from whatever shape the provider reported.
`executions` is the instance the composition root builds with
`createExecutions` from
[`@intelligo-dev/executions`](https://www.npmjs.com/package/@intelligo-dev/executions);
naming the `model` sizes the credit hold admission takes.

When entitlement refuses, it throws an `ExecutionRefusedError` carrying the
`executionId` and the port's `reasonCode`, so a refusal cannot be mistaken for
an empty result. An error from the run itself is recorded, the hold is
released, and the error is rethrown unchanged — the caller still sees Mastra's
own.

## Streaming

A stream's usage is known only once it ends, so `streamWithExecution` returns
the native stream at once, with the two ways a stream finishes:

```ts
import { streamWithExecution } from "@intelligo-dev/mastra";

const { stream, settle, abort } = await streamWithExecution(
  { executions, workspaceId, userId, capability: "support.reply" },
  () => supportAgent.stream(messages)
);
```

`settle(result?)` records usage when the stream finishes; `abort(error?)` is
for a client disconnect or a timeout. Both are idempotent through the
execution, so a route can wire every one of its finish, error and abort hooks
without racing itself.

## Licence

Apache-2.0
