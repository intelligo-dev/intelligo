import { afterEach, describe, expect, it } from "vitest";

import {
  attachmentStorageKey,
  clearStorageAdapter,
  createMemoryStorage,
  getStorageAdapter,
  hasStorageAdapter,
  setStorageAdapter,
  StorageUnavailableError,
} from "./index";

afterEach(() => clearStorageAdapter());

describe("storage port", () => {
  it("throws, naming the fix, until an adapter is bound", () => {
    expect(hasStorageAdapter()).toBe(false);
    expect(() => getStorageAdapter()).toThrow(StorageUnavailableError);
    const memory = createMemoryStorage();
    setStorageAdapter(memory);
    expect(getStorageAdapter()).toBe(memory);
  });

  it("keys chat attachments under the workspace", () => {
    expect(attachmentStorageKey("ws-1", "a-1")).toBe("ws/ws-1/att/a-1");
  });
});

describe("createMemoryStorage", () => {
  it("round-trips bytes, blobs and streams and signs as data URLs", async () => {
    const memory = createMemoryStorage();
    const bytes = new Uint8Array([1, 2, 3]);
    await memory.put({ key: "a", body: bytes, contentType: "text/plain" });
    await memory.put({
      key: "b",
      body: new Blob([bytes]),
      contentType: "text/plain",
    });
    await memory.put({
      key: "c",
      body: new Blob([bytes]).stream(),
      contentType: "application/octet-stream",
    });

    expect(await memory.getSignedUrl("a")).toBe("data:text/plain;base64,AQID");
    const got = await memory.get!("c");
    expect(got.contentType).toBe("application/octet-stream");
    expect(got.size).toBe(3);

    await memory.delete("a");
    await expect(memory.getSignedUrl("a")).rejects.toThrow(/No object/);
  });
});
