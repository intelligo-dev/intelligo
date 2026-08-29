/**
 * Workspace Validation Schemas
 *
 * Zod schemas for workspace create/update inputs, shared by the
 * workspace service and its transports.
 *
 * (Ported from the product application's workspace validation module —
 * same semantics. Acme's copy is retired at cutover.)
 */

import { z } from "zod";

/**
 * Create Workspace Schema
 * Name + optional slug for new workspaces
 */
export const createWorkspaceSchema = z.object({
  name: z
    .string()
    .min(2, "Workspace name must be at least 2 characters")
    .max(50, "Workspace name must be at most 50 characters"),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(50, "Slug must be at most 50 characters")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug can only contain lowercase letters, numbers, and hyphens"
    )
    .optional(), // Auto-generated from name if not provided
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

/**
 * Update Workspace Schema
 * Optional name, slug, and logo for workspace settings
 */
export const updateWorkspaceSchema = z.object({
  name: z
    .string()
    .min(2, "Workspace name must be at least 2 characters")
    .max(50, "Workspace name must be at most 50 characters")
    .optional(),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(50, "Slug must be at most 50 characters")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug can only contain lowercase letters, numbers, and hyphens"
    )
    .optional(),
  logo: z.string().url("Logo must be a valid URL").optional().nullable(),
});

export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
