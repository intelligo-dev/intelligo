/**
 * How one message's parts are laid out, as plain data — no React, so
 * the rules are pinned by tests.
 *
 * `groupParts` folds a run of the agent's own work — reasoning and the
 * tool calls between its words — into one activity segment, the way a
 * reader follows it: "Searched the web ▸", then the answer. A tool
 * that draws its own card (a document, a gated call awaiting the
 * reader) breaks the run and stands on its own. `step-start` and empty
 * text are boundaries the SDK keeps; they never break a run.
 *
 * `collectSources` gathers what the answer leans on — the AI SDK's
 * `source-url`/`source-document` parts and the sources a tool returned
 * — numbered the way `[n]` markers in the text refer to them.
 */

export type PartLike = { type: string };

export type PartAt<P> = { index: number; part: P };

export type MessageSegment<P> =
  | { kind: "part"; index: number; part: P }
  | { kind: "activity"; key: string; parts: PartAt<P>[] };

const SETTLED_TOOL_STATES = new Set([
  "output-available",
  "output-error",
  "output-denied",
]);

export function isToolPart(part: PartLike): boolean {
  return part.type.startsWith("tool-") || part.type === "dynamic-tool";
}

export function isReasoningPart(part: PartLike): boolean {
  return part.type === "reasoning";
}

function isBoundary(part: PartLike): boolean {
  if (part.type === "step-start") return true;
  return part.type === "text" && !(part as { text?: string }).text;
}

/**
 * Ordered segments. `isCard(part)` says a tool part draws its own card
 * instead of a row in the activity stream.
 */
export function groupParts<P extends PartLike>(
  parts: readonly P[],
  isCard: (part: P) => boolean
): MessageSegment<P>[] {
  const segments: MessageSegment<P>[] = [];
  let run: PartAt<P>[] | null = null;

  parts.forEach((part, index) => {
    if (isBoundary(part)) return;
    const joins =
      (isReasoningPart(part) && Boolean((part as { text?: string }).text)) ||
      (isToolPart(part) && !isCard(part));
    if (joins) {
      if (!run) {
        run = [];
        segments.push({ kind: "activity", key: `activity-${index}`, parts: run });
      }
      run.push({ index, part });
      return;
    }
    if (isReasoningPart(part)) return;
    run = null;
    segments.push({ kind: "part", index, part });
  });

  return segments;
}

/**
 * An activity segment is working while its message streams and it is
 * either the newest thing in the message or still waiting on a call.
 */
export function isActivityWorking<P extends PartLike>(
  segment: Extract<MessageSegment<P>, { kind: "activity" }>,
  isLastSegment: boolean,
  isStreaming: boolean
): boolean {
  if (!isStreaming) return false;
  if (isLastSegment) return true;
  return segment.parts.some(
    ({ part }) =>
      isToolPart(part) &&
      !SETTLED_TOOL_STATES.has((part as { state?: string }).state ?? "")
  );
}

export function isSettledToolState(state: string | undefined): boolean {
  return SETTLED_TOOL_STATES.has(state ?? "");
}

/* ------------------------------------------------------------------------- */

export type SourceItem = {
  url?: string;
  title?: string;
  /** Where the source lives, when the url does not say (a redirect). */
  domain?: string;
  snippet?: string;
  /** The `[n]` the model was told to cite this by, when the tool numbered it. */
  index?: number;
};

export type NumberedSource = SourceItem & { id: string; index: number };

/**
 * The sources a tool output carries by convention: `{ sources: [{ url,
 * title?, domain?, snippet?, index? }] }`. Anything else yields none.
 */
export function sourcesFromToolOutput(output: unknown): SourceItem[] {
  if (!output || typeof output !== "object") return [];
  const raw = (output as { sources?: unknown }).sources;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): SourceItem[] => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url : undefined;
    const title = typeof record.title === "string" ? record.title : undefined;
    if (!url && !title) return [];
    return [
      {
        ...(url ? { url } : {}),
        ...(title ? { title } : {}),
        ...(typeof record.domain === "string" ? { domain: record.domain } : {}),
        ...(typeof record.snippet === "string" ? { snippet: record.snippet } : {}),
        ...(typeof record.index === "number" && Number.isInteger(record.index)
          ? { index: record.index }
          : {}),
      },
    ];
  });
}

/**
 * Numbered sources for one message. A source the tool numbered keeps
 * its number (the model cites by it); the rest take the next free one
 * in part order. A url already numbered is not listed twice.
 */
export function collectSources<P extends PartLike>(
  parts: readonly P[],
  sourcesOf: (part: P) => SourceItem[]
): NumberedSource[] {
  const byIndex = new Map<number, NumberedSource>();
  const seenUrls = new Set<string>();
  const unnumbered: SourceItem[] = [];

  for (const part of parts) {
    for (const source of sourcesOf(part)) {
      if (source.index !== undefined && source.index >= 1) {
        if (byIndex.has(source.index)) continue;
        byIndex.set(source.index, {
          ...source,
          id: String(source.index),
          index: source.index,
        });
        if (source.url) seenUrls.add(source.url);
      } else {
        unnumbered.push(source);
      }
    }
  }

  let next = 1;
  for (const source of unnumbered) {
    if (source.url) {
      if (seenUrls.has(source.url)) continue;
      seenUrls.add(source.url);
    }
    while (byIndex.has(next)) next += 1;
    byIndex.set(next, { ...source, id: String(next), index: next });
  }

  return [...byIndex.values()].sort((a, b) => a.index - b.index);
}

/** The AI SDK's own source parts, as source items. */
export function sourcesFromSourcePart(part: PartLike): SourceItem[] {
  if (part.type !== "source-url" && part.type !== "source-document") return [];
  const source = part as { url?: string; title?: string; filename?: string };
  const title = source.title ?? source.filename;
  if (!source.url && !title) return [];
  return [
    {
      ...(source.url ? { url: source.url } : {}),
      ...(title ? { title } : {}),
    },
  ];
}

/** The host a source lives on, without `www.`. */
export function hostnameOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/** A source's display domain: what it says, else its url's host. */
export function sourceDomain(source: SourceItem): string | undefined {
  return source.domain ?? hostnameOf(source.url);
}

const CITE_PREFIX = "#cite-";

/**
 * `[3]`, `[3][4]` and `[3, 4]` in the text become one link each run —
 * `[3](#cite-3)`, `[3,4](#cite-3,4)` — which the markdown anchor
 * override renders as a citation pill. Only numbers the message has a
 * source for; a markdown link (`[3](…)`) is left alone.
 */
export function linkCitations(text: string, known: ReadonlySet<number>): string {
  if (known.size === 0) return text;
  return text.replace(/(?:\[\d{1,3}(?:\s*,\s*\d{1,3})*\])+(?!\()/g, (run) => {
    const numbers = [...run.matchAll(/\d{1,3}/g)]
      .map((match) => Number(match[0]))
      .filter((n) => known.has(n));
    if (numbers.length === 0) return run;
    const unique = [...new Set(numbers)];
    return `[${unique.join(",")}](${CITE_PREFIX}${unique.join(",")})`;
  });
}

/**
 * A readable name for a page that came with none — search grounding
 * often gives only the domain: the last meaningful path segment,
 * de-slugged. `…/blog-posts/node-js-end-of-life-dates` → "Node js end
 * of life dates". Undefined for a site's front page.
 */
export function titleFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  let segments: string[];
  try {
    segments = new URL(url).pathname.split("/").filter(Boolean);
  } catch {
    return undefined;
  }
  for (const segment of segments.reverse()) {
    const words = decodeURIComponent(segment)
      .replace(/\.(html?|php|aspx?)$/i, "")
      .replace(/[-_+]+/g, " ")
      .trim();
    // Ids, hashes and dates name nothing a reader recognises.
    if (words.length < 4 || !/[a-z]{3}/i.test(words) || /^[\d\s]+$/.test(words)) {
      continue;
    }
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  return undefined;
}

/** The source numbers a citation link points at, or null for any other link. */
export function parseCitationHref(href: string | undefined): number[] | null {
  if (!href?.startsWith(CITE_PREFIX)) return null;
  const numbers = href
    .slice(CITE_PREFIX.length)
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1);
  return numbers.length > 0 ? numbers : null;
}

/** The first string in a tool's input — the query, the path, the name. */
export function primaryInput(input: unknown): string | undefined {
  if (typeof input === "string") return input || undefined;
  if (!input || typeof input !== "object") return undefined;
  for (const value of Object.values(input as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}
