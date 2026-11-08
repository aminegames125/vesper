import {
  type AdminUser,
  type CloudClient,
  type CloudUser,
  formatBytes,
  type Role,
} from "@vesper/cloud-client";
import { type FormEvent, useState } from "react";
import { useAction, useLoad } from "../hooks";
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Modal,
  Notice,
  PageHeader,
  ROW,
  Select,
  when,
} from "../ui";

const GB = 1024 ** 3;
const limit = (n: number, unit = "") => (n === 0 ? "no limit" : `${n}${unit}`);

export function UsersPage({ client, me }: { client: CloudClient; me: CloudUser }) {
  const { data: users, error, reload } = useLoad(() => client.admin.users(), 10_000);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminUser | "new" | null>(null);
  const run = useAction(reload, setMessage);

  return (
    <div>
      <PageHeader title="Users" lead="Accounts on this server, their limits and who is online." />
      <Notice>{error ?? message}</Notice>
      <Card
        title={`${users?.length ?? 0} accounts`}
        actions={
          <Button variant="primary" onClick={() => setEditing("new")}>
            Add a user
          </Button>
        }
      >
        {users && users.length === 0 && (
          <Empty>No users yet. Add one, or create an invite code.</Empty>
        )}
        <ul className="divide-y divide-line">
          {users?.map((u) => (
            <li key={u.id} className={ROW}>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-semibold">
                  {u.username}
                  <Badge tone={u.role === "admin" ? "accent" : "muted"}>{u.role}</Badge>
                  {u.status === "suspended" && <Badge tone="accent">suspended</Badge>}
                  {u.sessions > 0 && <Badge tone="ok">online</Badge>}
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  {formatBytes(u.storageUsed)} of{" "}
                  {u.storageBytes ? formatBytes(u.storageBytes) : "unlimited"} · {u.recordings}{" "}
                  recordings · up to {limit(u.maxConcurrent)} at once, {limit(u.maxHours, "h")} each
                  · last seen {when(u.lastLogin)}
                </p>
                {u.note && <p className="mt-0.5 text-sm text-muted">{u.note}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setEditing(u)}>Edit</Button>
                {u.id !== me.id && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void run(() =>
                        client.admin.updateUser(u.id, {
                          status: u.status === "active" ? "suspended" : "active",
                        }),
                      )
                    }
                  >
                    {u.status === "active" ? "Suspend" : "Restore"}
                  </Button>
                )}
                {u.sessions > 0 && (
                  <Button
                    variant="ghost"
                    onClick={() => void run(() => client.admin.revokeSessions(u.id))}
                  >
                    Sign out everywhere
                  </Button>
                )}
                {u.id !== me.id && (
                  <Button
                    variant="danger"
                    onClick={() => {
                      if (window.confirm(`Delete ${u.username} and all of their recordings?`))
                        void run(() => client.admin.deleteUser(u.id));
                    }}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
      {editing && (
        <UserForm
          client={client}
          user={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}

function UserForm({
  client,
  user,
  onClose,
  onSaved,
}: {
  client: CloudClient;
  user: AdminUser | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [username, setUsername] = useState(user?.username ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(user?.role ?? "user");
  const [concurrent, setConcurrent] = useState(String(user?.maxConcurrent ?? 1));
  const [hours, setHours] = useState(String(user?.maxHours ?? 4));
  const [storage, setStorage] = useState(String(user ? Math.round(user.storageBytes / GB) : 5));
  const [keep, setKeep] = useState(String(user?.keepHours ?? 0));
  const [note, setNote] = useState(user?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const limits = {
      max_concurrent: Number(concurrent),
      max_hours: Number(hours),
      storage_gb: Number(storage),
      keep_hours: Number(keep),
      note,
    };
    try {
      if (user)
        await client.admin.updateUser(user.id, {
          role,
          ...limits,
          ...(password ? { password } : {}),
        });
      else await client.admin.createUser({ username, password, role, ...limits });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={user ? `Edit ${user.username}` : "Add a user"} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {!user && (
          <Field
            label="Username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        )}
        <Field
          label={user ? "New password (leave empty to keep)" : "Password"}
          type="password"
          required={!user}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="At least 8 characters. Changing it signs the user out everywhere."
        />
        <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="user">User: watch, sync, and record from Kodi</option>
          <option value="guest">Guest: watch and sync only</option>
          <option value="admin">Admin: manage everything</option>
        </Select>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Recordings at once"
            type="number"
            min={0}
            value={concurrent}
            onChange={(e) => setConcurrent(e.target.value)}
            hint="0 = no limit"
          />
          <Field
            label="Longest recording (hours)"
            type="number"
            min={0}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            hint="0 = no limit"
          />
          <Field
            label="Storage (GB)"
            type="number"
            min={0}
            value={storage}
            onChange={(e) => setStorage(e.target.value)}
            hint="0 = no limit"
          />
          <Field
            label="Keep recordings (hours)"
            type="number"
            min={0}
            value={keep}
            onChange={(e) => setKeep(e.target.value)}
            hint="0 = until deleted"
          />
        </div>
        <Field label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        {error && (
          <p role="alert" className="text-sm text-accent">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
