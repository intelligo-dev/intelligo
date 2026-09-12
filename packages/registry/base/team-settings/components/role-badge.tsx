"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";

const VARIANT_BY_ROLE: Record<string, "default" | "secondary" | "outline"> = {
  owner: "default",
  admin: "secondary",
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
