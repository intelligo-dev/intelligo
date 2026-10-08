/**
 * The stored-attachment routes against a memory bucket and a fake
 * attachments table. Tenancy is the point: a row is readable inside
 * its workspace and invisible outside it, and the transcript never
 * learns the signed URL.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMemoryStorage } from "@intelligo-dev/core/storage";
import {
  clearStorageAdapter,
  setStorageAdapter,
} from "@intelligo-dev/core/storage";
import type { Executions } from "@intelligo-dev/executions";

import {
  createChatAttachmentHandler,
  createChatUploadHandler,
} from "./attachments";
import type { ChatServerConfig } from "./config";

type Row = {
  id: string;
  workspaceId: string;
  userId: string;
  storageKey: string;
  filename: string;
  mediaType: string;
  sizeBytes: number;
  extractedText: string | null;
};

const store = vi.hoisted(() => ({
  rows: new Map<string, Row>(),
  insertFails: false,
}));

const billing = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  getWorkspaceBilling: vi.fn(),
  hasFeature: vi.fn(),
}));

vi.mock("@intelligo-dev/billing", () => billing);

class FakeAttachmentError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

vi.mock("@intelligo-dev/core/attachments", () => ({
  isAttachmentServiceError: (e: unknown) => e instanceof FakeAttachmentError,
  createAttachment: async (
    actor: { workspaceId: string; userId: string },
    params: Omit<Row, "workspaceId" | "userId" | "extractedText">
  ) => {
    if (store.insertFails) throw new Error("connection lost");
    const row = { ...params, ...actor, extractedText: null };
    store.rows.set(row.id, row);
    return row;
  },
  unclaimedAttachmentBytes: async (actor: { workspaceId: string }) =>
    [...store.rows.values()]
      .filter((row) => row.workspaceId === actor.workspaceId)
      .reduce((sum, row) => sum + row.sizeBytes, 0),
  getAttachment: async (actor: { workspaceId: string }, id: string) => {
    const row = store.rows.get(id);
    if (!row || row.workspaceId !== actor.workspaceId) {
      throw new FakeAttachmentError("not_found");
    }
    return row;
  },
  setExtractedText: async (
    _actor: unknown,
    params: { id: string; text: string | null }
  ) => {
    const row = store.rows.get(params.id);
    if (row) row.extractedText = params.text;
  },
}));
vi.mock("@intelligo-dev/auth", () => ({ requireWorkspace: vi.fn() }));
vi.mock("@intelligo-dev/core/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const actor = { workspaceId: "ws-1", userId: "u-1" };

function config(extra: Partial<ChatServerConfig> = {}): ChatServerConfig {
  return {
    executions: {} as Executions,
    model: {
      defaultId: "google/gemini-2.5-flash",
      resolve: () => ({}) as never,
    },
    authenticate: async () => actor,
    attachments: {
      accept: ["image/png", "application/pdf"],
      maxBytes: 1024,
      mode: "stored",
    },
    ...extra,
  };
}

function upload(file: Blob | null, name = "photo.png") {
  const form = new FormData();
  if (file) form.set("file", file, name);
  return new Request("http://app.test/api/chat/upload", {
    method: "POST",
    body: form,
  });
}

const png = () =>
  new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });

let memory: ReturnType<typeof createMemoryStorage>;

beforeEach(() => {
  store.rows.clear();
  store.insertFails = false;
  billing.getWorkspaceBilling.mockResolvedValue({ plan: { slug: "pro" } });
  billing.checkRateLimit.mockResolvedValue({ allowed: true });
  billing.hasFeature.mockResolvedValue(true);
  memory = createMemoryStorage();
  setStorageAdapter(memory);
});

afterEach(() => {
  clearStorageAdapter();
  vi.clearAllMocks();
});

describe("createChatUploadHandler", () => {
  it("stores the file, records the row and answers the app URL", async () => {
    const { POST } = createChatUploadHandler(config());
    const response = await POST(upload(png()));
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      id: string;
      url: string;
      filename: string;
      mediaType: string;
      size: number;
    };
    expect(body).toMatchObject({
      filename: "photo.png",
      mediaType: "image/png",
      size: 4,
      url: `/api/chat/attachments/${body.id}`,
    });
    expect(memory.objects.has(`ws/ws-1/att/${body.id}`)).toBe(true);
    expect(store.rows.get(body.id)).toMatchObject({
      workspaceId: "ws-1",
      userId: "u-1",
      storageKey: `ws/ws-1/att/${body.id}`,
    });
  });

  it("refuses a type the policy rejects, an oversized file and a missing file", async () => {
    const { POST } = createChatUploadHandler(config());
    const gif = new Blob([new Uint8Array(3)], { type: "image/gif" });
    expect((await POST(upload(gif, "a.gif"))).status).toBe(400);
    const big = new Blob([new Uint8Array(2048)], { type: "image/png" });
    expect((await POST(upload(big))).status).toBe(400);
    expect((await POST(upload(null))).status).toBe(400);
    expect(memory.objects.size).toBe(0);
  });

  it("refuses a body that declares more than the limit before reading it", async () => {
    const { POST } = createChatUploadHandler(config());
    const formData = vi.fn();
    const request = {
      headers: new Headers({ "content-length": String(50 * 1024 * 1024) }),
      formData,
    } as unknown as Request;
    expect((await POST(request)).status).toBe(400);
    expect(formData).not.toHaveBeenCalled();
  });

  it("stops reading a body with no declared length once it passes the limit", async () => {
    const { POST } = createChatUploadHandler(config());
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(16 * 1024));
      },
    });
    const request = new Request("http://app.test/api/chat/attachments", {
      method: "POST",
      body: endless,
      headers: { "content-type": "multipart/form-data; boundary=x" },
      duplex: "half",
    } as RequestInit);

    expect((await POST(request)).status).toBe(400);
    // 1 KB allowed plus 64 KB of form overhead: a handful of chunks.
    expect(pulled).toBeLessThan(10);
    expect(memory.objects.size).toBe(0);
  });

  it("applies the default limit when the policy names none", async () => {
    const { POST } = createChatUploadHandler(
      config({ attachments: { accept: ["image/png"], mode: "stored" } })
    );
    const huge = new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], {
      type: "image/png",
    });
    expect((await POST(upload(huge))).status).toBe(400);
    expect(memory.objects.size).toBe(0);
  });

  it("refuses when the policy is inline or unset", async () => {
    const { POST } = createChatUploadHandler(
      config({ attachments: { accept: ["image/png"] } })
    );
    expect((await POST(upload(png()))).status).toBe(400);
  });

  it("answers 401 without a session and 500 without a bucket", async () => {
    const { POST } = createChatUploadHandler(
      config({
        authenticate: async () => {
          throw new Error("no session");
        },
      })
    );
    expect((await POST(upload(png()))).status).toBe(401);

    clearStorageAdapter();
    const bare = createChatUploadHandler(config());
    expect((await bare.POST(upload(png()))).status).toBe(500);
  });

  it("extracts text from documents, not images, and keeps it on the row", async () => {
    const extractText = vi.fn(async () => "Q3 revenue grew");
    const { POST } = createChatUploadHandler(
      config({
        attachments: {
          accept: ["image/png", "application/pdf"],
          mode: "stored",
          extractText,
        },
      })
    );
    const pdf = new Blob([new Uint8Array([37, 80, 68, 70])], {
      type: "application/pdf",
    });
    const body = (await (await POST(upload(pdf, "q3.pdf"))).json()) as {
      id: string;
    };
    expect(extractText).toHaveBeenCalledWith(
      expect.objectContaining({ id: body.id, mediaType: "application/pdf" })
    );
    expect(store.rows.get(body.id)!.extractedText).toBe("Q3 revenue grew");

    await POST(upload(png()));
    expect(extractText).toHaveBeenCalledTimes(1);
  });

  it("refuses a workspace over its upload rate before reading the file", async () => {
    billing.checkRateLimit.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 12,
    });
    const { POST } = createChatUploadHandler(config());

    const response = await POST(upload(png()));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("12");
    expect(billing.checkRateLimit).toHaveBeenCalledWith(
      "ws-1",
      "pro",
      "chat-upload"
    );
    expect(memory.objects.size).toBe(0);
  });

  it("uses the policy's own rate limit, and none when the config disables it", async () => {
    const rateLimit = vi.fn(async () => ({ allowed: false }));
    const own = createChatUploadHandler(
      config({
        attachments: { accept: ["image/png"], mode: "stored", rateLimit },
      })
    );
    expect((await own.POST(upload(png()))).status).toBe(429);
    expect(rateLimit).toHaveBeenCalledWith(actor);

    billing.checkRateLimit.mockResolvedValue({ allowed: false });
    const off = createChatUploadHandler(config({ rateLimit: false }));
    expect((await off.POST(upload(png()))).status).toBe(201);
  });

  it("refuses a workspace without the chat feature", async () => {
    billing.hasFeature.mockResolvedValue(false);
    const { POST } = createChatUploadHandler(config());

    expect((await POST(upload(png()))).status).toBe(403);
    expect(billing.hasFeature).toHaveBeenCalledWith("ws-1", "chat");
    expect(memory.objects.size).toBe(0);

    const ungated = createChatUploadHandler(config({ featureKey: null }));
    expect((await ungated.POST(upload(png()))).status).toBe(201);
  });

  it("refuses an upload past the workspace's unclaimed bytes", async () => {
    const { POST } = createChatUploadHandler(
      config({
        attachments: {
          accept: ["image/png"],
          mode: "stored",
          maxUnclaimedBytes: 6,
        },
      })
    );

    expect((await POST(upload(png()))).status).toBe(201);
    expect((await POST(upload(png()))).status).toBe(402);
    expect(memory.objects.size).toBe(1);
  });

  it("caps unclaimed uploads at ten files' worth by default", async () => {
    const { POST } = createChatUploadHandler(config());
    const full = new Blob([new Uint8Array(1024)], { type: "image/png" });
    for (let i = 0; i < 10; i++) {
      expect((await POST(upload(full))).status).toBe(201);
    }
    expect((await POST(upload(png()))).status).toBe(402);
  });

  it("asks the deployment's quota before storing anything", async () => {
    const admitUpload = vi.fn(async () => false);
    const { POST } = createChatUploadHandler(
      config({
        attachments: { accept: ["image/png"], mode: "stored", admitUpload },
      })
    );

    expect((await POST(upload(png()))).status).toBe(402);
    expect(admitUpload).toHaveBeenCalledWith(actor, {
      filename: "photo.png",
      mediaType: "image/png",
      size: 4,
    });
    expect(memory.objects.size).toBe(0);
  });

  it("deletes the stored object when its row cannot be written", async () => {
    store.insertFails = true;
    const { POST } = createChatUploadHandler(config());

    expect((await POST(upload(png()))).status).toBe(500);
    expect(memory.objects.size).toBe(0);
  });
});

describe("createChatAttachmentHandler", () => {
  async function stored(workspaceId = "ws-1") {
    const id = crypto.randomUUID();
    const key = `ws/${workspaceId}/att/${id}`;
    await memory.put({ key, body: png(), contentType: "image/png" });
    store.rows.set(id, {
      id,
      workspaceId,
      userId: "u-9",
      storageKey: key,
      filename: "photo.png",
      mediaType: "image/png",
      sizeBytes: 4,
      extractedText: null,
    });
    return id;
  }

  const get = (id: string) =>
    createChatAttachmentHandler(config()).GET(
      new Request(`http://app.test/api/chat/attachments/${id}`),
      { params: Promise.resolve({ id }) }
    );

  it("redirects a workspace member to a fresh signed URL", async () => {
    const id = await stored();
    const response = await get(id);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toMatch(
      /^data:image\/png;base64,/
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("serves only kinds that run nothing inline, and the rest as downloads", async () => {
    const signed = vi.spyOn(memory, "getSignedUrl");
    const svg = await stored();
    store.rows.get(svg)!.mediaType = "image/svg+xml";
    await get(svg);
    expect(signed).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ disposition: "attachment" })
    );

    await get(await stored());
    expect(signed).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ disposition: "inline" })
    );
  });

  it("does not reveal another workspace's file", async () => {
    const id = await stored("ws-2");
    expect((await get(id)).status).toBe(404);
    expect((await get("missing")).status).toBe(404);
  });
});
