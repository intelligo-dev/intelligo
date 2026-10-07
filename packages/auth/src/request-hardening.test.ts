import { describe, expect, it } from "vitest";

import {
  displayNameProblem,
  ipAddressOptions,
  SERVICE_ONLY_ADMIN_PATHS,
  SERVICE_ONLY_ORGANIZATION_PATHS,
  workspaceNameProblem,
} from "./request-hardening";

describe("SERVICE_ONLY_ORGANIZATION_PATHS", () => {
  it("closes every organization endpoint a service applies limits or hooks around", () => {
    for (const path of [
      "/organization/create",
      "/organization/delete",
      "/organization/invite-member",
      "/organization/accept-invitation",
      "/organization/leave",
      "/organization/remove-member",
    ]) {
      expect(SERVICE_ONLY_ORGANIZATION_PATHS).toContain(path);
    }
  });

  it("leaves set-active to the browser's workspace switcher", () => {
    expect(SERVICE_ONLY_ORGANIZATION_PATHS).not.toContain(
      "/organization/set-active"
    );
  });
});

describe("SERVICE_ONLY_ADMIN_PATHS", () => {
  it("closes raw impersonation, which skips the reason and the audit event", () => {
    expect(SERVICE_ONLY_ADMIN_PATHS).toContain("/admin/impersonate-user");
  });
});

describe("ipAddressOptions", () => {
  it("is empty when nothing is configured, leaving Better-Auth's default", () => {
    expect(ipAddressOptions({})).toEqual({});
    expect(
      ipAddressOptions({ AUTH_IP_HEADERS: " ", AUTH_TRUSTED_PROXIES: "" })
    ).toEqual({});
  });

  it("reads the headers in order and the trusted proxies as a list", () => {
    expect(
      ipAddressOptions({
        AUTH_IP_HEADERS: "CF-Connecting-IP, x-forwarded-for",
        AUTH_TRUSTED_PROXIES: "10.0.0.0/8, 173.245.48.0/20",
      })
    ).toEqual({
      ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
      trustedProxies: ["10.0.0.0/8", "173.245.48.0/20"],
    });
  });
});

describe("displayNameProblem", () => {
  it("accepts an ordinary name, and leaves a missing one to the form", () => {
    expect(displayNameProblem("Ada Lovelace")).toBeNull();
    expect(displayNameProblem(undefined)).toBeNull();
    expect(displayNameProblem("x".repeat(50))).toBeNull();
  });

  it("refuses a name longer than the form allows, or one carrying a link", () => {
    expect(displayNameProblem("x".repeat(51))).toMatch(/50/);
    expect(displayNameProblem("Verify at https://evil.example")).toMatch(
      /link/
    );
    expect(displayNameProblem("see WWW.evil.example")).toMatch(/link/);
    expect(displayNameProblem("Pay at evil.example/pay")).toMatch(/link/);
  });
});

describe("workspaceNameProblem", () => {
  it("accepts an ordinary workspace name", () => {
    expect(workspaceNameProblem("Acme Inc.")).toBeNull();
    expect(workspaceNameProblem("R&D team 2")).toBeNull();
    expect(workspaceNameProblem(undefined)).toBeNull();
  });

  it("refuses a name carrying a link, bare domains included", () => {
    expect(workspaceNameProblem("Pay invoice at evil.example/pay")).toMatch(
      /link/
    );
    expect(workspaceNameProblem("https://evil.example")).toMatch(/link/);
    expect(workspaceNameProblem("www.evil")).toMatch(/link/);
  });
});
