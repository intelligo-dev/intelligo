/**
 * Which workspaces a user owns, read from `member` directly: the
 * organization API answers for the session's user and does not say who
 * else owns a workspace.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@intelligo-dev/core/db";
import { member, organization } from "@intelligo-dev/core/db/schema";

const ownerRole = sql`'owner' = ANY(string_to_array(replace(${member.role}, ' ', ''), ','))`;

/** How many workspaces the user is an owner of. */
export async function countOwnedWorkspaces(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(member)
    .where(and(eq(member.userId, userId), ownerRole));
  return row?.count ?? 0;
}

export type OwnedWorkspace = {
  id: string;
  name: string;
  /** Every member, the user included. */
  members: number;
  /** Members with the owner role, the user included. */
  owners: number;
};

/** The workspaces the user is an owner of, with who else is in each. */
export async function ownedWorkspaces(
  userId: string
): Promise<OwnedWorkspace[]> {
  const owned = await db
    .select({ id: organization.id, name: organization.name })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(member.userId, userId), ownerRole));
  if (owned.length === 0) return [];

  const counts = await db
    .select({
      organizationId: member.organizationId,
      members: sql<number>`count(*)::int`,
      owners: sql<number>`count(*) filter (where ${ownerRole})::int`,
    })
    .from(member)
    .where(
      inArray(
        member.organizationId,
        owned.map((w) => w.id)
      )
    )
    .groupBy(member.organizationId);
  const byId = new Map(counts.map((c) => [c.organizationId, c]));

  return owned.map((w) => ({
    ...w,
    members: byId.get(w.id)?.members ?? 1,
    owners: byId.get(w.id)?.owners ?? 1,
  }));
}
