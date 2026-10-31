// How the server behaves with a lot going on: 100 schedules, 20 recordings at once, and the API
// still answering quickly while they run.
//
//   cargo build -p vesper-server && node scripts/perf.mjs
//
// Set VESPER_BIN to use another server binary.

import { spawn } from "node:child_process";
import http from "node:http";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 8593;
const FIXTURE = 8594;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const bin =
  process.env.VESPER_BIN ??
  (existsSync("target/debug/vesper-server.exe") ? "target/debug/vesper-server.exe" : "target/debug/vesper-server");

const stream = http
  .createServer((req, res) => {
    res.writeHead(200, { "content-type": "video/mp2t" });
    const packet = Buffer.alloc(188, 0xff);
    packet[0] = 0x47;
    const timer = setInterval(() => res.write(Buffer.concat(Array(100).fill(packet))), 200);
    req.on("close", () => clearInterval(timer));
  })
  .listen(FIXTURE);

const dir = mkdtempSync(join(tmpdir(), "vesper-perf-"));
const server = spawn(bin, ["--mode", "lite", "--bind", `127.0.0.1:${PORT}`, "--data-dir", dir], { stdio: "ignore" });

const call = async (method, path, body) => {
  const started = performance.now();
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { s: r.status, j, ms: performance.now() - started };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)];

let failed = 0;
const check = (ok, name, extra = "") => {
  console.log(ok ? "PASS" : "FAIL", name, extra);
  if (!ok) failed++;
};

try {
  for (let i = 0; i < 40; i++) {
    if ((await call("GET", "/info").catch(() => ({ s: 0 }))).s === 200) break;
    await sleep(250);
  }
  await call("PUT", "/admin/settings", { default_keep_hours: "" });

  const day = new Date().toISOString().slice(0, 10);
  const made = await Promise.all(
    Array.from({ length: 100 }, (_, i) =>
      call("POST", "/schedules", {
        title: `Show ${i}`,
        channel_name: `Channel ${i}`,
        url: `http://127.0.0.1:${FIXTURE}/live${i}.ts`,
        tz: "UTC",
        start_time: `${String(i % 24).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`,
        seconds: 1800,
        days: 127,
        start_date: day,
      }),
    ),
  );
  check(made.every((r) => r.s === 200), "100 schedules created", made.find((r) => r.s !== 200)?.j?.error ?? "");

  const calendar = await call("GET", "/calendar");
  check(calendar.s === 200 && calendar.j.items.length > 100, "calendar covers the week", `${calendar.j.items?.length} entries in ${calendar.ms.toFixed(0)} ms`);

  const recs = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      call("POST", "/recordings", { title: `Now ${i}`, url: `http://127.0.0.1:${FIXTURE}/now${i}.ts`, seconds: 14 }),
    ),
  );
  check(recs.filter((r) => r.s === 200).length > 0, "recordings started", `${recs.filter((r) => r.s === 200).length} accepted`);

  // The API must stay quick while recordings write to the database every second.
  const latencies = [];
  const end = Date.now() + 10_000;
  while (Date.now() < end) {
    latencies.push((await call("GET", "/recordings")).ms);
    await sleep(100);
  }
  const p95 = percentile(latencies, 0.95);
  check(p95 < 500, "the list stays quick while recording", `p95 ${p95.toFixed(0)} ms over ${latencies.length} requests`);

  let done = 0;
  for (let i = 0; i < 40 && done < 1; i++) {
    await sleep(1000);
    const list = (await call("GET", "/recordings")).j.recordings ?? [];
    done = list.filter((r) => r.title.startsWith("Now") && (r.status === "done" || r.status === "failed")).length;
  }
  check(done > 0, "recordings finish", `${done} finished`);
} catch (error) {
  console.log("FAIL unexpected", error);
  failed++;
} finally {
  server.kill();
  stream.close();
  await sleep(300);
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
  console.log(failed === 0 ? "ALL PASSED" : `${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}
