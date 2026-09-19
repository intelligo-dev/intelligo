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

const store = vi.hoisted(() => ({ rows: new Map<string, Row>() }));

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
    const row = { ...params, ...actor, extractedText: null };
    store.rows.set(row.id, row);
    return row;
  },
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

  it("does not reveal another workspace's file", async () => {
    const id = await stored("ws-2");
    expect((await get(id)).status).toBe(404);
    expect((await get("missing")).status).toBe(404);
  });
});
