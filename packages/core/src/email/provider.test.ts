import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getEmailProvider,
  resetEmailProviderCache,
  ResendProvider,
  LoopsProvider,
  ConsoleProvider,
} from "./provider";

// Silence provider-selection logs in test output
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  resetEmailProviderCache();
  // Neutralize any keys leaking in from the developer's shell / root .env
  vi.stubEnv("EMAIL_PROVIDER", "");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("LOOPS_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetEmailProviderCache();
});

describe("getEmailProvider factory", () => {
  it("selects Loops when EMAIL_PROVIDER=loops and key is set", () => {
    vi.stubEnv("EMAIL_PROVIDER", "loops");
    vi.stubEnv("LOOPS_API_KEY", "loops-key");
    expect(getEmailProvider()).toBeInstanceOf(LoopsProvider);
  });

  it("selects Resend when EMAIL_PROVIDER=resend and key is set", () => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_key");
    expect(getEmailProvider()).toBeInstanceOf(ResendProvider);
  });

  it("falls back to console when explicit provider lacks its API key", () => {
    vi.stubEnv("EMAIL_PROVIDER", "loops");
    expect(getEmailProvider()).toBeInstanceOf(ConsoleProvider);
  });

  it("auto-detects Resend over Loops when both keys are set", () => {
    vi.stubEnv("RESEND_API_KEY", "re_key");
    vi.stubEnv("LOOPS_API_KEY", "loops-key");
    expect(getEmailProvider()).toBeInstanceOf(ResendProvider);
  });

  it("auto-detects Loops when only LOOPS_API_KEY is set", () => {
    vi.stubEnv("LOOPS_API_KEY", "loops-key");
    expect(getEmailProvider()).toBeInstanceOf(LoopsProvider);
  });

  it("uses console provider when nothing is configured", () => {
    expect(getEmailProvider()).toBeInstanceOf(ConsoleProvider);
  });

  it("ignores an unknown EMAIL_PROVIDER and auto-detects", () => {
    vi.stubEnv("EMAIL_PROVIDER", "sendgrid");
    vi.stubEnv("LOOPS_API_KEY", "loops-key");
    expect(getEmailProvider()).toBeInstanceOf(LoopsProvider);
  });

  it("caches the provider instance until reset", () => {
    vi.stubEnv("LOOPS_API_KEY", "loops-key");
    const first = getEmailProvider();
    vi.stubEnv("LOOPS_API_KEY", "");
    expect(getEmailProvider()).toBe(first);
    resetEmailProviderCache();
    expect(getEmailProvider()).toBeInstanceOf(ConsoleProvider);
  });
});

describe("ResendProvider", () => {
  it("refuses a send with no sender instead of inventing one", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const provider = new ResendProvider("re_key");
    await expect(
      provider.send({ to: "user@example.com", subject: "Welcome", html: "" })
    ).rejects.toMatchObject({
      message: expect.stringContaining("EMAIL_FROM"),
      statusCode: 400,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails a send the provider never answers, as retryable", async () => {
    vi.stubGlobal("fetch", () => new Promise(() => {}));

    const provider = new ResendProvider("re_key", 20);
    await expect(
      provider.send({
        to: "user@example.com",
        subject: "Welcome",
        html: "",
        from: "App <noreply@app.test>",
      })
    ).rejects.toMatchObject({ statusCode: 504 });
  });
});

describe("LoopsProvider", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  function okResponse() {
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    };
  }

  it("sends via the transactional API with an env-mapped template id", async () => {
    vi.stubEnv("LOOPS_TRANSACTIONAL_ID_VERIFY_EMAIL", "tx_123");
    fetchMock.mockResolvedValue(okResponse());

    const provider = new LoopsProvider("loops-key");
    const result = await provider.send({
      to: "user@example.com",
      subject: "Verify your email address",
      html: "<p>ignored by Loops</p>",
      template: {
        key: "verify-email",
        variables: { userName: "Turuu", verificationUrl: "https://x/verify" },
      },
    });

    expect(result.id).toBe("loops:tx_123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.loops.so/api/v1/transactional",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer loops-key",
        }),
      })
    );
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body).toEqual({
      transactionalId: "tx_123",
      email: "user@example.com",
      dataVariables: { userName: "Turuu", verificationUrl: "https://x/verify" },
    });
  });

  it("prefers the constructor transactionalIds map over env", async () => {
    vi.stubEnv("LOOPS_TRANSACTIONAL_ID_WELCOME", "tx_env");
    fetchMock.mockResolvedValue(okResponse());

    const provider = new LoopsProvider("loops-key", { welcome: "tx_map" });
    const result = await provider.send({
      to: "user@example.com",
      subject: "Welcome",
      html: "",
      template: { key: "welcome" },
    });

    expect(result.id).toBe("loops:tx_map");
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.transactionalId).toBe("tx_map");
    expect(body.dataVariables).toEqual({});
  });

  it("fans out one request per recipient", async () => {
    fetchMock.mockResolvedValue(okResponse());

    const provider = new LoopsProvider("loops-key", { welcome: "tx_1" });
    await provider.send({
      to: ["a@example.com", "b@example.com"],
      subject: "Welcome",
      html: "",
      template: { key: "welcome" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const emails = fetchMock.mock.calls.map(
      (call) => JSON.parse(call[1].body as string).email
    );
    expect(emails).toEqual(["a@example.com", "b@example.com"]);
  });

  it("throws a non-retryable 400 when no template is provided", async () => {
    const provider = new LoopsProvider("loops-key");
    await expect(
      provider.send({ to: "user@example.com", subject: "Hi", html: "<p>x</p>" })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws a non-retryable 400 when the template key has no mapping", async () => {
    const provider = new LoopsProvider("loops-key");
    await expect(
      provider.send({
        to: "user@example.com",
        subject: "Hi",
        html: "",
        template: { key: "welcome" },
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the API status code and message on failure", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ message: "Transactional email not found" }),
    });

    const provider = new LoopsProvider("loops-key", { welcome: "tx_bad" });
    await expect(
      provider.send({
        to: "user@example.com",
        subject: "Welcome",
        html: "",
        template: { key: "welcome" },
      })
    ).rejects.toMatchObject({
      statusCode: 404,
      message: expect.stringContaining("Transactional email not found"),
    });
  });

  it("gives up on a request the API never answers", async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(init.signal!.reason)
          );
        })
    );

    const provider = new LoopsProvider("loops-key", { welcome: "tx_1" }, 20);
    await expect(
      provider.send({
        to: "user@example.com",
        subject: "Welcome",
        html: "",
        template: { key: "welcome" },
      })
    ).rejects.toMatchObject({ name: "TimeoutError" });
  });
});

describe("ConsoleProvider", () => {
  const verify = {
    to: "dev@local.test",
    subject: "Verify your email address",
    html: "",
    template: {
      key: "verify-email",
      variables: {
        userName: "Dev",
        verificationUrl: "http://localhost:4002/api/auth/verify-email?token=t",
      },
    },
  };

  it("logs the links a message carries outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");

    await new ConsoleProvider().send(verify);

    const logged = vi.mocked(console.log).mock.calls.flat().join("\n");
    expect(logged).toContain(
      "verificationUrl: http://localhost:4002/api/auth/verify-email?token=t"
    );
    expect(logged).not.toContain("userName");
  });

  it("keeps links out of a production log", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await new ConsoleProvider().send(verify);

    // The production line goes through the logger, which masks the
    // address; neither the address nor a link reaches the console.
    const logged = vi.mocked(console.log).mock.calls.flat().join("\n");
    expect(logged).not.toContain("dev@local.test");
    expect(logged).not.toContain("token=t");
  });
});
