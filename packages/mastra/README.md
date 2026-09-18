# @intelligo-dev/mastra

An optional bridge from a native Mastra agent to the execution boundary.

Part of [Intelligo](https://github.com/intelligo-mn/framework), an application
framework and operational platform for vertical AI SaaS products. This package
is published from that repository and is not meant to be used on its own.

## Install

```bash
pnpm add @intelligo-dev/mastra@beta
```

`@mastra/core` is an optional peer dependency and **nothing here imports it** —
the bridge stays removable and the agent stays native. What this
package adds is the recording: `runWithExecution` opens an execution, runs the
agent, and settles what it cost.

## Licence

Apache-2.0
