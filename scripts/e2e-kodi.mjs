// Runs the Kodi add-on's api layer and screens (with a stand-in for Kodi) against real servers,
// one in lite mode and one in full mode.
//
//   cargo build -p vesper-server && node scripts/e2e-kodi.mjs
//
// Set VESPER_BIN to use another server binary, and PYTHON for another interpreter.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const bin =
  process.env.VESPER_BIN ??
  (existsSync("target/debug/vesper-server.exe")
    ? "target/debug/vesper-server.exe"
    : "target/debug/vesper-server");
const python = process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3");
const LITE = 8593;
const FULL = 8594;
const PASSWORD = "e2e-password-123";
const dirs = [];
const servers = [];

function start(mode, port, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), `vesper-kodi-${mode}-`));
  dirs.push(dir);
  const child = spawn(bin, ["--mode", mode, "--bind", `127.0.0.1:${port}`, "--data-dir", dir, "--no-discovery"], {
    env: { ...process.env, ...extra },
    stdio: "ignore",
  });
  servers.push(child);
}

async function ready(port) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/v1/info`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server on ${port} did not start`);
}

let code = 1;
try {
  start("lite", LITE);
  start("full", FULL, { VESPER_ADMIN_USER: "admin", VESPER_ADMIN_PASSWORD: PASSWORD, VESPER_ALLOW_PRIVATE: "true" });
  await Promise.all([ready(LITE), ready(FULL)]);
  const run = spawnSync(python, ["-I", "-m", "unittest", "discover", "-s", "apps/kodi/tests", "-v"], {
    stdio: "inherit",
    env: {
      ...process.env,
      VESPER_URL: `http://127.0.0.1:${LITE}`,
      VESPER_FULL_URL: `http://127.0.0.1:${FULL}`,
      VESPER_FULL_USER: "admin",
      VESPER_FULL_PASSWORD: PASSWORD,
    },
  });
  code = run.status ?? 1;
} finally {
  for (const s of servers) s.kill();
  await new Promise((r) => setTimeout(r, 300));
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}
process.exit(code);
