/**
 * The impersonation control.
 *
 * A plain form on purpose. The reason field is `required` and the
 * submit label says what will happen, because the two mistakes worth
 * designing against are a click made without thinking and an access
 * nobody can explain later.
 *
 * The action is the consumer's — @intelligo-dev/admin never imports app
 * code — so the page passes it in.
 */

export type ImpersonationPanelProps = {
  /** Server action bound by the consumer application. */
  action: (formData: FormData) => void | Promise<void>;
  /** Candidate users, usually the workspace list's members. */
  users: { id: string; email: string | null; name?: string | null }[];
  error?: string;
};

export function ImpersonationPanel({
  action,
  users,
  error,
}: ImpersonationPanelProps) {
  return (
    <section>
      <h2>Act as a user</h2>
      <p>
        Creates a session as the chosen user for 30 minutes. The access is
        recorded against your account and cannot proceed unrecorded.
      </p>
      {error ? <p role="alert">{error}</p> : null}
      <form action={action}>
        <label htmlFor="impersonate-user">User</label>
        <select id="impersonate-user" name="userId" required>
          <option value="">Choose…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.email ?? u.name ?? u.id}
            </option>
          ))}
        </select>

        <label htmlFor="impersonate-reason">Reason</label>
        <input
          id="impersonate-reason"
          name="reason"
          required
          minLength={3}
          placeholder="Ticket or incident this is for"
        />

        <button type="submit">Start acting as this user</button>
      </form>
    </section>
  );
}
