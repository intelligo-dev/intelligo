"use client";

/**
 * The composer, and the ways of filling it.
 *
 * It sits directly under the hero rather than pinned to the foot of the
 * page: the question and the box that answers it belong together, and
 * with the composer stuck to the bottom the eye had to cross an empty
 * page to get from one to the other.
 *
 * It composes the same primitives the `chat` item's composer does, so
 * the home page behaves like the surface it hands off to: Enter sends
 * and Shift+Enter breaks a line (IME-safe), the textarea grows with its
 * content, and dictation appends to the draft.
 *
 * Both affordances — the composer and the starter cards — mint a
 * client-side UUID and navigate to `${chatBasePath}/${id}?query=…`; the
 * chat panel sends that as the first turn. Nothing is written here, so
 * an abandoned prompt leaves no empty conversation behind.
 *
 * No attachments, deliberately: the handoff to the chat surface is a
 * URL, which carries text and nothing else, so a file picked here would
 * be dropped by the navigation that follows. Attachments belong to the
 * conversation, one navigation later.
 */

import { useState } from "react";
import { useTranslations } from "use-intl";

import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@ui/components/ui/ai-prompt-input";
import { SpeechInput } from "@ui/components/ui/ai-speech-input";
import { useRouter } from "@ui/i18n/navigation";
import { dashboardConfig } from "@ui/lib/dashboard-config";

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
        // Chips, not cards: under the composer these are one more way to
        // fill it, and at card weight they competed with it for the eye.
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
