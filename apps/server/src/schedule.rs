//! Repeating recording rules. A rule says "channel X at 11:00 for 30 minutes on these days in this
//! time zone". The materialiser turns the next stretch of occurrences into ordinary `scheduled`
//! recordings, which the existing start loop in `jobs` then picks up.

use chrono::{Datelike, Duration, LocalResult, NaiveDate, NaiveTime, TimeZone};
use chrono_tz::Tz;
use rusqlite::params;

use crate::{db::now, state::AppState};

/// How far ahead occurrences are created.
const HORIZON_DAYS: i64 = 14;

/// Bit 0 is Monday and bit 6 is Sunday. A mask of 0 means "once", on the start date.
pub const ALL_DAYS: u8 = 0b111_1111;

#[derive(Debug, Clone)]
pub struct Rule {
    pub tz: Tz,
    pub start_time: NaiveTime,
    pub days_mask: u8,
    pub start_date: NaiveDate,
    pub end_date: Option<NaiveDate>,
}

impl Rule {
    pub fn parse(
        tz: &str,
        start_time: &str,
        days_mask: i64,
        start_date: &str,
        end_date: Option<&str>,
    ) -> Result<Self, String> {
        let tz: Tz = tz.parse().map_err(|_| "Unknown time zone.".to_string())?;
        let start_time = NaiveTime::parse_from_str(start_time, "%H:%M")
            .map_err(|_| "Use a start time like 11:00.".to_string())?;
        if !(0..=i64::from(ALL_DAYS)).contains(&days_mask) {
            return Err("Days must be between 0 and 127.".into());
        }
        let start_date = NaiveDate::parse_from_str(start_date, "%Y-%m-%d")
            .map_err(|_| "Use a date like 2026-11-05.".to_string())?;
        let end_date = end_date
            .filter(|d| !d.is_empty())
            .map(|d| NaiveDate::parse_from_str(d, "%Y-%m-%d"))
            .transpose()
            .map_err(|_| "Use an end date like 2026-12-31.".to_string())?;
        if end_date.is_some_and(|end| end < start_date) {
            return Err("The end date is before the start date.".into());
        }
        Ok(Self {
            tz,
            start_time,
            days_mask: days_mask as u8,
            start_date,
            end_date,
        })
    }
}

/// The instant a wall-clock time happens in a zone. A time that does not exist (the clock jumped
/// over it) moves an hour later; one that happens twice uses the first.
fn instant(tz: Tz, date: NaiveDate, time: NaiveTime) -> Option<i64> {
    let naive = date.and_time(time);
    match tz.from_local_datetime(&naive) {
        LocalResult::Single(t) => Some(t.timestamp()),
        LocalResult::Ambiguous(first, _) => Some(first.timestamp()),
        LocalResult::None => tz
            .from_local_datetime(&(naive + Duration::hours(1)))
            .earliest()
            .map(|t| t.timestamp()),
    }
}

/// Start times (epoch seconds, without padding) of the rule inside `from <= start < until`.
pub fn occurrences(rule: &Rule, from: i64, until: i64) -> Vec<i64> {
    let (Some(first), Some(last)) = (
        rule.tz.timestamp_opt(from, 0).single(),
        rule.tz.timestamp_opt(until, 0).single(),
    ) else {
        return Vec::new();
    };
    // A day either side covers every offset the zone can have.
    let mut day = first.date_naive() - Duration::days(1);
    let stop = last.date_naive() + Duration::days(1);
    let mut found = Vec::new();
    while day <= stop && found.len() < 400 {
        let wanted = if rule.days_mask == 0 {
            day == rule.start_date
        } else {
            day >= rule.start_date
                && rule.end_date.is_none_or(|end| day <= end)
                && rule.days_mask & (1 << day.weekday().num_days_from_monday()) != 0
        };
        if wanted {
            if let Some(start) = instant(rule.tz, day, rule.start_time) {
                if start >= from && start < until {
                    found.push(start);
                }
            }
        }
        day += Duration::days(1);
    }
    found
}

/// The most recordings that would run at once inside `window` if one more were added there.
pub fn peak_overlap(existing: &[(i64, i64)], window: (i64, i64)) -> usize {
    let mut points = vec![window.0];
    points.extend(
        existing
            .iter()
            .map(|e| e.0)
            .filter(|s| *s > window.0 && *s < window.1),
    );
    points
        .into_iter()
        .map(|p| existing.iter().filter(|e| e.0 <= p && p < e.1).count())
        .max()
        .unwrap_or(0)
}

/// Other recordings of this user that run during `window`, as `(start, end)` pairs.
pub fn busy(
    state: &AppState,
    user_id: &str,
    window: (i64, i64),
    except_schedule: Option<&str>,
) -> Vec<(i64, i64)> {
    let conn = state.db.conn();
    let Ok(mut stmt) = conn.prepare(
        "SELECT start_at, start_at + max_seconds FROM recordings
         WHERE user_id = ?1 AND status IN ('scheduled', 'queued', 'recording')
           AND start_at < ?3 AND start_at + max_seconds > ?2
           AND (schedule_id IS NULL OR schedule_id IS NOT ?4)",
    ) else {
        return Vec::new();
    };
    stmt.query_map(params![user_id, window.0, window.1, except_schedule], |r| {
        Ok((r.get(0)?, r.get(1)?))
    })
    .map(|rows| rows.flatten().collect())
    .unwrap_or_default()
}

struct Row {
    id: String,
    user_id: String,
    title: String,
    channel_name: String,
    source_url: String,
    tz: String,
    start_time: String,
    duration_s: i64,
    days_mask: i64,
    start_date: String,
    end_date: Option<String>,
    pad_before_s: i64,
    pad_after_s: i64,
    keep_hours: Option<i64>,
}

/// Creates the recordings for every enabled rule's coming occurrences. Safe to run repeatedly:
/// an occurrence that already exists is left alone.
pub fn materialise(state: &AppState) {
    let rows: Vec<Row> = {
        let conn = state.db.conn();
        let Ok(mut stmt) = conn.prepare(
            "SELECT id, user_id, title, channel_name, source_url, tz, start_time, duration_s, days_mask,
                    start_date, end_date, pad_before_s, pad_after_s, keep_hours
             FROM schedules WHERE enabled = 1
               AND user_id IN (SELECT id FROM users WHERE status = 'active' AND role != 'guest')",
        ) else {
            return;
        };
        stmt.query_map([], |r| {
            Ok(Row {
                id: r.get(0)?,
                user_id: r.get(1)?,
                title: r.get(2)?,
                channel_name: r.get(3)?,
                source_url: r.get(4)?,
                tz: r.get(5)?,
                start_time: r.get(6)?,
                duration_s: r.get(7)?,
                days_mask: r.get(8)?,
                start_date: r.get(9)?,
                end_date: r.get(10)?,
                pad_before_s: r.get(11)?,
                pad_after_s: r.get(12)?,
                keep_hours: r.get(13)?,
            })
        })
        .map(|rows| rows.flatten().collect())
        .unwrap_or_default()
    };

    let from = now();
    let until = from + HORIZON_DAYS * 86_400;
    for row in rows {
        let Ok(rule) = Rule::parse(
            &row.tz,
            &row.start_time,
            row.days_mask,
            &row.start_date,
            row.end_date.as_deref(),
        ) else {
            continue;
        };
        for start in occurrences(&rule, from, until) {
            let _ = state.db.conn().execute(
                "INSERT OR IGNORE INTO recordings
                   (id, user_id, title, channel_name, source_url, status, start_at, max_seconds,
                    keep_hours, created_at, schedule_id)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'scheduled', ?6, ?7, ?8, ?9, ?10)",
                params![
                    uuid::Uuid::new_v4().to_string(),
                    row.user_id,
                    row.title,
                    row.channel_name,
                    row.source_url,
                    start - row.pad_before_s,
                    row.duration_s + row.pad_before_s + row.pad_after_s,
                    row.keep_hours,
                    now(),
                    row.id,
                ],
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rule(tz: &str, time: &str, mask: i64, date: &str, end: Option<&str>) -> Rule {
        Rule::parse(tz, time, mask, date, end).unwrap()
    }

    fn at(tz: &str, date: &str, time: &str) -> i64 {
        let tz: Tz = tz.parse().unwrap();
        let naive = NaiveDate::parse_from_str(date, "%Y-%m-%d")
            .unwrap()
            .and_time(NaiveTime::parse_from_str(time, "%H:%M").unwrap());
        tz.from_local_datetime(&naive).unwrap().timestamp()
    }

    #[test]
    fn a_one_off_rule_happens_once() {
        let r = rule("Europe/Paris", "11:00", 0, "2026-11-05", None);
        let from = at("Europe/Paris", "2026-11-01", "00:00");
        let found = occurrences(&r, from, from + 30 * 86_400);
        assert_eq!(found, vec![at("Europe/Paris", "2026-11-05", "11:00")]);
    }

    #[test]
    fn weekdays_skip_the_weekend() {
        // 2026-11-02 is a Monday.
        let r = rule("UTC", "09:30", 0b001_1111, "2026-11-02", None);
        let from = at("UTC", "2026-11-02", "00:00");
        let found = occurrences(&r, from, from + 7 * 86_400);
        assert_eq!(found.len(), 5);
        assert_eq!(found[0], at("UTC", "2026-11-02", "09:30"));
        assert_eq!(found[4], at("UTC", "2026-11-06", "09:30"));
    }

    #[test]
    fn a_rule_does_not_start_before_its_start_date_or_after_its_end_date() {
        let r = rule(
            "UTC",
            "10:00",
            ALL_DAYS as i64,
            "2026-11-03",
            Some("2026-11-05"),
        );
        let from = at("UTC", "2026-11-01", "00:00");
        let found = occurrences(&r, from, from + 10 * 86_400);
        assert_eq!(found.len(), 3);
    }

    #[test]
    fn the_wall_clock_time_survives_a_daylight_saving_change() {
        // Europe/Paris moves its clocks back on 2026-10-25: 11:00 stays 11:00 locally.
        let r = rule("Europe/Paris", "11:00", ALL_DAYS as i64, "2026-10-24", None);
        let from = at("Europe/Paris", "2026-10-24", "00:00");
        let found = occurrences(&r, from, from + 3 * 86_400);
        assert_eq!(found.len(), 3);
        assert_eq!(found[0], at("Europe/Paris", "2026-10-24", "11:00"));
        assert_eq!(found[1], at("Europe/Paris", "2026-10-25", "11:00"));
        // The day is 25 hours long, so these two are 25 hours apart.
        assert_eq!(found[2] - found[1], 24 * 3600);
        assert_eq!(found[1] - found[0], 25 * 3600);
    }

    #[test]
    fn a_time_the_clock_skips_moves_an_hour_later() {
        // 2026-03-29 02:30 does not exist in Paris.
        let r = rule("Europe/Paris", "02:30", 0, "2026-03-29", None);
        let from = at("Europe/Paris", "2026-03-28", "00:00");
        let found = occurrences(&r, from, from + 3 * 86_400);
        assert_eq!(found, vec![at("Europe/Paris", "2026-03-29", "03:30")]);
    }

    #[test]
    fn bad_input_is_refused() {
        assert!(Rule::parse("Nowhere/Land", "11:00", 0, "2026-11-05", None).is_err());
        assert!(Rule::parse("UTC", "25:00", 0, "2026-11-05", None).is_err());
        assert!(Rule::parse("UTC", "11:00", 200, "2026-11-05", None).is_err());
        assert!(Rule::parse("UTC", "11:00", 1, "2026-11-05", Some("2026-11-01")).is_err());
    }

    #[test]
    fn overlap_counts_what_runs_at_once() {
        let existing = [(0, 100), (50, 150), (200, 300)];
        assert_eq!(peak_overlap(&existing, (60, 90)), 2);
        assert_eq!(peak_overlap(&existing, (160, 190)), 0);
        assert_eq!(peak_overlap(&existing, (250, 260)), 1);
        // Two recordings that never run together are not an overlap of two.
        assert_eq!(peak_overlap(&[(0, 10), (20, 30)], (0, 30)), 1);
    }
}
