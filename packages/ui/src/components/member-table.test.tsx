/**
 * Member table behaviour.
 *
 * Not the markup — the decisions a caller depends on: an action is
 * absent unless a handler was passed, and the viewer never gets a
 * remove button for their own row. Both are permissions expressed as
 * UI, and getting either wrong shows someone a control they cannot use
 * or one they should not.
 *
 * No DOM. The component returns an element tree and these questions
 * are answered by walking it; jsdom would be more machinery to prove
 * the same thing.
 */

import { describe, it, expect, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";

import { MemberTable, type WorkspaceMember } from "./member-table";

const MEMBERS: WorkspaceMember[] = [
  {
    id: "u-1",
    name: "Bataa",
    email: "bataa@example.test",
    role: "owner",
    joinedAt: "2026-01-05T00:00:00.000Z",
  },
  { id: "u-2", name: null, email: "nomin@example.test", role: "member" },
];

/** Every node in the returned tree, depth first. */
function walk(node: ReactNode, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, out);
    return out;
  }
  if (!isValidElement(node)) return out;

  out.push(node);
  walk((node.props as { children?: ReactNode }).children, out);
  return out;
}

function render(props: Partial<Parameters<typeof MemberTable>[0]> = {}) {
  return walk(MemberTable({ members: MEMBERS, ...props }));
}

const byType = (nodes: ReactElement[], type: string) =>
  nodes.filter((n) => n.type === type);

describe("MemberTable", () => {
  it("renders the empty message instead of a headerless table", () => {
    const nodes = render({ members: [] });

    expect(byType(nodes, "table")).toHaveLength(0);
    expect(byType(nodes, "p")).toHaveLength(1);
  });

  it("shows no remove action when no handler was given", () => {
    // A button that does nothing is worse than no button: it teaches
    // people the permission exists.
    expect(byType(render(), "button")).toHaveLength(0);
  });

  it("shows a remove action per removable member", () => {
    const nodes = render({ onRemove: vi.fn() });

    expect(byType(nodes, "button")).toHaveLength(2);
  });

  it("never offers to remove the viewer's own row", () => {
    // Removing yourself from the workspace you administer is a support
    // ticket, not a button.
    const nodes = render({ onRemove: vi.fn(), currentUserId: "u-1" });

    expect(byType(nodes, "button")).toHaveLength(1);
  });

  it("keeps roles read-only unless both a role list and a handler arrive", () => {
    expect(
      byType(render({ roles: ["owner", "member"] }), "select")
    ).toHaveLength(0);
    expect(byType(render({ onRoleChange: vi.fn() }), "select")).toHaveLength(0);

    expect(
      byType(
        render({ roles: ["owner", "member"], onRoleChange: vi.fn() }),
        "select"
      )
    ).toHaveLength(2);
  });

  it("does not offer the viewer a picker for their own role", () => {
    const nodes = render({
      roles: ["owner", "member"],
      onRoleChange: vi.fn(),
      currentUserId: "u-1",
    });

    expect(byType(nodes, "select")).toHaveLength(1);
  });

  it("calls back with the member id and the chosen role", () => {
    const onRoleChange = vi.fn();
    const [picker] = byType(
      render({ roles: ["owner", "member"], onRoleChange }),
      "select"
    );

    (picker!.props as { onChange: (e: unknown) => void }).onChange({
      target: { value: "member" },
    });

    expect(onRoleChange).toHaveBeenCalledWith("u-1", "member");
  });

  it("falls back to the email when a member has no name", () => {
    const text = JSON.stringify(render());

    expect(text).toContain("nomin@example.test");
  });

  it("survives an unparseable joinedAt instead of rendering Invalid Date", () => {
    const nodes = walk(
      MemberTable({
        members: [
          {
            id: "u-3",
            email: "x@example.test",
            role: "member",
            joinedAt: "not a date",
          },
        ],
      })
    );

    expect(JSON.stringify(nodes)).not.toContain("Invalid Date");
  });
});
