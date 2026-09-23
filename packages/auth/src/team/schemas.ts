/** Team inputs, shared by the team service and its transports. */

import { z } from "zod";

export const inviteMemberSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  role: z.enum(["admin", "member"], {
    // One message for a missing role and an unknown one: to the person
    // filling in the form they are the same mistake. `message`, not
    // `error`: the peer range admits zod 3, which reads only `message`.
    message: "Please select a role",
  }),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const updateRoleSchema = z.object({
  memberId: z.string().min(1),
  role: z.enum(["admin", "member"]),
});

export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
