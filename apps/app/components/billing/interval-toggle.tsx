"use client";

/** Monthly/yearly switch; the selected interval is the parent's state. */

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

interface IntervalToggleProps {
  interval: "monthly" | "yearly";
  onChange: (interval: "monthly" | "yearly") => void;
}

export function IntervalToggle({ interval, onChange }: IntervalToggleProps) {
  const t = useTranslations("pricing");

  return (
    // Sized to its two words, not to the page; the parent centres it.
    <div className="inline-flex w-fit items-center gap-1 rounded-lg bg-muted p-1">
      <Button
        type="button"
        variant={interval === "monthly" ? "default" : "ghost"}
        size="sm"
        onClick={() => onChange("monthly")}
      >
        {t("intervalToggle.monthly")}
      </Button>
      <Button
        type="button"
        variant={interval === "yearly" ? "default" : "ghost"}
        size="sm"
        onClick={() => onChange("yearly")}
      >
        {t("intervalToggle.yearly")}
      </Button>
    </div>
  );
}
