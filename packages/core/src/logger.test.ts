import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PassThrough } from "node:stream";

// The logger module reads process.env.NODE_ENV at module load time,
// so we must use vi.stubEnv + vi.resetModules + dynamic imports to test
// different environment behaviors.

/** Collect pino JSON output into a buffer via PassThrough stream */
function createTestStream() {
  const stream = new PassThrough();
  const chunks: string[] = [];
  stream.on("data", (chunk) => chunks.push(chunk.toString()));
  return {
    stream,
    getOutput: () => chunks.join(""),
    getLines: () => chunks.join("").trim().split("\n"),
  };
}

describe("Logger", () => {
  describe("in development mode", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "development");
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    it("creates logger with context and logs messages", async () => {
      const { _createLoggerWithStream } = await import("./logger");
      const { stream, getOutput } = createTestStream();
      const log = _createLoggerWithStream("TestModule", stream);
      log.info("test message");
      const output = getOutput();
      expect(output).toContain("TestModule");
      expect(output).toContain("test message");
    });

    it("does not redact emails in development", async () => {
      const { _createLoggerWithStream } = await import("./logger");
      const { stream, getOutput } = createTestStream();
      const log = _createLoggerWithStream("Test", stream);
      log.info("user", { email: "user@example.com" });
      const output = getOutput();
      expect(output).toContain("user@example.com");
    });

    it("logs debug messages in development", async () => {
      const { _createLoggerWithStream } = await import("./logger");
      const { stream, getOutput } = createTestStream();
      const log = _createLoggerWithStream("Test", stream);
      log.debug("debug info");
      const output = getOutput();
      expect(output).toContain("debug info");
    });

    it("logs error level messages", async () => {
      const { _createLoggerWithStream } = await import("./logger");
      const { stream, getOutput } = createTestStream();
      const log = _createLoggerWithStream("Test", stream);
      log.error("something broke");
      const output = getOutput();
      expect(output).toContain("something broke");
    });

    it("logs warn level messages", async () => {
      const { _createLoggerWithStream } = await import("./logger");
      const { stream, getOutput } = createTestStream();
      const log = _createLoggerWithStream("Test", stream);
      log.warn("warning");
      const output = getOutput();
      expect(output).toContain("warning");
    });
  });

  describe("in production mode", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "production");
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    it("redacts emails in production", async () => {
      const { _createLoggerWithStream } = await import("./logger");
      const { stream, getOutput } = createTestStream();
      const log = _createLoggerWithStream("Test", stream);
      log.info("user", { email: "user@example.com" });
      const output = getOutput();
      expect(output).toContain("u***@example.com");
      expect(output).not.toContain("user@example.com");
    });

    it("redacts IDs in production", async () => {
      const { _createLoggerWithStream } = await import("./logger");
      const { stream, getOutput } = createTestStream();
      const log = _createLoggerWithStream("Test", stream);
      log.info("workspace", { workspaceId: "ws_abc123def456" });
      const output = getOutput();
      expect(output).toContain("ws_a...f456");
      expect(output).not.toContain("ws_abc123def456");
    });

    it("suppresses debug messages in production", async () => {
      const { _createLoggerWithStream } = await import("./logger");
      const { stream, getOutput } = createTestStream();
      const log = _createLoggerWithStream("Test", stream);
      log.debug("should not appear");
      const output = getOutput();
      expect(output).not.toContain("should not appear");
    });

    it("outputs valid JSON in production", async () => {
      const { _createLoggerWithStream } = await import("./logger");
      const { stream, getLines } = createTestStream();
      const log = _createLoggerWithStream("ProdTest", stream);
      log.info("hello prod");
      const lines = getLines();
      const parsed = JSON.parse(lines[0]!);
      expect(parsed.module).toBe("ProdTest");
      expect(parsed.msg).toBe("hello prod");
    });
  });
});
