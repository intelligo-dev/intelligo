"use client";

/**
 * Triggers a GDPR-style export of everything the framework's identity
 * service knows about the current user. Calls the `exportIdentity`
 * server action directly and turns the JSON result into a browser
 * download — no dedicated API route needed for a one-off, per-user
 * dump this size.
 */

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { exportIdentity } from "@/actions/privacy";

export function ExportDataButton() {
  const t = useTranslations("privacy-settings");
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  function handleExport() {
    setLoading(true);
    startTransition(async () => {
      try {
        const result = await exportIdentity();
        if (!result.success) {
          toast.error(result.error);
          return;
        }

        const blob = new Blob([JSON.stringify(result.data, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `data-export-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        toast.success(t("exportButton.success"));
      } catch (error) {
        toast.error(t("exportButton.error"));
        console.error(error);
      } finally {
        setLoading(false);
      }
    });
  }

  return (
    <Button onClick={handleExport} disabled={loading}>
      <Download className="mr-2 h-4 w-4" />
      {loading ? t("exportButton.preparing") : t("exportButton.download")}
    </Button>
  );
}
