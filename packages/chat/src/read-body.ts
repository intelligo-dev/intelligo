/**
 * Reading a request body without trusting its size.
 */

/**
 * The request body, read until it passes `limit` bytes; then the read
 * stops and `"too_large"` is returned, so a body of any size costs at
 * most the limit in memory. A declared `Content-Length` over the limit
 * is refused before anything is read.
 */
export async function readUpTo(
  request: Request,
  limit: number
): Promise<Uint8Array<ArrayBuffer> | "too_large"> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return "too_large";
  if (!request.body) return new Uint8Array(new ArrayBuffer(0));
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return "too_large";
    }
    chunks.push(value);
  }
  const out = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * A JSON body of at most `limit` bytes: `"too_large"` past it,
 * `"invalid"` for an empty body or one that does not parse.
 */
export async function readJsonUpTo(
  request: Request,
  limit: number
): Promise<{ json: unknown } | "too_large" | "invalid"> {
  const bytes = await readUpTo(request, limit);
  if (bytes === "too_large") return bytes;
  try {
    return { json: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return "invalid";
  }
}
