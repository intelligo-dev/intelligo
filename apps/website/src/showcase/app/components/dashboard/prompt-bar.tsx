"use client";

/**
 * The composer, and the starter chips that fill it. Uses the same
 * primitives as the `chat` item's composer: Enter sends, Shift+Enter
 * breaks a line (IME-safe), dictation appends to the draft.
 *
 * Both affordances — the composer and the starter cards — mint a
 * client-side UUID and navigate to `${chatBasePath}/${id}?query=…`; the
 * chat panel sends that as the first turn. Nothing is written here, so
 * an abandoned prompt leaves no empty conversation behind.
 *
 * No attachments: the handoff to the chat surface is a URL, which
 * carries text only, so a file picked here would be dropped.
 */

import { useState } from "react";
import { useTranslations } from "use-intl";

import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@showcase/components/ui/ai-prompt-input";
import { SpeechInput } from "@showcase/components/ui/ai-speech-input";
import { useRouter } from "@showcase/i18n/navigation";
import { dashboardConfig } from "@showcase/lib/dashboard-config";

export function PromptBar() {
  const t = useTranslations("dashboard");
  // Namespace-less: starter keys are fully qualified so a product can
  // point them at its own namespace (the `chatConfig.starters` contract).
  const tAny = useTranslations();
  const router = useRouter();
  const [message, setMessage] = useState("");

  const chatBasePath = dashboardConfig.chatBasePath ?? "/chat";
  const starters = (dashboardConfig.starters ?? []).map((key) => tAny(key));

  function start(prompt: string) {
    const id = crypto.randomUUID();
    router.push(`${chatBasePath}/${id}?query=${encodeURIComponent(prompt)}`);
  }

  return (
    <div className="mt-8">
      <PromptInput
        onSubmit={({ text }) => {
          const prompt = (text ?? "").trim();
          if (!prompt) return;
          start(prompt);
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

      {starters.length > 0 ? (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {starters.map((starter, index) => (
            <button
              key={index}
              type="button"
              onClick={() => start(starter)}
              className="max-w-full rounded-full border border-border/60 px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-accent/40 hover:text-foreground"
            >
              <span className="block truncate">{starter}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
