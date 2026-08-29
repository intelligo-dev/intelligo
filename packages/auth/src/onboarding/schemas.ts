/**
 * Onboarding validation schema.
 *
 * A single generic step-id validator — see the module doc comment on
 * `./service.ts` for why this is a bare, bounded string rather than a
 * product-specific enum. Acme's original
 * `lib/validations/onboarding.ts` pinned this to
 * `z.enum(["role", "profile", "complete"])`, Support's own 3-step wizard
 * shape. The `users.onboarding_step` column itself is untyped `text`,
 * so that enum was a product-level constraint bolted onto a generic
 * column, not something this shared contract should require. A
 * consumer defines its own step ids (typically the `id` field of a
 * steps-config array it owns) and passes them straight through;
 * Acme's cut-over copy keeps its own enum-shaped schema at the
 * transport layer if it wants stricter validation than "non-empty,
 * bounded string".
 */

import { z } from "zod";

export const setStepSchema = z
  .string()
  .trim()
  .min(1, "Step id is required")
  .max(64, "Step id must be at most 64 characters");

export type SetStepInput = z.infer<typeof setStepSchema>;
