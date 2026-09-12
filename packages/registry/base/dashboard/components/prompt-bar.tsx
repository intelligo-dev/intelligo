"use client";

/**
 * Sticky composer at the bottom of the dashboard — start a conversation
 * from the home page without first navigating to the chat surface.
 *
 * Like the hero's starter cards, it mints a client-side UUID and
 * navigates to `${chatBasePath}/${id}?query=…`; the chat panel sends
 * that as the first turn. Nothing is written here, so an abandoned
 * prompt leaves no empty conversation behind.
 */

import { useState } from "react";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
import { dashboardConfig } from "@/lib/dashboard-config";

export function PromptBar() {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [message, setMessage] = useState("");

  const chatBasePath = dashboardConfig.chatBasePath ?? "/chat";

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text) return;
    const id = crypto.randomUUID();
    router.push(`${chatBasePath}/${id}?query=${encodeURIComponent(text)}`);
  }

  return (
    <div className="pointer-events-none sticky bottom-0 px-4 pb-6 pt-4">
      <form
        onSubmit={submit}
        className="pointer-events-auto mx-auto w-full max-w-3xl"
      >
        <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card/95 px-5 py-3 shadow-lg backdrop-blur">
          <input
            type="text"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t("promptBar.placeholder")}
            aria-label={t("promptBar.placeholder")}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={!message.trim()}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-30"
            aria-label={t("promptBar.send")}
          >
            <Send className="size-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
