#!/usr/bin/env node
// Works out which parts of Vesper a range of commits touched, so a workflow only builds, tests or
// releases what changed.
//
//   node scripts/changes.mjs --base <ref> [--head <ref>]   print "server=true" style lines
//   node scripts/changes.mjs kodi-version                   the version the Kodi add-on is at
//
// Under GitHub Actions the lines are also appended to $GITHUB_OUTPUT.
//
// Commits whose subject starts with "chore(release)" are ignored: they only rewrite version numbers
// in every config, and counting them would make every part look changed on every release.
//
// Two questions are answered separately, because they differ:
//   - What must CI check?  Everything a change can affect, including the CI workflow itself.
//   - What gets released?  Only files that end up in the server or the Kodi add-on. Changing a
//     test script or the CI workflow checks more, but ships nothing.
//
// Parts:
//   server  the Rust server, its recorder, and what is embedded into it (admin panel, client)
//   web     the admin panel, the shared client packages and the JS tooling that checks them
//   kodi    the Kodi add-on
//   site    the landing page and its brand assets
//   docs    documentation and examples; nothing is built from them
//   tooling release and version scripts and workflows; CI only runs their tests
//   all     the CI workflow itself or a file nobody planned for: CI checks every part
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const PARTS = ["server", "web", "kodi", "site", "docs", "tooling", "all"];

// [part, pattern, ships]. `ships` is true when the file ends up in the server binary or the add-on.
const RULES = [
  ["server", /^(apps\/server\/|crates\/|Cargo\.(toml|lock)$)/, true],
  // The admin panel is built into the server binary, so it counts for both.
  ["server", /^(apps\/admin\/|packages\/)/, true],
  ["web", /^(apps\/admin\/|packages\/)/, false],
  // The lockfile decides which dependencies the admin panel (and so the server) is built with.
  ["server", /^(pnpm-lock\.yaml|pnpm-workspace\.yaml|\.npmrc)$/, true],
  ["web", /^(pnpm-lock\.yaml|pnpm-workspace\.yaml|\.npmrc)$/, false],
  ["site", /^(pnpm-lock\.yaml|pnpm-workspace\.yaml|\.npmrc)$/, false],
  // Root JS config only changes how the JavaScript is checked and built, not what is released.
  ["web", /^(package\.json|biome\.json|turbo\.json)$/, false],
  ["site", /^(package\.json|biome\.json|turbo\.json)$/, false],
  ["kodi", /^apps\/kodi\//, true],
  ["site", /^(apps\/site\/|brand\/|docs\/screenshots\/)/, false],
  ["docs", /^(docs\/|examples\/|[^/]+\.md$|LICENSE$)/, false],
  // The end-to-end and perf scripts are checked against the server and the add-on, but not shipped.
  ["server", /^scripts\/(e2e|perf)/, false],
  ["kodi", /^scripts\/e2e/, false],
  ["tooling", /^(scripts\/|\.github\/)/, false],
  ["all", /^\.github\/workflows\/ci\.yml$/, false],
];

// Files that belong to no part on purpose and cannot change a build.
const INERT = /^(\.gitignore|\.gitattributes|\.dockerignore|\.env\.example|docker-compose\.yml|\.claude\/)/;

/**
 * Which parts a list of changed file paths touches, for CI. The result also has `ships`:
 * `{ server, kodi }`, true only when a file that goes into that release part changed.
 */
export function parts(files) {
  const hit = Object.fromEntries(PARTS.map((p) => [p, false]));
  const ships = { server: false, kodi: false };
  for (const file of files) {
    let matched = false;
    for (const [part, pattern, ship] of RULES) {
      if (!pattern.test(file)) continue;
      hit[part] = true;
      matched = true;
      if (ship && part in ships) ships[part] = true;
    }
    if (!matched && !INERT.test(file)) hit.all = true; // a file nobody planned for: be careful
  }
  // CI checks every part when the workflow itself, or something unknown, changed.
  if (hit.all) for (const p of ["server", "web", "kodi", "site", "tooling"]) hit[p] = true;
  return { ...hit, ships };
}

/** True when the change alters something that ships: the server or the Kodi add-on. */
export const shipped = (hit) => hit.ships.server || hit.ships.kodi;

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
const ZERO = /^0+$/;

/** Files changed by the non-release commits in `base..head`. `null` means "cannot tell". */
export function changedFiles(base, head = "HEAD") {
  if (!base || ZERO.test(base)) return null;
  try {
    git("cat-file", "-e", `${base}^{commit}`);
    const out = git("log", "--no-merges", "--invert-grep", "--grep=^chore(release)", "--name-only", "--pretty=format:", `${base}..${head}`);
    return [...new Set(out.split("\n").filter(Boolean))];
  } catch {
    return null;
  }
}

// When a range cannot be read, assume the worst: everything changed and everything ships.
const UNKNOWN = { ...parts(["unknown-file"]), ships: { server: true, kodi: true } };

/** The parts touched in `base..head`; every part when the range cannot be read. */
export function between(base, head = "HEAD") {
  const files = changedFiles(base, head);
  return files === null ? UNKNOWN : parts(files);
}

/** `v*` tags, newest first. */
export function tags() {
  return git("tag", "--list", "v[0-9]*", "--sort=-v:refname").split("\n").filter(Boolean);
}

/** The tag before `tag`, or null for the first one. */
export function previousTag(tag, all = tags()) {
  const i = all.indexOf(tag);
  return i >= 0 ? (all[i + 1] ?? null) : (all[0] ?? null);
}

/** What the release `tag` changed since the release before it (`ships` says what it must build). */
export function release(tag) {
  const previous = previousTag(tag);
  return previous ? between(previous, tag) : UNKNOWN;
}

/**
 * The version the Kodi add-on is at: the newest release that changed it. Releases that did not
 * touch the add-on leave it where it was, so Kodi does not offer an "update" that changes nothing.
 */
export function kodiVersion(all = tags(), touched = (tag) => release(tag).ships.kodi) {
  const found = all.find((tag) => touched(tag));
  return (found ?? all[all.length - 1] ?? "v0.0.0").replace(/^v/, "");
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === "kodi-version") return console.log(kodiVersion());
  const value = (flag) => args[args.indexOf(flag) + 1];
  const hit = between(value("--base"), value("--head") ?? "HEAD");
  const lines = [...PARTS.map((p) => `${p}=${hit[p]}`), `shipped=${shipped(hit)}`];
  console.log(lines.join("\n"));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
