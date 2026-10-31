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
  /** The repeating schedule this recording came from, if any. */
  scheduleId: string | null;
  /** `recording` for something captured from a channel, `download` for a saved movie or episode. */
  kind: "recording" | "download";
  /** Folder name; empty for none. */
  tag: string;
  watched: boolean;
  /** Where playback stopped, in seconds. */
  positionS: number;
  backupUrl: string | null;
  /** True when a thumbnail exists (the server needs ffmpeg to make them). */
  thumb: boolean;
  fileName: string | null;
  seriesRuleId: string | null;
  /** Size a download is going to reach, when the provider said. */
  totalBytes: number | null;
}

export interface NewRecording {
  title: string;
  channel_name?: string;
  url: string;
  /** Length in seconds. 0 records until stopped, up to the account's longest recording. */
  seconds: number;
  /** Epoch seconds. Leave out to start now. */
  start_at?: number;
  /** 0 keeps it forever; leave out for the account default. */
  keep_hours?: number;
  /** A second address for the same channel, tried when the first keeps failing. */
  backup_url?: string;
  tag?: string;
}

export interface NewDownload {
  title: string;
  url: string;
  keep_hours?: number;
  tag?: string;
}

/** Bit 0 is Monday and bit 6 is Sunday; 0 records once, on the start date. */
export const WEEKDAYS = 0b0011111;
export const WEEKEND = 0b1100000;
export const EVERY_DAY = 0b1111111;

export interface Schedule {
  id: string;
  title: string;
  channelName: string;
  url: string;
  /** IANA time zone, for example `Europe/Paris`. */
  tz: string;
  /** `HH:MM` on the wall clock of `tz`. */
  startTime: string;
  /** Length of the programme in seconds, without padding. */
  seconds: number;
  days: number;
  /** `YYYY-MM-DD`. */
  startDate: string;
  endDate: string | null;
  padBefore: number;
  padAfter: number;
  keepHours: number | null;
  /** Only the newest N finished recordings are kept, or null for all. */
  keepLast: number | null;
  enabled: boolean;
  createdAt: number;
  /** Epoch seconds of the next occurrence that has not started, or null. */
  nextStart: number | null;
  backupUrl: string | null;
  quality: "best" | "lowest";
  webhookUrl: string | null;
  tag: string;
  epgId: string;
  followGuide: boolean;
}

export interface NewSchedule {
  title: string;
  channel_name?: string;
  url: string;
  tz: string;
  start_time: string;
  seconds: number;
  days?: number;
  start_date: string;
  end_date?: string | null;
  pad_before?: number;
  pad_after?: number;
  /** 0 keeps the recordings forever; leave out for the server's default timer. */
  keep_hours?: number;
  keep_last?: number | null;
  enabled?: boolean;
  backup_url?: string | null;
  quality?: "best" | "lowest";
  webhook_url?: string | null;
  tag?: string;
  epg_id?: string;
  /** Keep recording until the guide says the programme has ended. */
  follow_guide?: boolean;
}

export interface Source {
  id: string;
  name: string;
  kind: "m3u" | "xtream";
  url: string;
  username: string;
}

export interface NewSource {
  name: string;
  kind: "m3u" | "xtream";
  url: string;
  username?: string;
  password?: string;
}

export interface Channel {
  name: string;
  url: string;
  group: string;
  logo: string;
  /** The playlist's id for the channel, used to find it in the guide. */
  id: string;
  kind: "live" | "movie" | "series";
  /** Other addresses of the same channel (only when sources are merged). */
  alt: string[];
}

export interface Programme {
  startAt: number;
  stopAt: number;
  title: string;
  description: string;
}

export interface GuideHit extends Programme {
  channelId: string;
  channelName: string;
}

export interface SeriesRule {
  id: string;
  title: string;
  epgChannelId: string;
  channelName: string;
  url: string;
  backupUrl: string | null;
  padBefore: number;
  padAfter: number;
  keepHours: number | null;
  keepLast: number | null;
  tag: string;
  enabled: boolean;
}

export interface NewSeriesRule {
  title: string;
  epg_channel_id: string;
  channel_name?: string;
  url: string;
  backup_url?: string;
  pad_before?: number;
  pad_after?: number;
  keep_hours?: number;
  keep_last?: number;
  tag?: string;
}

export interface CalendarItem {
  id: string;
  title: string;
  channelName: string;
  startAt: number;
  endAt: number;
  status: RecordingStatus;
  /** More recordings run together than the account allows. */
  clash: boolean;
}

export interface Bookmark {
  id: string;
  atS: number;
  label: string;
}

export interface ServerStatus {
  version: string;
  mode: string;
  diskFree: number | null;
  diskTotal: number | null;
  recording: number;
  scheduled: number;
  failed: number;
  next: { title: string; startAt: number } | null;
  /** MP4 export, cutting and thumbnails need ffmpeg on the server. */
  ffmpeg: boolean;
  perDayBytes: number;
  /** Days of room left at the recent pace, or null when nothing was recorded lately. */
  daysLeft: number | null;
  expiring: { id: string; title: string; keepUntil: number }[];
  brokenChannels: { name: string; detail: string; checkedAt: number }[];
  /** The newer release, like `v0.15.0`, when there is one. */
  updateAvailable: string | null;
  defaultKeepHours: number | null;
}

export interface StorageUse {
  folders: { name: string; bytes: number; count: number }[];
  sources: { name: string; bytes: number; count: number }[];
  biggest: { id: string; title: string; bytes: number }[];
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

export interface AdminSchedule {
  id: string;
  user: string;
  title: string;
  channelName: string;
  tz: string;
  startTime: string;
  seconds: number;
  days: number;
  startDate: string;
  endDate: string | null;
  enabled: boolean;
  nextStart: number | null;
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
  | "delete_watched_days"
  | "allow_private"
  | "webhook_url"
  | "epg_url"
  | "quiet_start"
  | "quiet_end"
  | "update_check"
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
  /** Called when the server rejects a token that was sent, so the app can sign the user out. */
  onUnauthorized?: () => void;
  /** Milliseconds before a request is given up on. Defaults to 15 seconds. */
  timeoutMs?: number;
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
  private readonly onUnauthorized?: () => void;
  private readonly timeoutMs: number;

  constructor(options: ClientOptions = {}) {
    this.onUnauthorized = options.onUnauthorized;
    this.timeoutMs = options.timeoutMs ?? 15_000;
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
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      const why = timedOut
        ? " (no answer in time)"
        : e instanceof Error && e.message
          ? ` (${e.message})`
          : "";
      throw new CloudError(
        `Could not reach the server${why}. Check the address and your network.`,
        0,
      );
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
      if (response.status === 401 && this.token) this.onUnauthorized?.();
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
  listRecordings = (filter: { tag?: string; q?: string; kind?: string } = {}) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filter)) if (value) query.set(key, value);
    const suffix = query.size ? `?${query}` : "";
    return this.get<{
      recordings: CloudRecording[];
      tags: string[];
      storageUsed: number;
      storageLimit: number;
    }>(`/recordings${suffix}`);
  };
  /** Saves a movie or episode file from a source address on the server. */
  createDownload = (body: NewDownload) => this.post<{ id: string }>("/downloads", body);
  /** Changes the title, folder, keep time, or watch state. `keep_hours` counts from now; 0 = forever. */
  patchRecording = (
    id: string,
    patch: Partial<{
      title: string;
      tag: string;
      keep_hours: number;
      watched: boolean;
      position_s: number;
    }>,
  ) => this.request<{ ok: boolean }>("PATCH", `/recordings/${id}`, patch);
  bookmarks = (id: string) => this.get<{ bookmarks: Bookmark[] }>(`/recordings/${id}/bookmarks`);
  addBookmark = (id: string, atS: number, label = "") =>
    this.post<{ id: string }>(`/recordings/${id}/bookmarks`, { at_s: atS, label });
  deleteBookmark = (id: string, bookmark: string) =>
    this.request<{ ok: boolean }>("DELETE", `/recordings/${id}/bookmarks/${bookmark}`);
  /** A link that plays one recording without signing in, until it expires. */
  shareRecording = (id: string, hours = 24) =>
    this.post<{ token: string; path: string; download: string; expiresAt: number }>(
      `/recordings/${id}/share`,
      { hours },
    );
  /** Needs ffmpeg on the server (see `status().ffmpeg`). */
  exportRecording = (id: string) => this.post<{ path: string }>(`/recordings/${id}/export`);
  trimRecording = (id: string, fromS: number, toS: number) =>
    this.post<{ id: string }>(`/recordings/${id}/trim`, { from_s: fromS, to_s: toS });
  thumbUrl = (id: string) =>
    `${this.baseUrl}/api/v1/recordings/${id}/thumb.jpg${this.token ? `?token=${this.token}` : ""}`;
  exportUrl = (id: string) =>
    `${this.baseUrl}/api/v1/recordings/${id}/export.mp4${this.token ? `?token=${this.token}` : ""}`;
  createRecording = (body: NewRecording) => this.post<{ id: string }>("/recordings", body);
  stopRecording = (id: string) => this.post<{ ok: boolean }>(`/recordings/${id}/stop`);
  deleteRecording = (id: string) => this.request<{ ok: boolean }>("DELETE", `/recordings/${id}`);
  keepRecording = (id: string, hours: number) =>
    this.post<{ ok: boolean }>(`/recordings/${id}/keep`, { hours });

  // ---- schedules, sources and channels ----
  listSchedules = () => this.get<{ schedules: Schedule[] }>("/schedules");
  /** Saved even when `warnings` is not empty; show them so the user can adjust. */
  createSchedule = (body: NewSchedule) =>
    this.post<{ id: string; warnings: string[] }>("/schedules", body);
  updateSchedule = (id: string, body: NewSchedule) =>
    this.request<{ ok: boolean; warnings: string[] }>("PUT", `/schedules/${id}`, body);
  setScheduleEnabled = (id: string, enabled: boolean) =>
    this.request<{ ok: boolean }>("PATCH", `/schedules/${id}`, { enabled });
  deleteSchedule = (id: string) => this.request<{ ok: boolean }>("DELETE", `/schedules/${id}`);
  runSchedule = (id: string) => this.post<{ id: string }>(`/schedules/${id}/run`);
  duplicateSchedule = (id: string) => this.post<{ id: string }>(`/schedules/${id}/duplicate`);
  pauseAllSchedules = (paused: boolean) =>
    this.post<{ changed: number }>("/schedules/pause", { paused });
  renameRecording = (id: string, title: string) =>
    this.request<{ ok: boolean }>("PATCH", `/recordings/${id}`, { title });
  clearFailedRecordings = () => this.post<{ removed: number }>("/recordings/clear-failed");
  status = () => this.get<ServerStatus>("/status");
  storage = () => this.get<StorageUse>("/status/storage");
  /** Opens the stream; with `seconds` (3 to 30) it records a throwaway sample instead. */
  testChannel = (url: string, seconds?: number) =>
    this.post<{
      ok: boolean;
      status?: number;
      contentType?: string;
      bytes?: number;
      kbps?: number;
      error?: string;
    }>("/channels/test", { url, seconds });
  exportSchedules = () =>
    this.get<{ version: number; schedules: NewSchedule[] }>("/schedules/export");
  importSchedules = (schedules: NewSchedule[]) =>
    this.post<{ added: number; problems: string[] }>("/schedules/import", { schedules });

  // ---- guide, series rules, calendar ----
  guide = (query: { epgId?: string; name?: string; from?: number; to?: number }) => {
    const params = new URLSearchParams();
    if (query.epgId) params.set("epg_id", query.epgId);
    if (query.name) params.set("name", query.name);
    if (query.from) params.set("from", String(query.from));
    if (query.to) params.set("to", String(query.to));
    return this.get<{ channelId: string | null; programmes: Programme[] }>(`/guide?${params}`);
  };
  searchGuide = (q: string) =>
    this.get<{ programmes: GuideHit[] }>(`/guide/search?q=${encodeURIComponent(q)}`);
  guideStatus = () =>
    this.get<{
      configured: boolean;
      channels: number;
      programmes: number;
      updatedAt: number | null;
    }>("/guide/status");
  refreshGuide = () => this.post<{ programmes: number }>("/guide/refresh");
  seriesRules = () => this.get<{ rules: SeriesRule[] }>("/series-rules");
  createSeriesRule = (body: NewSeriesRule) => this.post<{ id: string }>("/series-rules", body);
  setSeriesRuleEnabled = (id: string, enabled: boolean) =>
    this.request<{ ok: boolean }>("PATCH", `/series-rules/${id}`, { enabled });
  deleteSeriesRule = (id: string) => this.request<{ ok: boolean }>("DELETE", `/series-rules/${id}`);
  calendar = (from?: number, to?: number) => {
    const params = new URLSearchParams();
    if (from) params.set("from", String(from));
    if (to) params.set("to", String(to));
    return this.get<{ items: CalendarItem[] }>(`/calendar?${params}`);
  };

  listSources = () => this.get<{ sources: Source[] }>("/sources");
  createSource = (body: NewSource) => this.post<{ id: string }>("/sources", body);
  deleteSource = (id: string) => this.request<{ ok: boolean }>("DELETE", `/sources/${id}`);
  channels = (
    source: string,
    options: { q?: string; group?: string; kind?: string; offset?: number; limit?: number } = {},
  ) => {
    const query = new URLSearchParams({ source });
    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined && value !== "") query.set(key, String(value));
    }
    return this.get<{ channels: Channel[]; total: number; groups: string[] }>(`/channels?${query}`);
  };

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
    /** Crash reports the server wrote itself; they never leave the machine. */
    crashes: () => this.get<{ crashes: { at: number; report: string }[] }>("/admin/crashes"),
    recordings: () => this.get<AdminRecording[]>("/admin/recordings"),
    deleteRecording: (id: string) =>
      this.request<{ ok: boolean }>("DELETE", `/admin/recordings/${id}`),
    schedules: () => this.get<AdminSchedule[]>("/admin/schedules"),
    deleteSchedule: (id: string) =>
      this.request<{ ok: boolean }>("DELETE", `/admin/schedules/${id}`),
  };
}

// ---- small helpers both front ends use ----

export const formatBytes = (bytes: number) => {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
};

/** "Once", "Every day", "Weekdays" or the day names of a schedule's day mask. */
export const describeDays = (mask: number) => {
  if (mask === 0) return "Once";
  if (mask === EVERY_DAY) return "Every day";
  if (mask === WEEKDAYS) return "Weekdays";
  if (mask === WEEKEND) return "Weekends";
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return names.filter((_, i) => mask & (1 << i)).join(", ");
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
