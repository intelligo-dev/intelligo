/**
 * Prompt-injection sanitisation for user-authored text that reaches a
 * system prompt (a stored summary, a profile field, a quoted web page).
 * Strips role markers, override phrases and obfuscated separators, and
 * reports which patterns it saw so a transport can log the attempt.
 *
 * Dependency-free, so any package that assembles a prompt can use it.
 *
 * Returns an empty string when more than half of the original was
 * injection patterns: feeding the remaining fragments to the model is
 * worse than dropping them.
 */

const ZERO_WIDTH_CHARS =
  /[\u200B\u200C\u200D\u200E\u200F\uFEFF\u00AD\u2060\u2061\u2062\u2063\u2064]/g;

function normalizeText(text: string): { withSpaces: string; stripped: string } {
  return {
    withSpaces: text.replace(ZERO_WIDTH_CHARS, " ").normalize("NFKC"),
    stripped: text.replace(ZERO_WIDTH_CHARS, "").normalize("NFKC"),
  };
}

export type InjectionPattern = { name: string; pattern: RegExp };

/**
 * What is stripped. Exported so a product can extend the list for its
 * own model or language without re-implementing the sweep.
 */
export const INJECTION_PATTERNS: readonly InjectionPattern[] = [
  { name: "[SYSTEM]", pattern: /\[SYSTEM\]/gi },
  { name: "<<SYS>>", pattern: /<<SYS>>/gi },
  { name: "<|system|>", pattern: /<\|system\|>/gi },
  { name: "<|im_start|>", pattern: /<\|im_start\|>/gi },
  { name: "<|im_end|>", pattern: /<\|im_end\|>/gi },
  { name: "system: prefix", pattern: /^(SYSTEM|System|system)\s*:\s*/gm },
  {
    name: "ignore previous instructions",
    pattern: /ignore\s+(?:all\s+)?previous\s+instructions?/gi,
  },
  { name: "disregard above", pattern: /disregard\s+(?:everything\s+)?above/gi },
  { name: "forget everything", pattern: /forget\s+(?:all|everything)/gi },
  {
    name: "override instructions",
    pattern: /override\s+(?:your\s+)?instructions?/gi,
  },
  {
    name: "new instructions",
    pattern: /(?:your\s+)?new\s+instructions?\s+(?:are|follow)/gi,
  },
  { name: "you are now", pattern: /you\s+are\s+now\s+/gi },
  { name: "act as", pattern: /\bact\s+as\s+(?:a\s+|an\s+)?/gi },
  { name: "pretend to be", pattern: /pretend\s+to\s+be\s+/gi },
  { name: "roleplay as", pattern: /roleplay\s+as\s+/gi },
  { name: "play the role", pattern: /play\s+(?:the\s+)?role\s+of\s+/gi },
  { name: "separator ---", pattern: /\n{0,2}-{3,}\n{0,2}/g },
  { name: "separator ===", pattern: /\n{0,2}={3,}\n{0,2}/g },
  { name: "separator ###", pattern: /\n{0,2}#{3,}\n{0,2}/g },
  { name: "script tag", pattern: /<script[\s>]/gi },
  { name: "base64 data", pattern: /data:[^;]+;base64,/gi },
  {
    name: "do not follow",
    pattern: /do\s+not\s+follow\s+(?:your\s+)?(?:previous\s+)?instructions?/gi,
  },
  {
    name: "new system prompt",
    pattern: /(?:new|updated?)\s+system\s+prompt/gi,
  },
];

export type InjectionReport = {
  isInjection: boolean;
  /** Names of the patterns that matched, for a log line. */
  patterns: string[];
};

/**
 * Which patterns the text carries, without changing it. Zero-width
 * characters are both removed and replaced by spaces before matching,
 * so neither obfuscation hides a marker.
 */
export function detectPromptInjection(
  text: string,
  patterns: readonly InjectionPattern[] = INJECTION_PATTERNS
): InjectionReport {
  // Stryker disable next-line all: a fast path, not behaviour. Empty or
  // blank text matches no pattern, so every mutant of this guard —
  // dropping it, inverting it, swapping the operator — returns the same
  // report the loop below would have built.
  if (!text || text.trim().length === 0) {
    return { isInjection: false, patterns: [] };
  }
  const { withSpaces, stripped } = normalizeText(text);
  const matched: string[] = [];
  for (const { name, pattern } of patterns) {
    // Fresh instances: a global RegExp carries lastIndex between tests.
    const a = new RegExp(pattern.source, pattern.flags);
    const b = new RegExp(pattern.source, pattern.flags);
    if (a.test(withSpaces) || b.test(stripped)) matched.push(name);
  }
  return { isInjection: matched.length > 0, patterns: matched };
}

/**
 * The text with every pattern replaced by a space and whitespace
 * collapsed — or an empty string when the text was mostly patterns.
 */
export function sanitizeForSystemPrompt(
  text: string,
  patterns: readonly InjectionPattern[] = INJECTION_PATTERNS
): string {
  if (!text || text.trim().length === 0) return text;

  const originalLength = text.length;
  let sanitized = normalizeText(text).withSpaces;
  for (const { pattern } of patterns) {
    sanitized = sanitized.replace(
      new RegExp(pattern.source, pattern.flags),
      " "
    );
  }
  sanitized = sanitized
    // A pattern replaced between two newlines leaves a whitespace-only
    // line behind; drop those before collapsing blank lines.
    .replace(/\n[ \t]+\n/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ")
    .trim();

  const removed = originalLength - sanitized.length;
  if (removed / originalLength > 0.5) return "";
  return sanitized;
}
