/** Profile update input, shared by the profile service and its transports. */

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

/**
 * A BCP 47 language tag as next-intl routes it ("en", "mn", "pt-BR").
 * Which tags an app actually ships is the app's `routing.locales`; the
 * transport checks against that before calling the service.
 */
export const preferredLanguageSchema = z
  .string()
  .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, "Not a language tag");
