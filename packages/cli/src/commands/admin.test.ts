/**
 * A development setup with no email provider never verifies an address,
 * so the allowlist never promotes anyone: `admin grant` is the way in,
 * and it must not become a quiet way in on production.
 */

import { describe, expect, it } from "vitest";

import {
  formatRevokeResult,
  grantExitCode,
  grantPlatformAdmin,
  revokeExitCode,
  revokePlatformAdmin,
} from "./admin.js";

function database(
  user: { id: string; email: string; role: string | null } | null
) {
  const statements: Array<{ sql: string; params?: unknown[] }> = [];
  const query = async (sql: string, params?: unknown[]) => {
    statements.push({ sql, params });
    return sql.startsWith("SELECT") && user ? [user] : [];
  };
  return { query, statements };
}

describe("grantPlatformAdmin", () => {
  it("adds the role beside the user's others and audits it, in one transaction", async () => {
    const db = database({ id: "u1", email: "Ada@Example.com", role: "tester" });

    const r = await grantPlatformAdmin("ada@example.com", db.query, {
      production: false,
    });

    expect(r).toEqual({
      status: "granted",
      userId: "u1",
      email: "Ada@Example.com",
    });
    expect(db.statements.map((s) => s.sql.split(/\s/)[0])).toEqual([
      "SELECT",
      "BEGIN",
      "UPDATE",
      "INSERT",
      "COMMIT",
    ]);
    expect(db.statements[2]!.params).toEqual(["u1", "tester,platform-admin"]);
    expect(db.statements[3]!.sql).toContain("admin.platform_admin.granted");
  });

  it("leaves a user who already has the role alone", async () => {
    const db = database({ id: "u1", email: "a@x.io", role: "platform-admin" });

    const r = await grantPlatformAdmin("a@x.io", db.query, {
      production: false,
    });

    expect(r.status).toBe("already");
    expect(grantExitCode(r)).toBe(0);
    expect(db.statements).toHaveLength(1);
  });

  it("fails on an address nobody signed up with", async () => {
    const r = await grantPlatformAdmin("nobody@x.io", database(null).query, {
      production: false,
    });

    expect(r.status).toBe("not_found");
    expect(grantExitCode(r)).toBe(1);
  });

  it("refuses in production without --force, before touching the database", async () => {
    const db = database({ id: "u1", email: "a@x.io", role: null });

    const r = await grantPlatformAdmin("a@x.io", db.query, {
      production: true,
    });

    expect(r.status).toBe("refused");
    expect(db.statements).toEqual([]);

    const forced = await grantPlatformAdmin("a@x.io", db.query, {
      production: true,
      force: true,
    });
    expect(forced.status).toBe("granted");
  });

  it("rolls back when the audit event cannot be written", async () => {
    const statements: string[] = [];
    const query = async (sql: string) => {
      statements.push(sql.split(/\s/)[0]!);
      if (sql.startsWith("SELECT"))
        return [{ id: "u1", email: "a@x.io", role: null }];
      if (sql.startsWith("INSERT")) throw new Error("audit_events is missing");
      return [];
    };

    await expect(
      grantPlatformAdmin("a@x.io", query, { production: false })
    ).rejects.toThrow(/audit_events/);
    expect(statements).toEqual([
      "SELECT",
      "BEGIN",
      "UPDATE",
      "INSERT",
      "ROLLBACK",
    ]);
  });
});

describe("revokePlatformAdmin", () => {
  it("removes the role, audits it and ends the sessions, in one transaction", async () => {
    const db = database({
      id: "u1",
      email: "a@x.io",
      role: "tester,platform-admin",
    });

    const r = await revokePlatformAdmin("a@x.io", db.query, {
      production: false,
    });

    expect(r).toMatchObject({ status: "revoked", allowlisted: false });
    expect(revokeExitCode(r)).toBe(0);
    expect(db.statements.map((s) => s.sql.trim().split(/\s/)[0])).toEqual([
      "SELECT",
      "BEGIN",
      "UPDATE",
      "INSERT",
      "DELETE",
      "COMMIT",
    ]);
    expect(db.statements[2]!.params).toEqual(["u1", "tester"]);
    expect(db.statements[3]!.sql).toContain("admin.platform_admin.revoked");
  });

  it("leaves a plain user role when admin was the only one", async () => {
    const db = database({ id: "u1", email: "a@x.io", role: "platform-admin" });
    await revokePlatformAdmin("a@x.io", db.query, { production: false });
    expect(db.statements[2]!.params).toEqual(["u1", "user"]);
  });

  it("warns that the allowlist will promote the address again", async () => {
    const db = database({ id: "u1", email: "A@x.io", role: "platform-admin" });
    const r = await revokePlatformAdmin("a@x.io", db.query, {
      production: false,
      allowlist: "ops@x.io, a@X.io",
    });
    expect(r).toMatchObject({ status: "revoked", allowlisted: true });
    expect(formatRevokeResult(r)).toContain("PLATFORM_ADMIN_EMAILS");
  });

  it("refuses in production without --force, and touches nothing for a non-admin", async () => {
    const refused = await revokePlatformAdmin("a@x.io", database(null).query, {
      production: true,
    });
    expect(refused.status).toBe("refused");
    expect(revokeExitCode(refused)).toBe(1);

    const db = database({ id: "u1", email: "a@x.io", role: "user" });
    const r = await revokePlatformAdmin("a@x.io", db.query, {
      production: false,
    });
    expect(r.status).toBe("not_admin");
    expect(db.statements).toHaveLength(1);
  });
});
