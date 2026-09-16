"use client";

/**
 * Sticky composer at the bottom of the dashboard — start a conversation
 * from the home page without first navigating to the chat surface.
 *
 * It composes the same primitives the `chat` item's composer does, so
 * the home page behaves like the real thing rather than approximating
 * it: Enter sends and Shift+Enter breaks a line (IME-safe), the
 * textarea grows with its content, and dictation appends to the draft.
 *
 * Like the hero's starter cards, it mints a client-side UUID and
 * navigates to `${chatBasePath}/${id}?query=…`; the chat panel sends
 * that as the first turn. Nothing is written here, so an abandoned
 * prompt leaves no empty conversation behind.
 *
 * No attachments, deliberately: the handoff to the chat surface is a
 * URL, which carries text and nothing else, so a file picked here would
 * be dropped by the navigation that follows. Attachments belong to the
 * conversation, one navigation later.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";

import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ui/ai-prompt-input";
import { SpeechInput } from "@/components/ui/ai-speech-input";
import { useRouter } from "@/i18n/navigation";
import { dashboardConfig } from "@/lib/dashboard-config";

export function PromptBar() {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [message, setMessage] = useState("");

  const chatBasePath = dashboardConfig.chatBasePath ?? "/chat";

  return (
    // The band, not just the pill, carries a background: the composer
    // is sticky, so while the page scrolls everything passes underneath
    // it — and with only the pill painted, the plan card and the
    // shortcut row showed through the gutter around it. The gradient
    // ends transparent so the content fades out rather than meeting a
    // hard edge.
    <div className="pointer-events-none sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent px-4 pt-8 pb-6">
      <PromptInput
        className="pointer-events-auto mx-auto w-full max-w-3xl"
        onSubmit={({ text }) => {
          const prompt = (text ?? "").trim();
          if (!prompt) return;
          const id = crypto.randomUUID();
          router.push(
            `${chatBasePath}/${id}?query=${encodeURIComponent(prompt)}`
          );
        }}
      >
        <PromptInputTextarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={t("promptBar.placeholder")}
          aria-label={t("promptBar.placeholder")}
        />
        <PromptInputFooter>
          <PromptInputTools>
            <SpeechInput
              startLabel={t("promptBar.voiceStart")}
              stopLabel={t("promptBar.voiceStop")}
              onTranscript={(spokenText, isFinal) => {
                if (!isFinal) return;
                const spoken = spokenText.trim();
                if (!spoken) return;
                setMessage((current) =>
                  current ? `${current.replace(/\s+$/, "")} ${spoken}` : spoken
                );
              }}
            />
          </PromptInputTools>
          <PromptInputSubmit
            status="ready"
            label={t("promptBar.send")}
            disabled={!message.trim()}
          />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
