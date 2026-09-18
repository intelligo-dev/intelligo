"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type UseCopyToClipboardReturn = {
  copied: boolean;
  /** The last attempt did not reach the clipboard — shown, not only logged. */
  failed: boolean;
  copy: (text: string) => Promise<boolean>;
};

// Fallback to old browsers
function fallbackCopy(str: string): boolean {
  const textarea = document.createElement("textarea");
  let success = false;

  textarea.value = str;
  textarea.setAttribute("readonly", "");

  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";

  document.body.appendChild(textarea);

  textarea.select();

  try {
    success = document.execCommand("copy");
  } catch {
    success = false;
  } finally {
    document.body.removeChild(textarea);
  }

  return success;
}

export function useCopyToClipboard(duration = 1500): UseCopyToClipboardReturn {
  const [copied, setCopied] = useState<boolean>(false);
  const [failed, setFailed] = useState<boolean>(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      try {
        let success = false;

        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          success = true;
        } else {
          success = fallbackCopy(text);
        }

        if (success) {
          setFailed(false);
          setCopied(true);
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => setCopied(false), duration);
          return true;
        }
        throw new Error("Copy command failed");
      } catch (err: unknown) {
        console.error("Failed to copy text: ", err);
        setCopied(false);
        setFailed(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setFailed(false), duration * 2);
        return false;
      }
    },
    [duration]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    copied,
    failed,
    copy,
  };
}
