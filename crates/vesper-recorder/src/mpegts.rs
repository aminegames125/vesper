//! A tiny MPEG-TS muxer.
//!
//! Plenty of HLS masters keep a channel's sound in its own rendition: the video variant names an
//! `AUDIO` group and the sound lives in a separate `#EXT-X-MEDIA` playlist. A recorder that
//! follows only the video variant then writes silent files. This module joins one video-only
//! segment with the audio-only segment that covers the same moment: the audio packets move to a
//! free PID, the program's PMT is rebuilt so players know the new stream is there, and the two
//! are interleaved by presentation time.

use std::collections::{HashSet, VecDeque};

const PACKET: usize = 188;
const SYNC: u8 = 0x47;
const NULL_PID: u16 = 0x1FFF;

/// Joins a video-only segment with its audio-only counterpart. `None` when either part is not
/// plain MPEG-TS or cannot be read, so the caller can fall back to what it has.
pub(crate) fn mux(video: &[u8], audio: &[u8]) -> Option<Vec<u8>> {
    if !is_ts(video) || !is_ts(audio) {
        return None;
    }
    let video = packets_of(video);
    let audio = packets_of(audio);

    let video_pmt = pmt_pid(&video)?;
    let video_section = pmt_section(&video, video_pmt)?;
    let (pcr, streams) = parse_pmt(&video_section)?;
    if streams.is_empty() {
        return None;
    }
    let audio_pmt = pmt_pid(&audio)?;
    let audio_section = pmt_section(&audio, audio_pmt)?;
    let audio_streams = parse_pmt(&audio_section)?.1;
    // An audio rendition carries audio; when its PMT is odd, the first stream is the best guess.
    let source = audio_streams
        .iter()
        .find(|es| is_audio(es.stream_type))
        .or_else(|| audio_streams.first())
        .cloned()?;
    let source_pid = source.pid;

    // The audio keeps its PID only if nothing else uses it; otherwise it moves to a free one.
    let mut used: HashSet<u16> = [0, 1, 0x11, video_pmt, pcr, NULL_PID].into_iter().collect();
    used.extend(streams.iter().map(|es| es.pid));
    let audio_pid = if used.contains(&source_pid) {
        (0x0100u16..0x1F00).find(|pid| !used.contains(pid))?
    } else {
        source_pid
    };
    if audio_pid != source_pid {
        used.insert(audio_pid);
    }

    let mut merged_streams = streams;
    merged_streams.push(Es {
        pid: audio_pid,
        ..source
    });
    let section = build_pmt(&video_section, &merged_streams);
    let new_pmt = pmt_packet(video_pmt, &section, 0)?;

    // Keep the video's program table and data; its own PMT is dropped and replaced by ours.
    let mut header: Vec<Vec<u8>> = Vec::new();
    let mut video_es: Vec<Vec<u8>> = Vec::new();
    let mut had_pmt = false;
    for packet in video {
        match pid_of(&packet) {
            0 => header.push(packet),
            NULL_PID => {}
            pid if pid == video_pmt => had_pmt = true,
            _ => video_es.push(packet),
        }
    }
    if !had_pmt {
        return None;
    }
    header.push(new_pmt);

    let audio_es: Vec<Vec<u8>> = audio
        .into_iter()
        .filter(|p| pid_of(p) == source_pid)
        .collect();
    if audio_es.is_empty() {
        return None;
    }

    let rename = (audio_pid != source_pid).then_some(audio_pid);
    let merged = interleave(chunks(video_es, None), chunks(audio_es, rename));
    let mut out = Vec::with_capacity(PACKET * (header.len() + merged.len()));
    for packet in header.into_iter().chain(merged) {
        out.extend_from_slice(&packet);
    }
    Some(out)
}

/// True when the bytes are a whole number of 188-byte transport packets.
fn is_ts(data: &[u8]) -> bool {
    data.len() >= PACKET * 2
        && data.len().is_multiple_of(PACKET)
        && data[0] == SYNC
        && data[PACKET] == SYNC
}

fn packets_of(data: &[u8]) -> Vec<Vec<u8>> {
    data.as_chunks::<PACKET>()
        .0
        .iter()
        .map(|c| c.to_vec())
        .collect()
}

fn pid_of(p: &[u8]) -> u16 {
    (((p[1] & 0x1F) as u16) << 8) | p[2] as u16
}

fn set_pid(p: &mut [u8], pid: u16) {
    p[1] = (p[1] & 0xE0) | (((pid >> 8) as u8) & 0x1F);
    p[2] = (pid & 0xFF) as u8;
}

fn payload_start(p: &[u8]) -> bool {
    p[1] & 0x40 != 0
}

/// Where a packet's payload begins, or `None` when it carries none.
fn payload_at(p: &[u8]) -> Option<usize> {
    if p[3] & 0x10 == 0 {
        return None;
    }
    let at = if p[3] & 0x20 != 0 {
        5 + p[4] as usize
    } else {
        4
    };
    (at < PACKET).then_some(at)
}

/// The PMT's PID, read from the first program of the PAT.
fn pmt_pid(packets: &[Vec<u8>]) -> Option<u16> {
    for p in packets {
        if pid_of(p) != 0 || !payload_start(p) {
            continue;
        }
        let Some(at) = payload_at(p) else { continue };
        let Some(section) = p.get(at + 1 + p[at] as usize..) else {
            continue;
        };
        if section.len() < 12 || section[0] != 0x00 {
            continue;
        }
        let length = (((section[1] & 0x0F) as usize) << 8) | section[2] as usize;
        let end = 3 + length - 4;
        let mut i = 8;
        while i + 4 <= end && i + 4 <= section.len() {
            let program = u16::from_be_bytes([section[i], section[i + 1]]);
            if program != 0 {
                return Some((((section[i + 2] & 0x1F) as u16) << 8) | section[i + 3] as u16);
            }
            i += 4;
        }
    }
    None
}

/// The PMT section carried on `pid`, when it fits in one packet (it always does in practice).
fn pmt_section(packets: &[Vec<u8>], pid: u16) -> Option<Vec<u8>> {
    for p in packets {
        if pid_of(p) != pid || !payload_start(p) {
            continue;
        }
        let Some(at) = payload_at(p) else { continue };
        let Some(section) = p.get(at + 1 + p[at] as usize..) else {
            continue;
        };
        if section.len() < 3 || section[0] != 0x02 {
            continue;
        }
        let length = (((section[1] & 0x0F) as usize) << 8) | section[2] as usize;
        if section.len() >= 3 + length {
            return Some(section[..3 + length].to_vec());
        }
    }
    None
}

#[derive(Clone)]
struct Es {
    stream_type: u8,
    pid: u16,
    descriptors: Vec<u8>,
}

/// A PMT's clock reference and its elementary streams.
fn parse_pmt(section: &[u8]) -> Option<(u16, Vec<Es>)> {
    if section.len() < 16 || section[0] != 0x02 {
        return None;
    }
    let length = (((section[1] & 0x0F) as usize) << 8) | section[2] as usize;
    let end = 3 + length;
    if end > section.len() {
        return None;
    }
    let pcr = (((section[8] & 0x1F) as u16) << 8) | section[9] as u16;
    let info_len = (((section[10] & 0x0F) as usize) << 8) | section[11] as usize;
    let mut i = 12 + info_len;
    let mut streams = Vec::new();
    while i + 5 <= end - 4 {
        let stream_type = section[i];
        let pid = (((section[i + 1] & 0x1F) as u16) << 8) | section[i + 2] as u16;
        let dlen = (((section[i + 3] & 0x0F) as usize) << 8) | section[i + 4] as usize;
        if i + 5 + dlen > end - 4 {
            break;
        }
        streams.push(Es {
            stream_type,
            pid,
            descriptors: section[i + 5..i + 5 + dlen].to_vec(),
        });
        i += 5 + dlen;
    }
    Some((pcr, streams))
}

/// Rebuilds a PMT with the given streams, keeping its program number, clock and descriptors.
fn build_pmt(section: &[u8], streams: &[Es]) -> Vec<u8> {
    let info_len = (((section[10] & 0x0F) as usize) << 8) | section[11] as usize;
    let info = &section[12..12 + info_len];
    let mut body = Vec::new();
    for es in streams {
        body.push(es.stream_type);
        body.push(0xE0 | (((es.pid >> 8) as u8) & 0x1F));
        body.push((es.pid & 0xFF) as u8);
        body.push(0xF0 | (((es.descriptors.len() >> 8) as u8) & 0x0F));
        body.push((es.descriptors.len() & 0xFF) as u8);
        body.extend_from_slice(&es.descriptors);
    }
    // The section length counts everything after its own field: the nine header bytes kept above,
    // the program info, the elementary streams and the CRC.
    let length = 9 + info_len + body.len() + 4;
    let mut out = Vec::with_capacity(3 + length);
    out.extend_from_slice(&section[..12]);
    out[1] = 0xB0 | (((length >> 8) as u8) & 0x0F);
    out[2] = (length & 0xFF) as u8;
    out.extend_from_slice(info);
    out.extend_from_slice(&body);
    out.extend_from_slice(&crc32(&out).to_be_bytes());
    out
}

/// Packs a section into one packet, stuffing the rest. `None` when it would not fit (it does).
fn pmt_packet(pid: u16, section: &[u8], cc: u8) -> Option<Vec<u8>> {
    let total = 1 + section.len();
    if total > 183 {
        return None;
    }
    let mut p = vec![0xFFu8; PACKET];
    p[0] = SYNC;
    p[1] = 0x40;
    set_pid(&mut p, pid);
    let fill = 183 - total;
    p[3] = 0x30 | (cc & 0x0F);
    p[4] = fill as u8;
    if fill >= 1 {
        p[5] = 0x00;
    }
    let at = 5 + fill;
    p[at] = 0x00;
    p[at + 1..at + 1 + section.len()].copy_from_slice(section);
    Some(p)
}

/// The MPEG-2 CRC a section ends with.
fn crc32(data: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;
    for &byte in data {
        crc ^= (byte as u32) << 24;
        for _ in 0..8 {
            crc = if crc & 0x8000_0000 != 0 {
                (crc << 1) ^ 0x04C1_1DB7
            } else {
                crc << 1
            };
        }
    }
    crc
}

fn is_audio(stream_type: u8) -> bool {
    matches!(stream_type, 0x03 | 0x04 | 0x06 | 0x0F | 0x11 | 0x81 | 0x87)
}

struct Chunk {
    dts: u64,
    packets: Vec<Vec<u8>>,
}

/// Splits a stream into one chunk per PES packet, optionally moving it to another PID.
fn chunks(packets: Vec<Vec<u8>>, rename: Option<u16>) -> Vec<Chunk> {
    let mut out: Vec<Chunk> = Vec::new();
    let mut last = 0u64;
    for mut packet in packets {
        let starts = payload_start(&packet)
            && payload_at(&packet).is_some_and(|at| packet[at..].starts_with(&[0, 0, 1]));
        if starts || out.is_empty() {
            let dts = if starts {
                payload_at(&packet)
                    .and_then(|at| pes_time(&packet[at..]))
                    .map_or(last, |(_, dts)| dts)
            } else {
                last
            };
            last = dts;
            out.push(Chunk {
                dts,
                packets: Vec::new(),
            });
        }
        if let Some(pid) = rename {
            set_pid(&mut packet, pid);
        }
        if let Some(chunk) = out.last_mut() {
            chunk.packets.push(packet);
        }
    }
    out
}

/// Reads the DTS (and PTS) a PES header carries.
fn pes_time(payload: &[u8]) -> Option<(u64, u64)> {
    if payload.len() < 14 || !payload.starts_with(&[0, 0, 1]) {
        return None;
    }
    let (mut pts, mut dts) = (None, None);
    match payload[7] >> 6 {
        0b11 => {
            pts = stamp(&payload[9..14]);
            dts = stamp(&payload[14..19]);
        }
        0b10 => pts = stamp(&payload[9..14]),
        _ => {}
    }
    let pts = pts.unwrap_or(0);
    Some((pts, dts.unwrap_or(pts)))
}

fn stamp(b: &[u8]) -> Option<u64> {
    if b.len() < 5 {
        return None;
    }
    Some(
        (((b[0] as u64) >> 1 & 0x07) << 30)
            | ((b[1] as u64) << 22)
            | (((b[2] as u64) >> 1) << 15)
            | ((b[3] as u64) << 7)
            | ((b[4] as u64) >> 1),
    )
}

/// Merges two streams so their packets follow presentation time, keeping each pair together.
fn interleave(first: Vec<Chunk>, second: Vec<Chunk>) -> Vec<Vec<u8>> {
    let mut first: VecDeque<Chunk> = first.into();
    let mut second: VecDeque<Chunk> = second.into();
    let mut out = Vec::new();
    while let (Some(a), Some(b)) = (first.front(), second.front()) {
        if a.dts <= b.dts {
            if let Some(chunk) = first.pop_front() {
                out.extend(chunk.packets);
            }
        } else if let Some(chunk) = second.pop_front() {
            out.extend(chunk.packets);
        }
    }
    for chunk in first.into_iter().chain(second) {
        out.extend(chunk.packets);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const PMT: u16 = 0x1000;
    const VIDEO: u16 = 0x0100;
    const AUDIO: u16 = 0x0200;

    fn section(table_id: u8, body: &[u8]) -> Vec<u8> {
        let length = body.len() + 4;
        let mut out = vec![
            table_id,
            0xB0 | (((length >> 8) as u8) & 0x0F),
            (length & 0xFF) as u8,
        ];
        out.extend_from_slice(body);
        out.extend_from_slice(&crc32(&out).to_be_bytes());
        out
    }

    fn pat(program: u16, pmt: u16) -> Vec<u8> {
        section(
            0x00,
            &[
                // transport_stream_id, version/current, section numbers, then the program entry.
                0x00,
                0x01,
                0xC1,
                0x00,
                0x00,
                (program >> 8) as u8,
                program as u8,
                0xE0 | (((pmt >> 8) as u8) & 0x1F),
                (pmt & 0xFF) as u8,
            ],
        )
    }

    fn pmt(program: u16, pcr: u16, streams: &[(u8, u16)]) -> Vec<u8> {
        let mut body = vec![
            (program >> 8) as u8,
            program as u8,
            0xC1,
            0x00,
            0x00,
            0xE0 | (((pcr >> 8) as u8) & 0x1F),
            (pcr & 0xFF) as u8,
            0xF0,
            0x00,
        ];
        for (stream_type, pid) in streams {
            body.push(*stream_type);
            body.push(0xE0 | (((pid >> 8) as u8) & 0x1F));
            body.push((pid & 0xFF) as u8);
            body.extend_from_slice(&[0xF0, 0x00]);
        }
        section(0x02, &body)
    }

    fn packet(pid: u16, cc: u8, payload: &[u8]) -> Vec<u8> {
        let mut p = vec![0xFFu8; PACKET];
        p[0] = SYNC;
        p[1] = 0x40;
        set_pid(&mut p, pid);
        let fill = 183 - payload.len().min(183);
        p[3] = 0x30 | (cc & 0x0F);
        p[4] = fill as u8;
        if fill >= 1 {
            p[5] = 0x00;
        }
        let at = 5 + fill;
        let take = payload.len().min(183);
        p[at..at + take].copy_from_slice(&payload[..take]);
        p
    }

    fn psi(pid: u16, sec: &[u8]) -> Vec<u8> {
        let mut payload = vec![0x00];
        payload.extend_from_slice(sec);
        packet(pid, 0, &payload)
    }

    fn encode_stamp(ts: u64) -> [u8; 5] {
        [
            0x31 | (((ts >> 30) as u8 & 0x07) << 1),
            (ts >> 22) as u8,
            (((ts >> 15) as u8 & 0x7F) << 1) | 0x01,
            (ts >> 7) as u8,
            ((ts as u8 & 0x7F) << 1) | 0x01,
        ]
    }

    fn pes(stream_id: u8, dts: u64, data: &[u8]) -> Vec<u8> {
        let stamp = encode_stamp(dts);
        let mut out = vec![0x00, 0x00, 0x01, stream_id, 0x00, 0x00, 0x80, 0xC0, 10];
        out.extend_from_slice(&stamp);
        out.extend_from_slice(&stamp);
        out.extend_from_slice(data);
        let length = (out.len() - 6) as u16;
        out[4] = (length >> 8) as u8;
        out[5] = length as u8;
        out
    }

    fn video_segment() -> Vec<u8> {
        let mut out = psi(0, &pat(1, PMT));
        out.extend(psi(PMT, &pmt(1, VIDEO, &[(0x1B, VIDEO)])));
        out.extend(packet(VIDEO, 0, &pes(0xE0, 1000, &[1, 2, 3])));
        out.extend(packet(VIDEO, 1, &[4, 5, 6]));
        out
    }

    fn audio_on(pid: u16) -> Vec<u8> {
        let mut out = psi(0, &pat(1, PMT));
        out.extend(psi(PMT, &pmt(1, pid, &[(0x0F, pid)])));
        out.extend(packet(pid, 0, &pes(0xC0, 900, &[7, 8, 9])));
        out.extend(packet(pid, 1, &[10, 11, 12]));
        out
    }

    fn audio_segment() -> Vec<u8> {
        audio_on(AUDIO)
    }

    #[test]
    fn audio_is_muxed_into_the_video_segment() {
        let out = mux(&video_segment(), &audio_segment()).unwrap();
        assert_eq!(out.len() % PACKET, 0);

        let packets = packets_of(&out);
        let (_, streams) = parse_pmt(&pmt_section(&packets, PMT).unwrap()).unwrap();
        assert_eq!(streams.len(), 2);
        assert!(streams.iter().any(|es| es.pid == VIDEO));

        let audio_pid = streams.iter().find(|es| es.pid != VIDEO).unwrap().pid;
        let carried: HashSet<u16> = packets.iter().map(|p| pid_of(p)).collect();
        assert!(carried.contains(&VIDEO));
        assert!(carried.contains(&audio_pid));
        // The audio comes first, because it was given the earlier presentation time.
        let first_es = packets
            .iter()
            .map(|p| pid_of(p))
            .find(|pid| *pid != 0 && *pid != PMT)
            .unwrap();
        assert_eq!(first_es, audio_pid);
    }

    #[test]
    fn a_free_audio_pid_is_left_alone() {
        // The audio already sits on a PID the video program does not use, so it stays put.
        let out = mux(&video_segment(), &audio_segment()).unwrap();
        let packets = packets_of(&out);
        assert!(packets.iter().any(|p| pid_of(p) == AUDIO));
    }

    #[test]
    fn an_audio_pid_that_collides_moves_aside() {
        // A rendition that reuses the video's PID would be unplayable once joined; it is moved.
        let out = mux(&video_segment(), &audio_on(VIDEO)).unwrap();
        let packets = packets_of(&out);
        let (_, streams) = parse_pmt(&pmt_section(&packets, PMT).unwrap()).unwrap();
        let audio_pid = streams.iter().find(|es| es.pid != VIDEO).unwrap().pid;
        assert_ne!(audio_pid, VIDEO);
        assert!(packets.iter().any(|p| pid_of(p) == audio_pid));
    }

    #[test]
    fn anything_that_is_not_transport_stream_is_refused() {
        assert!(mux(b"not a stream", &audio_segment()).is_none());
        assert!(mux(&video_segment(), &[0u8; 100]).is_none());
    }

    #[test]
    fn a_segment_without_a_program_map_is_refused() {
        // A PAT that names a PMT which never arrives leaves nothing to build on.
        let mut video = psi(0, &pat(1, PMT));
        video.extend(packet(VIDEO, 0, &pes(0xE0, 1000, &[1, 2, 3])));
        assert!(mux(&video, &audio_segment()).is_none());
    }

    #[test]
    fn stamps_round_trip() {
        for ts in [0u64, 1, 90_000, 4_000_000_000, 8_589_934_591] {
            let bytes = encode_stamp(ts);
            assert_eq!(stamp(&bytes), Some(ts));
        }
    }
}
