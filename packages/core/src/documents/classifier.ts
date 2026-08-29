/**
 * Document title classifier registry.
 *
 * Vertical product packages register their title patterns here; the
 * document persistence API (./service.ts) uses the same registry to
 * derive agent labels and the "report" filter. Kept in its own module
 * with zero imports so client-safe code and tests can load it without
 * dragging in the server-only persistence chain (db).
 *
 * Ported from @intelligo-dev/agents/documents/classifier (ADR-0009) —
 * unchanged.
 */

export type DocumentPatternEntry = {
  /** Stable product slug — same one used across product configs. */
  productSlug: string;
  /** Human-readable agent label rendered in the documents UI. */
  agentLabel: string;
  /** Case-insensitive substring patterns; document matches if its
   *  lowercased title contains ANY of these. */
  patterns: string[];
};

const registry: DocumentPatternEntry[] = [];

export function registerDocumentPatterns(entry: DocumentPatternEntry): void {
  registry.push(entry);
}

export function classifyDocumentTitle(title: string): {
  productSlug: string | null;
  agentLabel: string;
} {
  const lower = title.toLowerCase();
  for (const entry of registry) {
    if (entry.patterns.some((p) => lower.includes(p))) {
      return { productSlug: entry.productSlug, agentLabel: entry.agentLabel };
    }
  }
  return { productSlug: null, agentLabel: "AI Assistant" };
}

/** Returns true when the document looks like it belongs to any registered product. */
export function isProductDocument(
  title: string,
  productSlug?: string
): boolean {
  const { productSlug: matched } = classifyDocumentTitle(title);
  if (!matched) return false;
  if (productSlug) return matched === productSlug;
  return true;
}

export function listRegisteredDocumentPatterns(): readonly DocumentPatternEntry[] {
  return registry;
}

export function clearDocumentPatternRegistry(): void {
  registry.length = 0;
}
