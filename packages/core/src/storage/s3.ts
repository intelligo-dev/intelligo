/**
 * A `StorageAdapter` for any S3-compatible bucket — AWS S3, Cloudflare R2,
 * MinIO — bound from the composition root:
 *
 *     import { setStorageAdapter } from "@intelligo-dev/core/storage";
 *     import { s3StorageFromEnv } from "@intelligo-dev/core/storage/s3";
 *
 *     const storage = s3StorageFromEnv();
 *     if (storage) setStorageAdapter(storage);
 *
 * Requests are signed with AWS Signature Version 4 over `fetch` and Web
 * Crypto, so the adapter carries no SDK and runs wherever `fetch` does.
 * Uploads are buffered to be hashed; attachments are small enough for it.
 */

import type { SignedUrlOptions, StorageAdapter, StorageBody } from "./index";

export type S3StorageOptions = {
  bucket: string;
  /** `auto` for R2. */
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /**
   * The S3 API origin, for anything but AWS: `https://<account>.r2.cloudflarestorage.com`,
   * `http://localhost:9000`. Default `https://s3.<region>.amazonaws.com`.
   */
  endpoint?: string;
  /**
   * Address the bucket as a path (`<endpoint>/<bucket>/<key>`) rather than
   * a subdomain. Default: true with a custom `endpoint`, false on AWS.
   */
  pathStyle?: boolean;
};

const encoder = new TextEncoder();

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  return hex(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}

async function hmac(
  key: ArrayBuffer | Uint8Array,
  data: string
): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

/** RFC 3986 percent-encoding, as SigV4 requires. */
function encode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function encodePath(path: string): string {
  return path.split("/").map(encode).join("/");
}

/** `20260927T101500Z` and `20260927` for `date`. */
function amzDate(date: Date): { stamp: string; day: string } {
  const stamp = date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  return { stamp, day: stamp.slice(0, 8) };
}

async function toBytes(body: StorageBody): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  return new Uint8Array(await new Response(body).arrayBuffer());
}

type Signed = { url: string; headers: Record<string, string> };

type SignInput = {
  method: "GET" | "PUT" | "DELETE";
  key: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  payloadHash: string;
  /** Sign the query string instead of an Authorization header. */
  presign?: { expiresInSeconds: number };
  now?: Date;
};

export function createS3Storage(options: S3StorageOptions): StorageAdapter & {
  /** The signed request `put`/`get`/`delete` send, for inspection. */
  sign(input: SignInput): Promise<Signed>;
} {
  const pathStyle = options.pathStyle ?? Boolean(options.endpoint);
  const endpoint = new URL(
    options.endpoint ?? `https://s3.${options.region}.amazonaws.com`
  );
  const host = pathStyle ? endpoint.host : `${options.bucket}.${endpoint.host}`;
  const base = `${endpoint.protocol}//${host}`;
  const prefix = pathStyle ? `/${options.bucket}` : "";

  async function sign(input: SignInput): Promise<Signed> {
    const { stamp, day } = amzDate(input.now ?? new Date());
    const scope = `${day}/${options.region}/s3/aws4_request`;
    const path = `${prefix}/${encodePath(input.key)}`;

    const headers: Record<string, string> = { host };
    for (const [name, value] of Object.entries(input.headers ?? {})) {
      headers[name.toLowerCase()] = value;
    }
    const query: Record<string, string> = { ...input.query };
    if (input.presign) {
      Object.assign(query, {
        "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
        "X-Amz-Credential": `${options.accessKeyId}/${scope}`,
        "X-Amz-Date": stamp,
        "X-Amz-Expires": String(input.presign.expiresInSeconds),
        "X-Amz-SignedHeaders": "host",
      });
    } else {
      headers["x-amz-content-sha256"] = input.payloadHash;
      headers["x-amz-date"] = stamp;
    }

    const signedNames = input.presign ? ["host"] : Object.keys(headers).sort();
    const canonicalQuery = Object.keys(query)
      .sort()
      .map((name) => `${encode(name)}=${encode(query[name]!)}`)
      .join("&");
    const canonicalRequest = [
      input.method,
      path,
      canonicalQuery,
      signedNames.map((name) => `${name}:${headers[name]!.trim()}\n`).join(""),
      signedNames.join(";"),
      input.payloadHash,
    ].join("\n");
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      stamp,
      scope,
      await sha256(canonicalRequest),
    ].join("\n");

    let key: ArrayBuffer = await hmac(
      encoder.encode(`AWS4${options.secretAccessKey}`),
      day
    );
    for (const part of [options.region, "s3", "aws4_request"]) {
      key = await hmac(key, part);
    }
    const signature = hex(await hmac(key, stringToSign));

    if (input.presign) {
      return {
        url: `${base}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`,
        headers: {},
      };
    }
    delete headers.host;
    headers.authorization =
      `AWS4-HMAC-SHA256 Credential=${options.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedNames.join(";")}, Signature=${signature}`;
    return {
      url: `${base}${path}${canonicalQuery ? `?${canonicalQuery}` : ""}`,
      headers,
    };
  }

  async function send(input: SignInput, body?: Uint8Array): Promise<Response> {
    const { url, headers } = await sign(input);
    const response = await fetch(url, {
      method: input.method,
      headers,
      body: body as BodyInit | undefined,
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(
        `S3 ${input.method} ${input.key} failed (${response.status})${detail ? `: ${detail}` : ""}`
      );
    }
    return response;
  }

  return {
    sign,

    async put({ key, body, contentType }) {
      const bytes = await toBytes(body);
      await send(
        {
          method: "PUT",
          key,
          headers: {
            "content-type": contentType,
            "content-length": String(bytes.byteLength),
          },
          payloadHash: await sha256(bytes),
        },
        bytes
      );
      return { key, contentType, size: bytes.byteLength };
    },

    async getSignedUrl(key, signed: SignedUrlOptions = {}) {
      const query: Record<string, string> = {};
      if (signed.disposition || signed.filename) {
        query["response-content-disposition"] =
          `${signed.disposition ?? "attachment"}` +
          (signed.filename
            ? `; filename*=UTF-8''${encode(signed.filename)}`
            : "");
      }
      const { url } = await sign({
        method: "GET",
        key,
        query,
        payloadHash: "UNSIGNED-PAYLOAD",
        presign: { expiresInSeconds: signed.expiresInSeconds ?? 900 },
      });
      return url;
    },

    async get(key) {
      const response = await send({
        method: "GET",
        key,
        payloadHash: await sha256(""),
      });
      const length = response.headers.get("content-length");
      return {
        body: response.body ?? new Blob([]).stream(),
        contentType:
          response.headers.get("content-type") ?? "application/octet-stream",
        size: length === null ? undefined : Number(length),
      };
    },

    async delete(key) {
      await send({ method: "DELETE", key, payloadHash: await sha256("") });
    },
  };
}

/**
 * An adapter from `STORAGE_BUCKET`, `STORAGE_REGION` (default `auto`),
 * `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY_ID` and
 * `STORAGE_SECRET_ACCESS_KEY`, or null when no bucket is configured.
 *
 * @throws when a bucket is named without both keys.
 */
export function s3StorageFromEnv(
  env: Record<string, string | undefined> = process.env
): ReturnType<typeof createS3Storage> | null {
  const bucket = env.STORAGE_BUCKET;
  if (!bucket) return null;
  const accessKeyId = env.STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = env.STORAGE_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "STORAGE_BUCKET is set without STORAGE_ACCESS_KEY_ID and STORAGE_SECRET_ACCESS_KEY."
    );
  }
  return createS3Storage({
    bucket,
    region: env.STORAGE_REGION || "auto",
    endpoint: env.STORAGE_ENDPOINT || undefined,
    accessKeyId,
    secretAccessKey,
  });
}
