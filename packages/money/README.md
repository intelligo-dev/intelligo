# @intelligo-dev/money

Money as an amount and a currency, in one unit, with no ambient exchange rate.

Part of [Intelligo](https://github.com/intelligo-mn/framework), an application
framework and operational platform for vertical AI SaaS products. This package
is published from that repository and is not meant to be used on its own.

## Install

```bash
pnpm add @intelligo-dev/money
```

## Why

An amount in a bare `number` is how a credit pack came to grant 100,000 of one
unit for $1.01 of another. Here the currency travels with the amount, `add`
refuses to mix two, and `convert` takes an explicit rate.

Amounts are **micros** — millionths of one major unit. A chat turn on a cheap
model costs about $0.0019 of provider time, which whole cents would round with
a 35% error on every request.

## Use

```ts
import {
  fromMajor,
  multiply,
  toMinor,
  formatMoney,
} from "@intelligo-dev/money";

const raw = fromMajor(0.00185, "USD");
const charged = multiply(raw, 4); // margin
toMinor(charged); // cents, rounded up
formatMoney(charged, "en-US");
```

`toMinor` knows the zero-decimal currencies (JPY, MNT, …) and the
three-decimal ones (KWD, …), which is the difference between charging ¥1,000
and ¥100,000.

## Licence

Apache-2.0
