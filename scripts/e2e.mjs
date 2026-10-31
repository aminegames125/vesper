// End-to-end check of the server against real HTTP: downloads with Range, the deletion timer,
// folders, share links, the TV guide and series rules, the calendar, import/export, merged
// channels, the dry run, and the lite-mode guard.
//
//   cargo build -p vesper-server && node scripts/e2e.mjs
//
// Set VESPER_BIN to use another server binary.

import { spawn } from "node:child_process";
import http from "node:http";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 8591;
const FIXTURE = 8592;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const FIX = `http://127.0.0.1:${FIXTURE}`;
const bin =
  process.env.VESPER_BIN ??
  (existsSync("target/debug/vesper-server.exe")
    ? "target/debug/vesper-server.exe"
    : "target/debug/vesper-server");

const MOVIE = Buffer.alloc(600_000);
for (let i = 0; i < MOVIE.length; i++) MOVIE[i] = i % 251;

const stamp = (seconds) => {
  const d = new Date(seconds * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())} +0000`;
};
const now = () => Math.floor(Date.now() / 1000);

const fixture = http
  .createServer((req, res) => {
    const url = new URL(req.url, FIX);
    if (url.pathname === "/movie.mp4") {
      const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
      if (range) {
        const start = Number(range[1]);
        const end = range[2] ? Number(range[2]) : MOVIE.length - 1;
        res.writeHead(206, {
          "content-type": "video/mp4",
          "content-range": `bytes ${start}-${end}/${MOVIE.length}`,
          "content-length": end - start + 1,
        });
        return res.end(MOVIE.subarray(start, end + 1));
      }
      res.writeHead(200, { "content-type": "video/mp4", "content-length": MOVIE.length });
      return res.end(MOVIE);
    }
    if (url.pathname === "/live.ts") {
      res.writeHead(200, { "content-type": "video/mp2t" });
      const packet = Buffer.alloc(188, 0xff);
      packet[0] = 0x47;
      const timer = setInterval(() => res.write(Buffer.concat(Array(40).fill(packet))), 250);
      req.on("close", () => clearInterval(timer));
      return;
    }
    if (url.pathname === "/list-a.m3u") {
      res.writeHead(200, { "content-type": "audio/x-mpegurl" });
      return res.end(
        `#EXTM3U\n#EXTINF:-1 tvg-id="alpha.id" group-title="News",Alpha News\n${FIX}/live.ts?a=1\n` +
          `#EXTINF:-1 group-title="Movies",Some Film\n${FIX}/movie/1.mp4\n`,
      );
    }
    if (url.pathname === "/list-b.m3u") {
      res.writeHead(200, { "content-type": "audio/x-mpegurl" });
      return res.end(`#EXTM3U\n#EXTINF:-1 group-title="News",alpha-news\n${FIX}/live.ts?b=2\n`);
    }
    if (url.pathname === "/guide.xml") {
      const t = now();
      res.writeHead(200, { "content-type": "application/xml" });
      return res.end(
        `<?xml version="1.0"?><tv><channel id="alpha.id"><display-name>Alpha News</display-name></channel>` +
          `<programme start="${stamp(t + 7200)}" stop="${stamp(t + 10800)}" channel="alpha.id"><title>Evening Show</title><desc>Tonight.</desc></programme>` +
          `<programme start="${stamp(t + 10800)}" stop="${stamp(t + 14400)}" channel="alpha.id"><title>Late Movie</title></programme></tv>`,
      );
    }
    res.writeHead(404).end();
  })
  .listen(FIXTURE);

const dir = mkdtempSync(join(tmpdir(), "vesper-e2e-"));
const server = spawn(bin, ["--mode", "lite", "--bind", `127.0.0.1:${PORT}`, "--data-dir", dir], {
  stdio: "ignore",
});

const api = async (method, path, body, headers = {}) => {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let j = {};
  try {
    j = JSON.parse(text);
  } catch {}
  return { s: r.status, j, h: r.headers, text };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(400);
  }
};

let failed = 0;
const check = (ok, name, extra = "") => {
  console.log(ok ? "PASS" : "FAIL", name, ok ? "" : extra);
  if (!ok) failed++;
};

try {
  await until(async () => (await api("GET", "/info").catch(() => ({ s: 0 }))).s === 200, 15000);

  // ---- status and defaults
  const status = await api("GET", "/status");
  check(status.s === 200 && typeof status.j.ffmpeg === "boolean", "status reports ffmpeg");
  check(status.j.defaultKeepHours === 168, "default deletion timer is a week", status.j.defaultKeepHours);

  // ---- download a movie with Range support
  const dl = await api("POST", "/downloads", { title: "Movie night", url: `${FIX}/movie.mp4` });
  check(dl.s === 200 && dl.j.id, "download accepted", JSON.stringify(dl.j));
  const done = await until(async () => {
    const r = await api("GET", `/recordings/${dl.j.id}`);
    return r.j.status === "done" || r.j.status === "failed" ? r.j : null;
  });
  check(done?.status === "done", "download finishes", JSON.stringify(done));
  check(done?.bytes === MOVIE.length && done?.kind === "download", "download is complete", JSON.stringify(done));
  check(
    done?.keepHours === 168 && Math.abs(done.keepUntil - (now() + 168 * 3600)) < 300,
    "download gets the default timer",
    JSON.stringify([done?.keepHours, done?.keepUntil]),
  );
  const part = await fetch(`${BASE}/recordings/${dl.j.id}/download`, { headers: { range: "bytes=100-199" } });
  const partBody = Buffer.from(await part.arrayBuffer());
  check(
    part.status === 206 &&
      part.headers.get("content-range") === `bytes 100-199/${MOVIE.length}` &&
      partBody.equals(MOVIE.subarray(100, 200)),
    "range request returns exactly those bytes",
    `${part.status} ${part.headers.get("content-range")}`,
  );
  const past = await fetch(`${BASE}/recordings/${dl.j.id}/download`, { headers: { range: "bytes=9999999-" } });
  check(past.status === 416, "range past the end is refused", past.status);
  const whole = Buffer.from(await (await fetch(`${BASE}/recordings/${dl.j.id}/download`)).arrayBuffer());
  check(whole.equals(MOVIE), "whole download matches");

  // ---- deletion timer can be changed later
  await api("PATCH", `/recordings/${dl.j.id}`, { keep_hours: 24 });
  let one = (await api("GET", `/recordings/${dl.j.id}`)).j;
  check(one.keepHours === 24 && Math.abs(one.keepUntil - (now() + 86400)) < 300, "timer changed to a day", JSON.stringify([one.keepHours, one.keepUntil]));
  await api("PATCH", `/recordings/${dl.j.id}`, { keep_hours: 0 });
  one = (await api("GET", `/recordings/${dl.j.id}`)).j;
  check(one.keepHours === null && one.keepUntil === null, "timer can be switched off");
  await api("PUT", "/admin/settings", { delete_watched_days: "2" });
  await api("PATCH", `/recordings/${dl.j.id}`, { watched: true, position_s: 90 });
  one = (await api("GET", `/recordings/${dl.j.id}`)).j;
  check(one.watched && one.positionS === 90 && one.keepUntil === null, "watching never overrides keep-forever", JSON.stringify([one.watched, one.keepUntil]));
  await api("PATCH", `/recordings/${dl.j.id}`, { keep_hours: 720, watched: false });
  await api("PATCH", `/recordings/${dl.j.id}`, { watched: true });
  one = (await api("GET", `/recordings/${dl.j.id}`)).j;
  check(Math.abs(one.keepUntil - (now() + 2 * 86400)) < 300, "watched items with a timer are pulled in", JSON.stringify([one.watched, one.keepUntil]));
  const badSetting = await api("PUT", "/admin/settings", { quiet_start: "25:99" });
  check(badSetting.s === 400, "bad setting values are refused", badSetting.s);

  // ---- folders and search
  await api("PATCH", `/recordings/${dl.j.id}`, { tag: "Films", title: "Movie night 2" });
  const tagged = await api("GET", "/recordings?tag=Films");
  const searched = await api("GET", "/recordings?q=night");
  const none = await api("GET", "/recordings?tag=Nope");
  check(tagged.j.recordings.length === 1 && tagged.j.tags.includes("Films"), "folder filter and tag list");
  check(searched.j.recordings.length === 1 && none.j.recordings.length === 0, "title search");

  // ---- a live recording, then a share link that works for someone who is not logged in
  const rec = await api("POST", "/recordings", { title: "Live sample", url: `${FIX}/live.ts`, seconds: 12 });
  const recDone = await until(async () => {
    const r = await api("GET", `/recordings/${rec.j.id}`);
    return r.j.status === "done" || r.j.status === "failed" ? r.j : null;
  }, 40000);
  check(recDone?.status === "done" && recDone.bytes > 0, "live recording finishes", JSON.stringify(recDone));
  check(recDone?.keepHours === 168, "recording gets the default timer too");
  const share = await api("POST", `/recordings/${rec.j.id}/share`, { hours: 1 });
  check(share.s === 200 && share.j.token, "share link made", JSON.stringify(share.j));
  const foreign = { Origin: "http://evil.example.com", "Sec-Fetch-Site": "cross-site" };
  const sharedList = await fetch(`${BASE}/share/${share.j.token}/index.m3u8`, { headers: foreign });
  const listText = await sharedList.text();
  check(
    sharedList.status === 200 && listText.includes("seg/seg00000.ts") && sharedList.headers.get("access-control-allow-origin") === "*",
    "share playlist opens from another site with CORS (for Chromecast)",
    `${sharedList.status} ${sharedList.headers.get("access-control-allow-origin")}`,
  );
  const seg = await fetch(`${BASE}/share/${share.j.token}/seg/seg00000.ts`, { headers: { ...foreign, range: "bytes=0-187" } });
  check(seg.status === 206 && (await seg.arrayBuffer()).byteLength === 188, "share segment supports range");
  const guarded = await fetch(`${BASE}/recordings`, { headers: foreign });
  check(guarded.status === 403, "other sites still cannot use the API", guarded.status);
  const preflight = await fetch(`${BASE}/recordings/${rec.j.id}/index.m3u8`, {
    method: "OPTIONS",
    headers: { Origin: "https://www.gstatic.com", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "range" },
  });
  check(preflight.status === 204 && preflight.headers.get("access-control-allow-origin") === "*", "media preflight is answered", preflight.status);
  const expired = await fetch(`${BASE}/share/not-a-token/index.m3u8`);
  check(expired.status === 404, "unknown share link is refused");

  // ---- dry run
  const sample = await api("POST", "/channels/test", { url: `${FIX}/live.ts`, seconds: 4 });
  check(sample.j.ok === true && sample.j.bytes > 0, "dry run records and discards a sample", JSON.stringify(sample.j));

  // ---- playlists: merged channels, movies apart from live
  await api("POST", "/sources", { name: "A", kind: "m3u", url: `${FIX}/list-a.m3u` });
  await api("POST", "/sources", { name: "B", kind: "m3u", url: `${FIX}/list-b.m3u` });
  const all = await api("GET", "/channels?source=all");
  const alpha = all.j.channels?.find((c) => c.name === "Alpha News");
  check(all.j.channels?.length === 2 && alpha?.alt?.length === 1, "same-named channels are merged with a backup", JSON.stringify(all.j));
  check(alpha?.id === "alpha.id" && alpha?.kind === "live", "channel keeps its guide id");
  const films = await api("GET", "/channels?source=all&kind=movie");
  check(films.j.channels?.length === 1 && films.j.channels[0].name === "Some Film", "movies are told apart");

  // ---- the guide and series rules
  await api("PUT", "/admin/settings", { epg_url: `${FIX}/guide.xml` });
  const refreshed = await api("POST", "/guide/refresh");
  check(refreshed.j.programmes === 2, "guide is downloaded", JSON.stringify(refreshed.j));
  const onNow = await api("GET", `/guide?name=alpha%20news&to=${now() + 20000}`);
  check(onNow.j.channelId === "alpha.id" && onNow.j.programmes.length === 2, "guide found by channel name", JSON.stringify(onNow.j));
  const found = await api("GET", "/guide/search?q=evening");
  check(found.j.programmes?.length === 1 && found.j.programmes[0].channelName === "Alpha News", "guide search");
  const rule = await api("POST", "/series-rules", {
    title: "Evening", epg_channel_id: "alpha.id", channel_name: "Alpha News", url: `${FIX}/live.ts`, pad_before: 60, pad_after: 120, tag: "Shows",
  });
  check(rule.s === 200 && rule.j.id, "series rule created", JSON.stringify(rule.j));
  let calendar = await api("GET", "/calendar");
  const item = calendar.j.items?.find((i) => i.title === "Evening Show");
  check(item && item.endAt - item.startAt === 3600 + 180, "rule scheduled the programme with padding", JSON.stringify(calendar.j));
  await api("POST", "/guide/refresh");
  calendar = await api("GET", "/calendar");
  check(calendar.j.items.filter((i) => i.title === "Evening Show").length === 1, "refreshing does not duplicate occurrences");
  await api("DELETE", `/series-rules/${rule.j.id}`);
  calendar = await api("GET", "/calendar");
  check(!calendar.j.items.some((i) => i.title === "Evening Show"), "deleting the rule removes upcoming recordings");

  // ---- export and import schedules
  const day = new Date().toISOString().slice(0, 10);
  const sched = await api("POST", "/schedules", {
    title: "Morning news", channel_name: "Alpha News", url: `${FIX}/live.ts`, tz: "UTC", start_time: "03:00",
    seconds: 600, days: 127, start_date: day, tag: "News", backup_url: `${FIX}/live.ts?b=2`, quality: "lowest",
  });
  check(sched.s === 200, "schedule with backup, folder and quality", JSON.stringify(sched.j));
  const exported = await api("GET", "/schedules/export");
  check(exported.j.schedules?.length === 1 && exported.j.schedules[0].tag === "News" && exported.j.schedules[0].quality === "lowest", "schedules export", JSON.stringify(exported.j));
  const imported = await api("POST", "/schedules/import", { schedules: exported.j.schedules });
  check(imported.j.added === 1 && imported.j.problems.length === 0, "schedules import", JSON.stringify(imported.j));
  const sched2 = await api("GET", "/schedules");
  check(sched2.j.schedules.length === 2, "import adds a second schedule");
  const upcoming = await api("GET", "/recordings?tag=News");
  check(upcoming.j.recordings.length > 0 && upcoming.j.recordings.every((r) => r.keepHours === 168), "occurrences carry folder and default timer", JSON.stringify(upcoming.j.recordings?.[0]));
  const storage = await api("GET", "/status/storage");
  check(storage.s === 200 && storage.j.biggest.length > 0, "storage overview");
} catch (error) {
  console.log("FAIL unexpected", error);
  failed++;
} finally {
  server.kill();
  fixture.close();
  await sleep(300);
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
  console.log(failed === 0 ? "ALL PASSED" : `${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}
