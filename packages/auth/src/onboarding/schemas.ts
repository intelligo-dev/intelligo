/**
 * A step id is a non-empty, bounded string, not an enum: step ids are the
 * consumer's (the `id`s of its own steps config). A consumer wanting
 * stricter validation keeps its own schema at the transport layer.
 */

import { z } from "zod";

export const setStepSchema = z
  .string()
  .trim()
  .min(1, "Step id is required")
  .max(64, "Step id must be at most 64 characters");

export type SetStepInput = z.infer<typeof setStepSchema>;
