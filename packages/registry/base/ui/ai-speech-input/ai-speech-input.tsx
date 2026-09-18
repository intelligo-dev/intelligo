"use client";

/*
 * Voice into the composer on the browser's own speech recognition. Renders
 * nothing where the API is absent (Firefox, some WebViews): a button that
 * cannot work is worse than no button.
 */

import * as React from "react";
import { MicIcon, SquareIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RecognitionResultEvent = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function recognitionConstructor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function SpeechInput({
  onTranscript,
  lang,
  startLabel,
  stopLabel,
  className,
  size = "icon-sm",
  variant = "ghost",
  ...props
}: Omit<React.ComponentProps<typeof Button>, "onClick" | "children"> & {
  /** Called with recognised text; `isFinal` once a phrase settles. */
  onTranscript: (text: string, isFinal: boolean) => void;
  /** BCP 47, e.g. "en-US". The document's language when omitted. */
  lang?: string;
  /** Accessible names. */
  startLabel: string;
  stopLabel: string;
}) {
  const [supported, setSupported] = React.useState(false);
  const [listening, setListening] = React.useState(false);
  const recognition = React.useRef<Recognition | null>(null);

  React.useEffect(() => {
    setSupported(recognitionConstructor() !== null);
  }, []);

  React.useEffect(
    () => () => {
      recognition.current?.stop();
    },
    []
  );

  function start() {
    const Ctor = recognitionConstructor();
    if (!Ctor) return;
    const instance = new Ctor();
    const documentLang =
      typeof document !== "undefined" ? document.documentElement.lang : "";
    instance.lang = lang ?? (documentLang || "en-US");
    instance.continuous = true;
    instance.interimResults = true;
    instance.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]!;
        onTranscript(result[0].transcript, result.isFinal);
      }
    };
    instance.onend = () => setListening(false);
    instance.onerror = () => setListening(false);
    recognition.current = instance;
    instance.start();
    setListening(true);
  }

  function stop() {
    recognition.current?.stop();
    recognition.current = null;
    setListening(false);
  }

  if (!supported) return null;

  return (
    <Button
      data-slot="speech-input"
      data-state={listening ? "listening" : "idle"}
      type="button"
      size={size}
      variant={variant}
      aria-label={listening ? stopLabel : startLabel}
      aria-pressed={listening}
      onClick={listening ? stop : start}
      className={cn(listening && "text-destructive", className)}
      {...props}
    >
      {listening ? <SquareIcon className="animate-pulse" /> : <MicIcon />}
    </Button>
  );
}

export { SpeechInput };
