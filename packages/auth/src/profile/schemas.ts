/**
 * Profile Validation Schemas
 *
 * Zod schemas for user profile updates, shared by the profile service
 * and its transports.
 *
 * (Ported from the first product's `lib/validations/profile.ts` —
 * same semantics: optional name, optional-and-nullable image URL.)
 */

import { z } from "zod";

export const updateProfileSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be at most 100 characters")
    .optional(),
  image: z.string().url("Image must be a valid URL").optional().nullable(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
