//! The TV guide: reads XMLTV, keeps the next two weeks, and turns series rules into recordings.

use std::{
    io::Read,
    sync::atomic::{AtomicBool, Ordering},
};

use chrono::{DateTime, NaiveDateTime};
use quick_xml::{events::Event, Reader};
use reqwest::Url;
use rusqlite::{params, Connection, OptionalExtension};

use crate::{db::now, state::AppState};

/// The most XMLTV data (after unzipping) that is read.
const MAX_BYTES: u64 = 256 * 1024 * 1024;
const MAX_DOWNLOAD: usize = 128 * 1024 * 1024;

/// How far ahead programmes are kept, and how far back.
const AHEAD_SECONDS: i64 = 14 * 86_400;
const BEHIND_SECONDS: i64 = 6 * 3600;

#[derive(Debug, Default, PartialEq)]
pub struct Programme {
    pub channel: String,
    pub start: i64,
    pub stop: i64,
    pub title: String,
    pub description: String,
}

#[derive(Debug, Default)]
pub struct Guide {
    /// `(id, display name)`.
    pub channels: Vec<(String, String)>,
    pub programmes: Vec<Programme>,
}

/// A channel name reduced to letters and digits, so "BBC One HD" and "bbc-one hd" meet.
pub fn norm(name: &str) -> String {
    name.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

/// XMLTV times look like `20250131203000 +0100`; a missing zone means UTC.
fn parse_time(value: &str) -> Option<i64> {
    let value = value.trim();
    if let Ok(t) = DateTime::parse_from_str(value, "%Y%m%d%H%M%S %z") {
        return Some(t.timestamp());
    }
    let digits = value.get(..14)?;
    NaiveDateTime::parse_from_str(digits, "%Y%m%d%H%M%S")
        .ok()
        .map(|t| t.and_utc().timestamp())
}

#[derive(Clone, Copy, PartialEq)]
enum Tag {
    None,
    Name,
    Title,
    Desc,
}

/// Reads XMLTV (plain or gzipped). Broken or partial files give whatever was read before the break.
pub fn parse_xmltv(bytes: &[u8]) -> Guide {
    let mut unzipped = Vec::new();
    let data: &[u8] = if bytes.starts_with(&[0x1f, 0x8b]) {
        let _ = flate2::read::GzDecoder::new(bytes)
            .take(MAX_BYTES)
            .read_to_end(&mut unzipped);
        &unzipped
    } else {
        bytes
    };

    let mut reader = Reader::from_reader(data);
    reader.config_mut().trim_text(true);
    let mut guide = Guide::default();
    let mut buf = Vec::new();
    let mut tag = Tag::None;
    let mut channel_id: Option<String> = None;
    let mut channel_name = String::new();
    let mut programme: Option<Programme> = None;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => match e.name().as_ref() {
                b"channel" => {
                    channel_id = e
                        .attributes()
                        .flatten()
                        .find(|a| a.key.as_ref() == b"id")
                        .and_then(|a| a.unescape_value().ok().map(|v| v.into_owned()));
                    channel_name.clear();
                }
                b"programme" => {
                    let mut p = Programme::default();
                    let mut ok = true;
                    for a in e.attributes().flatten() {
                        let Ok(value) = a.unescape_value() else {
                            continue;
                        };
                        match a.key.as_ref() {
                            b"start" => match parse_time(&value) {
                                Some(t) => p.start = t,
                                None => ok = false,
                            },
                            b"stop" => match parse_time(&value) {
                                Some(t) => p.stop = t,
                                None => ok = false,
                            },
                            b"channel" => p.channel = value.into_owned(),
                            _ => {}
                        }
                    }
                    programme = (ok && p.stop > p.start && !p.channel.is_empty()).then_some(p);
                }
                b"display-name" if channel_id.is_some() && channel_name.is_empty() => {
                    tag = Tag::Name;
                }
                b"title" if programme.is_some() => tag = Tag::Title,
                b"desc" if programme.is_some() => tag = Tag::Desc,
                _ => {}
            },
            Ok(event @ (Event::Text(_) | Event::CData(_))) => {
                let text = match &event {
                    Event::Text(t) => t.unescape().ok(),
                    Event::CData(c) => Some(String::from_utf8_lossy(c).into_owned().into()),
                    _ => None,
                };
                if let Some(text) = text {
                    match tag {
                        Tag::Name => channel_name = text.into_owned(),
                        Tag::Title => {
                            if let Some(p) = programme.as_mut() {
                                if p.title.is_empty() {
                                    p.title = text.into_owned();
                                }
                            }
                        }
                        Tag::Desc => {
                            if let Some(p) = programme.as_mut() {
                                if p.description.is_empty() {
                                    p.description = text.chars().take(600).collect();
                                }
                            }
                        }
                        Tag::None => {}
                    }
                }
            }
            Ok(Event::End(e)) => {
                tag = Tag::None;
                match e.name().as_ref() {
                    b"channel" => {
                        if let Some(id) = channel_id.take() {
                            guide.channels.push((id, std::mem::take(&mut channel_name)));
                        }
                    }
                    b"programme" => {
                        if let Some(p) = programme.take() {
                            if !p.title.is_empty() {
                                guide.programmes.push(p);
                            }
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
    guide
}

static REFRESHING: AtomicBool = AtomicBool::new(false);

/// Downloads the guide from the `epg_url` setting and replaces what is stored. Returns how many
/// programmes were kept.
pub async fn refresh(state: &AppState) -> Result<usize, String> {
    let address = state.db.setting("epg_url", "");
    if address.trim().is_empty() {
        return Err("Set the guide address (XMLTV) first.".into());
    }
    if REFRESHING.swap(true, Ordering::SeqCst) {
        return Err("The guide is already being updated.".into());
    }
    // Cleared even when the caller goes away half-way (a dropped request).
    struct Busy;
    impl Drop for Busy {
        fn drop(&mut self) {
            REFRESHING.store(false, Ordering::SeqCst);
        }
    }
    let _busy = Busy;
    refresh_inner(state, address.trim()).await
}

async fn refresh_inner(state: &AppState, address: &str) -> Result<usize, String> {
    let url = Url::parse(address).map_err(|_| "That guide address is not valid.".to_string())?;
    let bytes = crate::api::sources::fetch_bytes(state, url, MAX_DOWNLOAD)
        .await
        .map_err(|e| e.to_string())?;
    let guide = tokio::task::spawn_blocking(move || parse_xmltv(&bytes))
        .await
        .map_err(|e| e.to_string())?;
    if guide.programmes.is_empty() {
        return Err("That file has no programmes.".into());
    }
    let state = state.clone();
    tokio::task::spawn_blocking(move || store(&state, &guide))
        .await
        .map_err(|e| e.to_string())
}

/// Replaces the stored guide with the part of `guide` that is still useful.
pub fn store(state: &AppState, guide: &Guide) -> usize {
    let from = now() - BEHIND_SECONDS;
    let to = now() + AHEAD_SECONDS;
    let mut conn = state.db.conn();
    let Ok(tx) = conn.transaction() else {
        return 0;
    };
    let _ = tx.execute("DELETE FROM epg_programmes", []);
    let _ = tx.execute("DELETE FROM epg_channels", []);
    for (id, name) in &guide.channels {
        let _ = tx.execute(
            "INSERT OR REPLACE INTO epg_channels (id, name, norm) VALUES (?1, ?2, ?3)",
            params![id, name, norm(name)],
        );
    }
    let mut kept = 0;
    let mut seen = std::collections::HashSet::new();
    for p in guide
        .programmes
        .iter()
        .filter(|p| p.stop > from && p.start < to)
    {
        // Two entries starting together on one channel are one programme.
        if !seen.insert((p.channel.as_str(), p.start)) {
            continue;
        }
        if tx
            .execute(
                "INSERT INTO epg_programmes (channel_id, start_at, stop_at, title, description) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![p.channel, p.start, p.stop, p.title, p.description],
            )
            .is_ok()
        {
            kept += 1;
        }
    }
    let _ = tx.execute(
        "INSERT INTO settings (key, value) VALUES ('epg_updated', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [now().to_string()],
    );
    let _ = tx.commit();
    kept
}

/// The guide's id for a channel: the playlist's own id when the guide knows it, else a match by name.
pub fn resolve_channel(conn: &Connection, epg_id: &str, name: &str) -> Option<String> {
    if !epg_id.is_empty() {
        let known = conn
            .query_row(
                "SELECT 1 FROM epg_channels WHERE id = ?1
                 UNION SELECT 1 FROM epg_programmes WHERE channel_id = ?1 LIMIT 1",
                [epg_id],
                |_| Ok(()),
            )
            .optional()
            .ok()
            .flatten()
            .is_some();
        if known {
            return Some(epg_id.to_string());
        }
    }
    let wanted = norm(name);
    if wanted.is_empty() {
        return None;
    }
    conn.query_row(
        "SELECT id FROM epg_channels WHERE norm = ?1 LIMIT 1",
        [wanted],
        |r| r.get(0),
    )
    .optional()
    .ok()
    .flatten()
}

/// Creates a recording for every upcoming programme that an enabled series rule matches.
pub fn match_series(state: &AppState) {
    type Rule = (
        String,
        String,
        String,
        String,
        String,
        String,
        Option<String>,
        i64,
        i64,
        Option<i64>,
        String,
    );
    let rules: Vec<Rule> = {
        let conn = state.db.conn();
        let Ok(mut stmt) = conn.prepare(
            "SELECT sr.id, sr.user_id, sr.title, sr.epg_channel_id, sr.channel_name, sr.source_url,
                    sr.backup_url, sr.pad_before_s, sr.pad_after_s, sr.keep_hours, sr.tag
             FROM series_rules sr JOIN users u ON u.id = sr.user_id
             WHERE sr.enabled = 1 AND u.status = 'active' AND u.role != 'guest'",
        ) else {
            return;
        };
        stmt.query_map([], |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
                r.get(6)?,
                r.get(7)?,
                r.get(8)?,
                r.get(9)?,
                r.get(10)?,
            ))
        })
        .map(|rows| rows.flatten().collect())
        .unwrap_or_default()
    };
    for (id, user, title, channel, channel_name, url, backup, before, after, keep, tag) in rules {
        let programmes: Vec<(i64, i64, String)> = {
            let conn = state.db.conn();
            let Ok(mut stmt) = conn.prepare(
                "SELECT start_at, stop_at, title FROM epg_programmes
                 WHERE channel_id = ?1 AND start_at > ?2 AND start_at < ?3
                   AND instr(lower(title), lower(?4)) > 0 ORDER BY start_at",
            ) else {
                continue;
            };
            stmt.query_map(
                params![channel, now() + before, now() + AHEAD_SECONDS, title],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .map(|rows| rows.flatten().collect())
            .unwrap_or_default()
        };
        // A programme that moved leaves its old slot behind; drop slots the guide no longer has.
        if !programmes.is_empty() {
            let valid: std::collections::HashSet<i64> =
                programmes.iter().map(|(s, _, _)| s - before).collect();
            let stale: Vec<String> = {
                let conn = state.db.conn();
                let Ok(mut stmt) = conn.prepare(
                    "SELECT id, start_at FROM recordings
                     WHERE series_rule_id = ?1 AND status = 'scheduled' AND start_at > ?2",
                ) else {
                    continue;
                };
                stmt.query_map(params![id, now() + before], |r| {
                    Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
                })
                .map(|rows| {
                    rows.flatten()
                        .filter(|(_, at)| !valid.contains(at))
                        .map(|(row, _)| row)
                        .collect()
                })
                .unwrap_or_default()
            };
            for row in stale {
                let _ = state
                    .db
                    .conn()
                    .execute("DELETE FROM recordings WHERE id = ?1", [row]);
            }
        }
        for (start, stop, programme_title) in programmes {
            // A guide entry that runs for more than a day is a mistake, not a programme.
            if stop <= start || stop - start > 86_400 {
                continue;
            }
            // The unique (series_rule_id, start_at) index makes this safe to repeat every half minute.
            let _ = state.db.conn().execute(
                "INSERT OR IGNORE INTO recordings
                   (id, user_id, title, channel_name, source_url, status, start_at, max_seconds, keep_hours,
                    created_at, backup_url, tag, series_rule_id)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'scheduled', ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    uuid::Uuid::new_v4().to_string(),
                    user,
                    programme_title.chars().take(120).collect::<String>(),
                    channel_name,
                    url,
                    start - before,
                    stop - start + before + after,
                    keep,
                    now(),
                    backup,
                    tag,
                    id,
                ],
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"<?xml version="1.0"?>
<tv>
  <channel id="bbc1.uk"><display-name>BBC One</display-name></channel>
  <channel id="f2.fr"><display-name>France 2</display-name></channel>
  <programme start="20250131203000 +0100" stop="20250131213000 +0100" channel="bbc1.uk">
    <title lang="en">The News &amp; Weather</title>
    <desc>Headlines.</desc>
  </programme>
  <programme start="20250131210000" stop="20250131200000" channel="f2.fr"><title>Backwards</title></programme>
  <programme start="bad" stop="20250131213000" channel="f2.fr"><title>Bad time</title></programme>
</tv>"#;

    #[test]
    fn channels_and_programmes_are_read() {
        let guide = parse_xmltv(SAMPLE.as_bytes());
        assert_eq!(guide.channels.len(), 2);
        assert_eq!(guide.channels[0], ("bbc1.uk".into(), "BBC One".into()));
        assert_eq!(guide.programmes.len(), 1, "broken programmes are skipped");
        let p = &guide.programmes[0];
        assert_eq!(p.title, "The News & Weather");
        assert_eq!(p.description, "Headlines.");
        assert_eq!(p.stop - p.start, 3600);
        // 20:30 at +01:00 is 19:30 UTC.
        assert_eq!(p.start, parse_time("20250131193000").unwrap());
    }

    #[test]
    fn names_meet_after_cleaning() {
        assert_eq!(norm("BBC One HD"), norm("bbc-one  hd"));
        assert_ne!(norm("France 2"), norm("France 3"));
    }

    #[test]
    fn gzipped_guides_are_unpacked() {
        use std::io::Write;
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(SAMPLE.as_bytes()).unwrap();
        let zipped = encoder.finish().unwrap();
        assert_eq!(parse_xmltv(&zipped).programmes.len(), 1);
    }

    #[test]
    fn garbage_gives_an_empty_guide() {
        assert!(parse_xmltv(b"not xml at all").programmes.is_empty());
    }
}
