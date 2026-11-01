import { type CloudClient, formatBytes, type Role } from "@vesper/cloud-client";
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

export function InvitesPage({ client }: { client: CloudClient }) {
  const { data: invites, error, reload } = useLoad(() => client.admin.invites(), 15_000);
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const run = useAction(reload, setMessage);

  return (
    <div>
      <PageHeader
        title="Invites"
        lead="An invite code lets someone create their own account with the role and limits you choose. Turn on invite registration under Settings so the app shows the code field."
      />
      <Notice>{error ?? message}</Notice>
      <Card
        title={`${invites?.length ?? 0} codes`}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            Create a code
          </Button>
        }
      >
        {invites && invites.length === 0 && <Empty>No invite codes yet.</Empty>}
        <ul className="divide-y divide-line">
          {invites?.map((i) => (
            <li key={i.code} className={ROW}>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2">
                  <code className="select-text rounded-lg bg-raised px-2.5 py-1 font-mono text-sm text-accent">
                    {i.code}
                  </code>
                  <Badge>{i.role}</Badge>
                  <Badge tone={i.usesLeft > 0 ? "ok" : "accent"}>
                    {i.usesLeft} use{i.usesLeft === 1 ? "" : "s"} left
                  </Badge>
                </p>
                <p className="mt-1 text-xs text-muted">
                  {i.storageBytes ? formatBytes(i.storageBytes) : "unlimited"} storage · expires{" "}
                  {i.expiresAt ? when(i.expiresAt) : "never"}
                  {i.note ? ` · ${i.note}` : ""}
                </p>
              </div>
              <Button variant="ghost" onClick={() => void navigator.clipboard?.writeText(i.code)}>
                Copy
              </Button>
              <Button
                variant="danger"
                onClick={() => void run(() => client.admin.deleteInvite(i.code))}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      </Card>
      {creating && (
        <InviteForm
          client={client}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void reload();
          }}
        />
      )}
    </div>
  );
}

function InviteForm({
  client,
  onClose,
  onSaved,
}: {
  client: CloudClient;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [role, setRole] = useState<Role>("user");
  const [uses, setUses] = useState("1");
  const [days, setDays] = useState("7");
  const [hours, setHours] = useState("4");
  const [storage, setStorage] = useState("5");
  const [keep, setKeep] = useState("0");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await client.admin.createInvite({
        role,
        uses: Number(uses),
        expires_days: Number(days),
        max_hours: Number(hours),
        storage_gb: Number(storage),
        keep_hours: Number(keep),
        note,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the code.");
    }
  };

  return (
    <Modal title="Create an invite code" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="user">User</option>
          <option value="guest">Guest</option>
          <option value="admin">Admin</option>
        </Select>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="How many people"
            type="number"
            min={1}
            value={uses}
            onChange={(e) => setUses(e.target.value)}
          />
          <Field
            label="Expires in (days)"
            type="number"
            min={0}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            hint="0 = never"
          />
          <Field
            label="Longest recording (hours)"
            type="number"
            min={0}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
          <Field
            label="Storage (GB)"
            type="number"
            min={0}
            value={storage}
            onChange={(e) => setStorage(e.target.value)}
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
        <Field
          label="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Who is this for?"
        />
        {error && (
          <p role="alert" className="text-sm text-accent">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}
