/**
 * Where files live. The framework stores attachment rows and hands out URLs;
 * the application binds one adapter (S3, R2, Vercel Blob, disk) from its
 * composition root:
 *
 *     import { setStorageAdapter } from "@intelligo-dev/core/storage";
 *     setStorageAdapter(createS3Storage({ bucket, region }));   // the app's lib/storage.ts
 *
 * An unbound adapter throws where a file is needed. Keys carry the tenant —
 * `ws/<workspaceId>/att/<id>` — so a signed URL for one workspace's file can
 * never be minted from another's row.
 */

import { createRegistryRef } from "../registry";

export type StorageBody = Uint8Array | Blob | ReadableStream<Uint8Array>;

export type StorageObject = {
  key: string;
  contentType: string;
  size?: number;
};

export type SignedUrlOptions = {
  /** Default 900 (fifteen minutes). */
  expiresInSeconds?: number;
  disposition?: "inline" | "attachment";
  /** Sent as the download's file name when the adapter supports it. */
  filename?: string;
};

export interface StorageAdapter {
  put(input: {
    key: string;
    body: StorageBody;
    contentType: string;
    contentLength?: number;
  }): Promise<StorageObject>;
  /** A URL the browser — or a model provider — can fetch for a while. */
  getSignedUrl(key: string, options?: SignedUrlOptions): Promise<string>;
  /** The bytes, for text extraction or a streaming proxy. Optional: not every store can. */
  get?(key: string): Promise<{
    body: ReadableStream<Uint8Array>;
    contentType: string;
    size?: number;
  }>;
  delete(key: string): Promise<void>;
}

export class StorageUnavailableError extends Error {
  readonly code = "storage_unavailable";
  constructor() {
    super(
      "No storage adapter is bound. Call setStorageAdapter() from your " +
        "composition root with your bucket's adapter (S3, R2, Blob), or " +
        "createMemoryStorage() for tests."
    );
    this.name = "StorageUnavailableError";
  }
}

const adapter = createRegistryRef<StorageAdapter | undefined>(
  "core/storage-adapter",
  undefined
);

export function setStorageAdapter(next: StorageAdapter): void {
  adapter.set(next);
}

/** Forget the bound adapter. For tests composing a fresh root. */
export function clearStorageAdapter(): void {
  adapter.set(undefined);
}

export function hasStorageAdapter(): boolean {
  return adapter.get() !== undefined;
}

/** @throws {StorageUnavailableError} when nothing is bound. */
export function getStorageAdapter(): StorageAdapter {
  const bound = adapter.get();
  if (!bound) throw new StorageUnavailableError();
  return bound;
}

/** The key a chat attachment is stored under. */
export function attachmentStorageKey(workspaceId: string, id: string): string {
  return `ws/${workspaceId}/att/${id}`;
}

async function toBytes(body: StorageBody): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  const chunks: Uint8Array[] = [];
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const size = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined")
    return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Files in memory, "signed" as data URLs, for tests and apps without a
 * bucket. Nothing survives a restart.
 */
export function createMemoryStorage(): StorageAdapter & {
  readonly objects: Map<string, { bytes: Uint8Array; contentType: string }>;
} {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  return {
    objects,
    async put({ key, body, contentType }) {
      const bytes = await toBytes(body);
      objects.set(key, { bytes, contentType });
      return { key, contentType, size: bytes.byteLength };
    },
    async getSignedUrl(key) {
      const object = objects.get(key);
      if (!object) throw new Error(`No object at ${key}`);
      return `data:${object.contentType};base64,${toBase64(object.bytes)}`;
    },
    async get(key) {
      const object = objects.get(key);
      if (!object) throw new Error(`No object at ${key}`);
      return {
        body: new Blob([object.bytes as BlobPart]).stream(),
        contentType: object.contentType,
        size: object.bytes.byteLength,
      };
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}
