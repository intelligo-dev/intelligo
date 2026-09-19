import { afterEach, describe, expect, it, vi } from "vitest";

import { emailBrand } from "./brand";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("emailBrand", () => {
  it("takes the name from APP_NAME and the address from SUPPORT_EMAIL", () => {
    vi.stubEnv("APP_NAME", "Acme");
    vi.stubEnv("SUPPORT_EMAIL", "help@acme.test");
    expect(emailBrand()).toEqual({
      name: "Acme",
      supportEmail: "help@acme.test",
    });
  });

  it("falls back to the display name the sender already carries", () => {
    vi.stubEnv("APP_NAME", "");
    vi.stubEnv("SUPPORT_EMAIL", "");
    vi.stubEnv("EMAIL_FROM", '"Acme Support" <noreply@acme.test>');
    expect(emailBrand()).toEqual({ name: "Acme Support", supportEmail: null });
  });

  it("names nobody rather than the framework when nothing is set", () => {
    vi.stubEnv("APP_NAME", "");
    vi.stubEnv("SUPPORT_EMAIL", "");
    vi.stubEnv("EMAIL_FROM", "noreply@acme.test");
    expect(emailBrand()).toEqual({ name: "", supportEmail: null });
  });
});
