// Typed client for the Vesper Cloud API (`/api/v1`). Used by the app and by the admin panel.

export type Mode = "lite" | "full";
export type Role = "admin" | "user" | "guest";
export type Registration = "closed" | "invite" | "open";

export interface ServerInfo {
  name: string;
  version: string;
  mode: Mode;
  registration: Registration;
  needsSetup: boolean;
  features: string[];
}

export interface CloudUser {
  id: string;
  username: string;
  role: Role;
  status: "active" | "suspended";
  /** 0 means no limit. */
  max_concurrent: number;
  max_hours: number;
  storage_bytes: number;
  keep_hours: number | null;
  note: string;
  created_at: number;
  last_login: number | null;
  storageUsed: number;
}

export interface Session {
  token: string;
  user: CloudUser;
}

export type RecordingStatus = "queued" | "scheduled" | "recording" | "done" | "failed";

export interface CloudRecording {
  id: string;
  title: string;
  channelName: string;
  status: RecordingStatus;
  startAt: number;
  maxSeconds: number;
  seconds: number;
  bytes: number;
  keepHours: number | null;
  keepUntil: number | null;
  error: string | null;
  createdAt: number;
  finishedAt: number | null;
}

export interface NewRecording {
  title: string;
  channel_name?: string;
  url: string;
  seconds: number;
  /** Epoch seconds. Leave out to start now. */
  start_at?: number;
  /** 0 keeps it forever; leave out for the account default. */
  keep_hours?: number;
}

export interface AdminUser {
  id: string;
  username: string;
  role: Role;
  status: "active" | "suspended";
  maxConcurrent: number;
  maxHours: number;
  storageBytes: number;
  keepHours: number | null;
  note: string;
  createdAt: number;
  lastLogin: number | null;
  storageUsed: number;
  recordings: number;
  sessions: number;
}

export interface Invite {
  code: string;
  role: Role;
  usesLeft: number;
  expiresAt: number | null;
  maxConcurrent: number;
  maxHours: number;
  storageBytes: number;
  keepHours: number | null;
  note: string;
  createdAt: number;
}

export interface Stats {
  version: string;
  mode: Mode;
  users: number;
  suspended: number;
  sessions: number;
  recordings: { total: number; recording: number; scheduled: number; done: number; failed: number };
  storageBytes: number;
  invites: number;
}

export interface AdminRecording {
  id: string;
  user: string;
  title: string;
  channelName: string;
  status: RecordingStatus;
  seconds: number;
  maxSeconds: number;
  bytes: number;
  startAt: number;
  keepUntil: number | null;
  error: string | null;
  createdAt: number;
}

export interface AuditEntry {
  at: number;
  actor: string;
  action: string;
  detail: string;
}

export type ServerSettings = Record<
  | "registration"
  | "default_max_concurrent"
  | "default_max_hours"
  | "default_storage_gb"
  | "default_keep_hours"
  | "allow_private"
  | "session_days",
  string
>;

export class CloudError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CloudError";
  }
}

export interface ClientOptions {
  /** Server address, for example `http://192.168.1.20:8484`. Empty means the same origin. */
  baseUrl?: string;
  token?: string | null;
  /** Lets the desktop app route requests through its native HTTP client. */
  fetch?: typeof fetch;
}

export const normalizeBase = (input: string) => {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
};

export class CloudClient {
  readonly baseUrl: string;
  token: string | null;
  private readonly doFetch: typeof fetch;

  constructor(options: ClientOptions = {}) {
    this.baseUrl = normalizeBase(options.baseUrl ?? "");
    this.token = options.token ?? null;
    this.doFetch = options.fetch ?? ((...args) => fetch(...args));
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    let response: Response;
    try {
      response = await this.doFetch(`${this.baseUrl}/api/v1${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      const why = e instanceof Error && e.message ? ` (${e.message})` : "";
      throw new CloudError(`Could not reach the server${why}. Check the address and your network.`, 0);
    }
    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* not JSON */
    }
    if (!response.ok) {
      const message =
        (data as { error?: string } | null)?.error ?? `Server answered ${response.status}`;
      throw new CloudError(message, response.status);
    }
    return data as T;
  }

  private get = <T>(path: string) => this.request<T>("GET", path);
  private post = <T>(path: string, body?: unknown) => this.request<T>("POST", path, body ?? {});

  // ---- session ----
  info = () => this.get<ServerInfo>("/info");
  setup = (username: string, password: string) =>
    this.post<Session>("/setup", { username, password });
  login = (username: string, password: string) =>
    this.post<Session>("/auth/login", { username, password });
  register = (username: string, password: string, invite?: string) =>
    this.post<Session>("/auth/register", { username, password, invite });
  logout = () => this.post<{ ok: boolean }>("/auth/logout");
  me = () => this.get<CloudUser>("/auth/me");
  changePassword = (current: string, next: string) =>
    this.post<{ ok: boolean }>("/auth/password", { current, new: next });

  // ---- recordings ----
  listRecordings = () =>
    this.get<{ recordings: CloudRecording[]; storageUsed: number; storageLimit: number }>(
      "/recordings",
    );
  createRecording = (body: NewRecording) => this.post<{ id: string }>("/recordings", body);
  stopRecording = (id: string) => this.post<{ ok: boolean }>(`/recordings/${id}/stop`);
  deleteRecording = (id: string) => this.request<{ ok: boolean }>("DELETE", `/recordings/${id}`);
  keepRecording = (id: string, hours: number) =>
    this.post<{ ok: boolean }>(`/recordings/${id}/keep`, { hours });

  /** Address of the HLS playlist; any HLS player can open it, even while recording. */
  playlistUrl = (id: string) =>
    `${this.baseUrl}/api/v1/recordings/${id}/index.m3u8${this.token ? `?token=${this.token}` : ""}`;
  downloadUrl = (id: string) =>
    `${this.baseUrl}/api/v1/recordings/${id}/download${this.token ? `?token=${this.token}` : ""}`;

  // ---- sync ----
  getSync = <T>(key: string) => this.get<{ value: T | null; updatedAt: number }>(`/sync/${key}`);
  putSync = (key: string, value: unknown) =>
    this.request<{ updatedAt: number }>("PUT", `/sync/${key}`, value);

  // ---- proxy ----
  proxyUrl = (target: string) =>
    `${this.baseUrl}/api/v1/proxy?url=${encodeURIComponent(target)}${this.token ? `&token=${this.token}` : ""}`;

  // ---- admin ----
  admin = {
    stats: () => this.get<Stats>("/admin/stats"),
    users: () => this.get<AdminUser[]>("/admin/users"),
    createUser: (body: {
      username: string;
      password: string;
      role: Role;
      max_concurrent?: number;
      max_hours?: number;
      storage_gb?: number;
      keep_hours?: number;
      note?: string;
    }) => this.post<{ id: string }>("/admin/users", body),
    updateUser: (
      id: string,
      patch: Partial<{
        role: Role;
        status: "active" | "suspended";
        max_concurrent: number;
        max_hours: number;
        storage_gb: number;
        keep_hours: number;
        note: string;
        password: string;
      }>,
    ) => this.request<{ ok: boolean }>("PATCH", `/admin/users/${id}`, patch),
    deleteUser: (id: string) => this.request<{ ok: boolean }>("DELETE", `/admin/users/${id}`),
    revokeSessions: (id: string) => this.post<{ ok: boolean }>(`/admin/users/${id}/revoke`),
    invites: () => this.get<Invite[]>("/admin/invites"),
    createInvite: (body: {
      role?: Role;
      uses?: number;
      expires_days?: number;
      max_concurrent?: number;
      max_hours?: number;
      storage_gb?: number;
      keep_hours?: number;
      note?: string;
    }) => this.post<{ code: string }>("/admin/invites", body),
    deleteInvite: (code: string) =>
      this.request<{ ok: boolean }>("DELETE", `/admin/invites/${code}`),
    settings: () => this.get<ServerSettings>("/admin/settings"),
    updateSettings: (patch: Partial<ServerSettings>) =>
      this.request<{ ok: boolean }>("PUT", "/admin/settings", patch),
    audit: (limit = 100) => this.get<AuditEntry[]>(`/admin/audit?limit=${limit}`),
    recordings: () => this.get<AdminRecording[]>("/admin/recordings"),
    deleteRecording: (id: string) =>
      this.request<{ ok: boolean }>("DELETE", `/admin/recordings/${id}`),
  };
}

// ---- small helpers both front ends use ----

export const formatBytes = (bytes: number) => {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
};

export const formatDuration = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
};

/** "in 3h", "in 2d", or "now" for a retention time. */
export const formatUntil = (epochSeconds: number, now = Date.now() / 1000) => {
  const delta = epochSeconds - now;
  if (delta <= 0) return "now";
  if (delta < 3600) return `${Math.ceil(delta / 60)}m`;
  if (delta < 86_400) return `${Math.round(delta / 3600)}h`;
  return `${Math.round(delta / 86_400)}d`;
};
