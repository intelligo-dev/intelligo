/**
 * Search engines truncate a `<meta name="description">` past roughly
 * 155-160 characters; a page that builds its description by concatenating
 * boilerplate with a registry item's own (often much longer) description
 * needs a hard cap, cut at a word boundary rather than mid-word.
 */
export function truncate(text: string, max = 160): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
