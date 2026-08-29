import { cn } from "../utils";
import { Badge } from "./badge";

/**
 * Workspace members and their roles.
 *
 * The middle of the three levels, like {@link CreditBalance}: the
 * headless service (`@intelligo/auth`) owns membership, this draws it,
 * and the CLI's settings template wires them together.
 *
 * Presentational only. The role list arrives as a prop rather than
 * being an enum here, because a consumer's RBAC is its own — this
 * package should not decide that "owner | admin | member" is the set
 * of roles that exists.
 *
 * The actions are optional and separate. A table that always renders a
 * remove button teaches people to look for one; a table that renders
 * it only when the caller passed a handler shows exactly the
 * permissions the caller decided this viewer has.
 */

export type WorkspaceMember = {
  id: string;
  name?: string | null;
  email: string;
  role: string;
  joinedAt?: Date | string | null;
};

export type MemberTableLabels = {
  member: string;
  role: string;
  joined: string;
  you: string;
  remove: string;
  empty: string;
};

export const DEFAULT_MEMBER_TABLE_LABELS: MemberTableLabels = {
  member: "Member",
  role: "Role",
  joined: "Joined",
  you: "you",
  remove: "Remove",
  empty: "No members yet.",
};

export type MemberTableProps = {
  members: WorkspaceMember[];
  /** Marks one row as the viewer, and suppresses its remove action. */
  currentUserId?: string;
  /** Roles offered in the picker. Omit to render roles as read-only. */
  roles?: string[];
  onRoleChange?: (memberId: string, role: string) => void;
  /** Omit to hide the remove action entirely. */
  onRemove?: (memberId: string) => void;
  labels?: Partial<MemberTableLabels>;
  /** Defaults to the viewer's locale date. */
  formatDate?: (date: Date) => string;
  className?: string;
};

const formatDateDefault = (date: Date) => date.toLocaleDateString();

function toDate(value: WorkspaceMember["joinedAt"]): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function MemberTable({
  members,
  currentUserId,
  roles,
  onRoleChange,
  onRemove,
  labels,
  formatDate = formatDateDefault,
  className,
}: MemberTableProps) {
  const copy = { ...DEFAULT_MEMBER_TABLE_LABELS, ...labels };

  if (members.length === 0) {
    return (
      <p className={cn("text-muted-foreground text-sm", className)}>
        {copy.empty}
      </p>
    );
  }

  return (
    <table className={cn("w-full text-sm", className)}>
      <thead>
        <tr className="border-b text-left text-muted-foreground text-xs">
          <th className="py-2 font-medium">{copy.member}</th>
          <th className="py-2 font-medium">{copy.role}</th>
          <th className="py-2 font-medium">{copy.joined}</th>
          {onRemove ? <th className="py-2" /> : null}
        </tr>
      </thead>
      <tbody>
        {members.map((member) => {
          const isSelf = member.id === currentUserId;
          const joined = toDate(member.joinedAt);

          return (
            <tr key={member.id} className="border-b last:border-0">
              <td className="py-2">
                <span className="font-medium">
                  {member.name?.trim() || member.email}
                </span>
                {isSelf ? (
                  <span className="ml-2 text-muted-foreground text-xs">
                    ({copy.you})
                  </span>
                ) : null}
                {member.name?.trim() ? (
                  <div className="text-muted-foreground text-xs">
                    {member.email}
                  </div>
                ) : null}
              </td>

              <td className="py-2">
                {roles && onRoleChange && !isSelf ? (
                  <select
                    aria-label={copy.role}
                    className="rounded-md border bg-background px-2 py-1 text-xs"
                    value={member.role}
                    onChange={(event) =>
                      onRoleChange(member.id, event.target.value)
                    }
                  >
                    {roles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Badge variant="secondary">{member.role}</Badge>
                )}
              </td>

              <td className="py-2 text-muted-foreground text-xs">
                {joined ? formatDate(joined) : "—"}
              </td>

              {onRemove ? (
                <td className="py-2 text-right">
                  {/* Never offered for the viewer's own row: removing
                      yourself from the workspace you are administering
                      is a support ticket, not a button. */}
                  {isSelf ? null : (
                    <button
                      type="button"
                      className="text-destructive text-xs hover:underline"
                      onClick={() => onRemove(member.id)}
                    >
                      {copy.remove}
                    </button>
                  )}
                </td>
              ) : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
