use std::{
    path::Path,
    sync::{Arc, Mutex, MutexGuard},
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{params, Connection, OptionalExtension};

/// One SQLite connection behind a mutex. Queries here are short, so this stays simple and fast.
#[derive(Clone)]
pub struct Db(Arc<Mutex<Connection>>);

pub const LITE_USER: &str = "local";
pub const GB: i64 = 1024 * 1024 * 1024;

pub fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  max_concurrent INTEGER NOT NULL DEFAULT 1,
  max_hours INTEGER NOT NULL DEFAULT 4,
  storage_bytes INTEGER NOT NULL DEFAULT 5368709120,
  keep_hours INTEGER,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  last_login INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  agent TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'user',
  uses_left INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER,
  max_concurrent INTEGER NOT NULL DEFAULT 1,
  max_hours INTEGER NOT NULL DEFAULT 4,
  storage_bytes INTEGER NOT NULL DEFAULT 5368709120,
  keep_hours INTEGER,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS recordings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  channel_name TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL,
  status TEXT NOT NULL,
  start_at INTEGER NOT NULL,
  max_seconds INTEGER NOT NULL,
  seconds INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0,
  keep_hours INTEGER,
  keep_until INTEGER,
  error TEXT,
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_recordings_user ON recordings(user_id);
CREATE INDEX IF NOT EXISTS idx_recordings_status ON recordings(status, start_at);
CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  channel_name TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL,
  tz TEXT NOT NULL,
  start_time TEXT NOT NULL,
  duration_s INTEGER NOT NULL,
  days_mask INTEGER NOT NULL DEFAULT 0,
  start_date TEXT NOT NULL,
  end_date TEXT,
  pad_before_s INTEGER NOT NULL DEFAULT 0,
  pad_after_s INTEGER NOT NULL DEFAULT 0,
  keep_hours INTEGER,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_schedules_user ON schedules(user_id);
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  url TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  password TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sync (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY,
  recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  at_s INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_bookmarks_recording ON bookmarks(recording_id);
CREATE TABLE IF NOT EXISTS shares (
  token TEXT PRIMARY KEY,
  recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS epg_channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  norm TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_epg_channels_norm ON epg_channels(norm);
CREATE TABLE IF NOT EXISTS epg_programmes (
  channel_id TEXT NOT NULL,
  start_at INTEGER NOT NULL,
  stop_at INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_epg_programmes ON epg_programmes(channel_id, start_at);
CREATE TABLE IF NOT EXISTS series_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  epg_channel_id TEXT NOT NULL,
  channel_name TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL,
  backup_url TEXT,
  pad_before_s INTEGER NOT NULL DEFAULT 0,
  pad_after_s INTEGER NOT NULL DEFAULT 0,
  keep_hours INTEGER,
  keep_last INTEGER,
  tag TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS channel_health (
  url TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  ok INTEGER NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  checked_at INTEGER NOT NULL
);
";

/// Adds a column to a table made by an earlier version, once.
fn add_column(
    conn: &Connection,
    table: &str,
    column: &str,
    declaration: &str,
) -> rusqlite::Result<()> {
    let present = conn
        .prepare(&format!("PRAGMA table_info({table})"))?
        .query_map([], |r| r.get::<_, String>(1))?
        .flatten()
        .any(|name| name == column);
    if !present {
        conn.execute(
            &format!("ALTER TABLE {table} ADD COLUMN {column} {declaration}"),
            [],
        )?;
    }
    Ok(())
}

/// Changes to tables that already exist in a database made by an earlier version.
fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    let has_schedule_id = conn
        .prepare("PRAGMA table_info(recordings)")?
        .query_map([], |r| r.get::<_, String>(1))?
        .flatten()
        .any(|name| name == "schedule_id");
    if !has_schedule_id {
        conn.execute("ALTER TABLE recordings ADD COLUMN schedule_id TEXT", [])?;
    }
    let has_keep_last = conn
        .prepare("PRAGMA table_info(schedules)")?
        .query_map([], |r| r.get::<_, String>(1))?
        .flatten()
        .any(|name| name == "keep_last");
    if !has_keep_last {
        conn.execute("ALTER TABLE schedules ADD COLUMN keep_last INTEGER", [])?;
    }
    // Library: downloads, folders, watch state, a backup address and a thumbnail flag.
    add_column(
        conn,
        "recordings",
        "kind",
        "TEXT NOT NULL DEFAULT 'recording'",
    )?;
    add_column(conn, "recordings", "tag", "TEXT NOT NULL DEFAULT ''")?;
    add_column(conn, "recordings", "watched", "INTEGER NOT NULL DEFAULT 0")?;
    add_column(
        conn,
        "recordings",
        "position_s",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    add_column(conn, "recordings", "backup_url", "TEXT")?;
    add_column(conn, "recordings", "thumb", "INTEGER NOT NULL DEFAULT 0")?;
    add_column(conn, "recordings", "file_name", "TEXT")?;
    add_column(conn, "recordings", "series_rule_id", "TEXT")?;
    add_column(conn, "recordings", "total_bytes", "INTEGER")?;
    add_column(conn, "recordings", "retries", "INTEGER NOT NULL DEFAULT 0")?;
    // Schedules made before the default timer existed keep their recordings, as they always did.
    let first_run_of_timer = !conn
        .prepare("PRAGMA table_info(schedules)")?
        .query_map([], |r| r.get::<_, String>(1))?
        .flatten()
        .any(|name| name == "tag");
    add_column(conn, "schedules", "backup_url", "TEXT")?;
    add_column(conn, "schedules", "quality", "TEXT NOT NULL DEFAULT 'best'")?;
    add_column(conn, "schedules", "webhook_url", "TEXT")?;
    add_column(conn, "recordings", "pinned", "INTEGER NOT NULL DEFAULT 0")?;
    add_column(conn, "schedules", "tag", "TEXT NOT NULL DEFAULT ''")?;
    add_column(conn, "schedules", "epg_id", "TEXT NOT NULL DEFAULT ''")?;
    add_column(
        conn,
        "schedules",
        "follow_guide",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    if first_run_of_timer {
        conn.execute(
            "UPDATE schedules SET keep_hours = 0 WHERE keep_hours IS NULL",
            [],
        )?;
    }
    // One row per occurrence of a schedule, so the materialiser can run as often as it likes.
    conn.execute_batch(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_recordings_occurrence
           ON recordings(schedule_id, start_at) WHERE schedule_id IS NOT NULL;
         CREATE UNIQUE INDEX IF NOT EXISTS idx_recordings_series
           ON recordings(series_rule_id, start_at) WHERE series_rule_id IS NOT NULL;",
    )
}

impl Db {
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.execute_batch(SCHEMA)?;
        migrate(&conn)?;
        Ok(Self(Arc::new(Mutex::new(conn))))
    }

    pub fn conn(&self) -> MutexGuard<'_, Connection> {
        // A panic while holding the lock cannot leave the database half-written, so keep going.
        self.0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn setting(&self, key: &str, default: &str) -> String {
        self.conn()
            .query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| {
                r.get(0)
            })
            .optional()
            .ok()
            .flatten()
            .unwrap_or_else(|| default.to_string())
    }

    pub fn set_setting(&self, key: &str, value: &str) -> rusqlite::Result<()> {
        self.conn().execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn audit(&self, actor: &str, action: &str, detail: &str) {
        let _ = self.conn().execute(
            "INSERT INTO audit (at, actor, action, detail) VALUES (?1, ?2, ?3, ?4)",
            params![now(), actor, action, detail],
        );
        // Keep the log from growing forever.
        let _ = self.conn().execute(
            "DELETE FROM audit WHERE id <= (SELECT MAX(id) FROM audit) - 2000",
            [],
        );
    }

    /// Lite mode has exactly one implicit user who owns everything.
    pub fn ensure_lite_user(&self) -> rusqlite::Result<()> {
        self.conn().execute(
            "INSERT OR IGNORE INTO users
               (id, username, pass_hash, role, max_concurrent, max_hours, storage_bytes, created_at)
             VALUES (?1, 'local', '', 'admin', 0, 0, 0, ?2)",
            params![LITE_USER, now()],
        )?;
        Ok(())
    }

    pub fn user_count(&self) -> i64 {
        self.conn()
            .query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))
            .unwrap_or(0)
    }
}
