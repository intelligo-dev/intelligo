/** Workspace inputs, shared by the workspace service and its transports. */

import { z } from "zod";

import { workspaceNameProblem } from "../request-hardening";

/** A workspace name: 2–50 characters, and no link (see `workspaceNameProblem`). */
const workspaceName = z
  .string()
  .min(2, "Workspace name must be at least 2 characters")
  .max(50, "Workspace name must be at most 50 characters")
  .refine((name) => workspaceNameProblem(name) === null, {
    message: "Workspace name cannot contain a link",
  });

export const createWorkspaceSchema = z.object({
  name: workspaceName,
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(50, "Slug must be at most 50 characters")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug can only contain lowercase letters, numbers, and hyphens"
    )
    .optional(), // Generated from the name when omitted.
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const updateWorkspaceSchema = z.object({
  name: workspaceName.optional(),
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
