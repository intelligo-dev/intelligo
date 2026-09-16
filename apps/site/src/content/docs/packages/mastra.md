---
title: "@intelligo-dev/mastra"
description: "An optional bridge from a native Mastra agent to the execution boundary."
order: 10
label: mastra
---

## Install

```bash
pnpm add @intelligo-dev/mastra
```

`@mastra/core` is an optional peer dependency and **nothing here imports it** —
the bridge stays removable and the agent stays native ([ADR-0003](https://github.com/intelligo-mn/framework/tree/main/docs/adr)). What this
package adds is the recording: `runWithExecution` opens an execution, runs the
agent, and settles what it cost.

[npm](https://www.npmjs.com/package/@intelligo-dev/mastra) · [source](https://github.com/intelligo-mn/framework/tree/main/packages/mastra)
