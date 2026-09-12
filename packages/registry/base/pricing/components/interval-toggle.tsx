"use client";

/**
 * Monthly/yearly billing interval switch. Purely presentational —
 * the selected interval lives in the parent's state.
 */

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

interface IntervalToggleProps {
  interval: "monthly" | "yearly";
  onChange: (interval: "monthly" | "yearly") => void;
}

export function IntervalToggle({ interval, onChange }: IntervalToggleProps) {
  const t = useTranslations("pricing");

  return (
    <div className="flex items-center justify-center gap-2 rounded-lg bg-muted p-1">
      <Button
        type="button"
        variant={interval === "monthly" ? "default" : "ghost"}
        size="sm"
        onClick={() => onChange("monthly")}
        className="flex-1"
      >
        {t("intervalToggle.monthly")}
      </Button>
      <Button
        type="button"
        variant={interval === "yearly" ? "default" : "ghost"}
        size="sm"
        onClick={() => onChange("yearly")}
        className="flex-1"
      >
        {t("intervalToggle.yearly")}
      </Button>
    </div>
  );
}
