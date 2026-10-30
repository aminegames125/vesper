// Builds the Vesper Cloud server and copies it where Tauri expects a sidecar:
//   apps/app/src-tauri/binaries/vesper-server-<target-triple>[.exe]
// The desktop installers then ship the server next to the app, so "Run a server on this PC" just works.
//
//   node scripts/prepare-sidecar.mjs            debug build, fast, for development
//   node scripts/prepare-sidecar.mjs --release  optimised build, for installers
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const release = process.argv.includes("--release");
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });

const triple = execFileSync("rustc", ["-vV"], { encoding: "utf8" }).match(/host: (\S+)/)?.[1];
if (!triple) throw new Error("Could not read the Rust target triple from `rustc -vV`.");
const exe = triple.includes("windows") ? ".exe" : "";

// The admin panel is embedded into the server binary, so it has to exist first.
if (!existsSync(join(root, "apps/admin/dist/index.html")) || release) {
  run("pnpm", ["--filter", "@vesper/admin", "build"]);
}

run("cargo", ["build", "-p", "vesper-server", ...(release ? ["--release"] : [])]);

const built = join(root, "target", release ? "release" : "debug", `vesper-server${exe}`);
const target = join(root, "apps/app/src-tauri/binaries", `vesper-server-${triple}${exe}`);
mkdirSync(dirname(target), { recursive: true });
copyFileSync(built, target);
console.log(`Sidecar ready: ${target}`);
