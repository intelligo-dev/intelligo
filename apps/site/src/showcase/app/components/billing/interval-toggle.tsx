"use client";

/**
 * Monthly/yearly billing interval switch. Purely presentational —
 * the selected interval lives in the parent's state.
 */

import { useTranslations } from "use-intl";

import { Button } from "@showcase/components/ui/button";

interface IntervalToggleProps {
  interval: "monthly" | "yearly";
  onChange: (interval: "monthly" | "yearly") => void;
}

export function IntervalToggle({ interval, onChange }: IntervalToggleProps) {
  const t = useTranslations("pricing");

  return (
    // Sized to its two words, not to the page: `flex-1` buttons in a
    // full-width row stretched "Monthly" and "Yearly" across the whole
    // content column, which read as two large tabs rather than as one
    // small switch. The parent centres it.
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
