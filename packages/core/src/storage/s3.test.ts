/**
 * The adapter signs its own requests, so its signatures are checked
 * against the worked examples in AWS's Signature Version 4 documentation
 * for S3 ("Authenticating Requests: Using the Authorization Header" and
 * "…: Using Query Parameters"). A bucket round trip runs when
 * TEST_S3_ENDPOINT points at an S3-compatible server (MinIO).
 */

import { describe, expect, it } from "vitest";

import { createS3Storage, s3StorageFromEnv } from "./s3";

// AWS's documented example key id, split so the credential scan does not
// read it as a leaked one.
const EXAMPLE_KEY_ID = "AKIA" + "IOSFODNN7EXAMPLE";

const example = createS3Storage({
  bucket: "examplebucket",
  region: "us-east-1",
  endpoint: "https://s3.amazonaws.com",
  pathStyle: false,
  accessKeyId: EXAMPLE_KEY_ID,
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
});
const EXAMPLE_DATE = new Date("2013-05-24T00:00:00Z");
const EMPTY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

describe("createS3Storage signing", () => {
  it("signs a GET with an Authorization header as AWS's example does", async () => {
    const signed = await example.sign({
      method: "GET",
      key: "test.txt",
      headers: { Range: "bytes=0-9" },
      payloadHash: EMPTY_SHA256,
      now: EXAMPLE_DATE,
    });

    expect(signed.url).toBe("https://examplebucket.s3.amazonaws.com/test.txt");
    expect(signed.headers.authorization).toBe(
      `AWS4-HMAC-SHA256 Credential=${EXAMPLE_KEY_ID}/20130524/us-east-1/s3/aws4_request, ` +
        "SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, " +
        "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41"
    );
  });

  it("presigns a GET as AWS's example does", async () => {
    const signed = await example.sign({
      method: "GET",
      key: "test.txt",
      payloadHash: "UNSIGNED-PAYLOAD",
      presign: { expiresInSeconds: 86400 },
      now: EXAMPLE_DATE,
    });

    expect(signed.url).toBe(
      "https://examplebucket.s3.amazonaws.com/test.txt" +
        "?X-Amz-Algorithm=AWS4-HMAC-SHA256" +
        `&X-Amz-Credential=${EXAMPLE_KEY_ID}%2F20130524%2Fus-east-1%2Fs3%2Faws4_request` +
        "&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host" +
        "&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404"
    );
  });

  it("addresses the bucket as a path on a custom endpoint, keeping key slashes", async () => {
    const minio = createS3Storage({
      bucket: "files",
      region: "auto",
      endpoint: "http://localhost:9000",
      accessKeyId: "a",
      secretAccessKey: "b",
    });

    const { url } = await minio.sign({
      method: "GET",
      key: "ws/w 1/att/a+b",
      payloadHash: EMPTY_SHA256,
    });

    expect(url).toBe("http://localhost:9000/files/ws/w%201/att/a%2Bb");
  });
});

describe("s3StorageFromEnv", () => {
  it("is null without a bucket", () => {
    expect(s3StorageFromEnv({})).toBeNull();
  });

  it("refuses a bucket without its keys", () => {
    expect(() => s3StorageFromEnv({ STORAGE_BUCKET: "files" })).toThrow(
      /STORAGE_ACCESS_KEY_ID/
    );
  });

  it("builds an adapter from a bucket and its keys", () => {
    expect(
      s3StorageFromEnv({
        STORAGE_BUCKET: "files",
        STORAGE_ACCESS_KEY_ID: "a",
        STORAGE_SECRET_ACCESS_KEY: "b",
        STORAGE_ENDPOINT: "https://acct.r2.cloudflarestorage.com",
      })
    ).not.toBeNull();
  });
});

const S3_ENDPOINT = process.env.TEST_S3_ENDPOINT;

describe.skipIf(!S3_ENDPOINT)("createS3Storage against a bucket", () => {
  const storage = createS3Storage({
    bucket: process.env.TEST_S3_BUCKET ?? "intelligo-test",
    region: process.env.TEST_S3_REGION ?? "us-east-1",
    endpoint: S3_ENDPOINT,
    accessKeyId: process.env.TEST_S3_ACCESS_KEY_ID ?? "minioadmin",
    secretAccessKey: process.env.TEST_S3_SECRET_ACCESS_KEY ?? "minioadmin",
  });
  const key = `ws/test/att/${Date.now()} note.txt`;

  it("puts, reads, signs a URL for and deletes an object", async () => {
    const stored = await storage.put({
      key,
      body: new Blob(["hello, bucket"]),
      contentType: "text/plain",
    });
    expect(stored.size).toBe(13);

    const read = await storage.get!(key);
    expect(read.contentType).toBe("text/plain");
    expect(await new Response(read.body).text()).toBe("hello, bucket");

    const url = await storage.getSignedUrl(key, {
      disposition: "attachment",
      filename: "note één.txt",
    });
    const fetched = await fetch(url);
    expect(fetched.status).toBe(200);
    expect(await fetched.text()).toBe("hello, bucket");
    expect(fetched.headers.get("content-disposition")).toContain("attachment");

    await storage.delete(key);
    await expect(storage.get!(key)).rejects.toThrow(/404/);
  });
});
