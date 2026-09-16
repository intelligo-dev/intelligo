/**
 * Team Management Validation Schemas
 *
 * Zod schemas for team invite and member management inputs, shared by
 * the team service and its transports.
 *
 * (Ported from the first product's team validation module — same
 * semantics.)
 */

import { z } from "zod";

/**
 * Invite Member Schema
 * Email + role for inviting new team members
 */
export const inviteMemberSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  role: z.enum(["admin", "member"], {
    // zod 4 folded `required_error` and `invalid_type_error` into one
    // `error`: a missing role and a role that is not one of these two
    // are the same mistake to whoever is reading the form.
    error: "Please select a role",
  }),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

/**
 * Update Role Schema
 * For changing an existing member's role
 */
export const updateRoleSchema = z.object({
  memberId: z.string().min(1),
  role: z.enum(["admin", "member"]),
});

export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
