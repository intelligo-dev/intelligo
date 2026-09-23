/**
 * A plan's copy in the reader's language.
 *
 * The plan catalogue (`registerProductPlans`) holds one set of strings
 * per plan. A deployment translates them in its own `plans` message
 * namespace — `messages/<locale>/plans.json` — keyed by plan slug:
 *
 * ```json
 * {
 *   "pro": {
 *     "name": "Pro",
 *     "description": "For teams that ship every day.",
 *     "features": ["Unlimited chats", "Priority support"]
 *   }
 * }
 * ```
 *
 * Every key is optional: a key the locale does not define falls back to
 * the catalogue's string, and an app with no `plans.json` at all renders
 * the catalogue verbatim. Pass the translator of that namespace —
 * `useTranslations("plans")` in a client component,
 * `await getTranslations("plans")` on the server.
 */

/** The part of a next-intl translator this module reads. */
export interface PlanMessages {
  (key: string): string;
  has(key: string): boolean;
  raw(key: string): unknown;
}

export interface PlanCopy {
  name: string;
  description: string;
  features: string[];
}

function text(t: PlanMessages, key: string, fallback: string): string {
  return t.has(key) ? t(key) : fallback;
}

/** The plan's display name for `slug`, or `fallback` when untranslated. */
export function planName(
  t: PlanMessages,
  slug: string,
  fallback: string
): string {
  return text(t, `${slug}.name`, fallback);
}

/** The plan's name, description and features, each translated when the namespace has it. */
export function planCopy(
  t: PlanMessages,
  plan: { slug: string } & PlanCopy
): PlanCopy {
  const key = `${plan.slug}.features`;
  const raw = t.has(key) ? t.raw(key) : undefined;
  const features =
    Array.isArray(raw) && raw.every((item) => typeof item === "string")
      ? (raw as string[])
      : plan.features;
  return {
    name: planName(t, plan.slug, plan.name),
    description: text(t, `${plan.slug}.description`, plan.description),
    features,
  };
}
