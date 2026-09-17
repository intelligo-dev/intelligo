"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";

/**
 * A role is a label, not a status: the owner's badge was the solid
 * primary fill, which in a table of members reads as an alert rather
 * than as one row's role. The word carries the distinction — identity
 * never rests on colour alone — so the badges stay
 * quiet and differ by their text.
 */
const VARIANT_BY_ROLE: Record<string, "default" | "secondary" | "outline"> = {
  owner: "secondary",
  admin: "outline",
  member: "outline",
};

interface RoleBadgeProps {
  role: string;
}

export function RoleBadge({ role }: RoleBadgeProps) {
  const t = useTranslations("team-settings");

  return (
    <Badge variant={VARIANT_BY_ROLE[role] ?? "outline"} className="capitalize">
      {t.has(`roles.${role}`) ? t(`roles.${role}`) : role}
    </Badge>
  );
}
