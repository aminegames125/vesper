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
// Parts:
//   server  the Rust server, its recorder, and what is embedded into it (admin panel, client)
//   web     the admin panel and the shared client packages
//   kodi    the Kodi add-on
//   site    the landing page and its brand assets
//   docs    documentation and examples; nothing is built from them
//   tooling release and version scripts and workflows; they ship nothing and CI only runs their tests
//   all     something changed that can affect every part (the CI workflow, lockfiles, unknown files)
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const PARTS = ["server", "web", "kodi", "site", "docs", "tooling", "all"];

const RULES = [
  ["server", /^(apps\/server\/|crates\/|Cargo\.(toml|lock)$)/],
  // The admin panel is built into the server binary, so it counts for both.
  ["server", /^(apps\/admin\/|packages\/)/],
  ["web", /^(apps\/admin\/|packages\/)/],
  ["kodi", /^apps\/kodi\//],
  ["site", /^(apps\/site\/|brand\/|docs\/screenshots\/)/],
  ["docs", /^(docs\/|examples\/|[^/]+\.md$|LICENSE$)/],
  // The end-to-end and perf scripts exercise the server and the add-on.
  ["server", /^scripts\/(e2e|perf)/],
  ["kodi", /^scripts\/e2e/],
  ["tooling", /^(scripts\/|\.github\/)/],
  // Things that build or check every part.
  ["all", /^(\.github\/workflows\/ci\.yml$|pnpm-lock\.yaml$|pnpm-workspace\.yaml$|package\.json$|biome\.json$|turbo\.json$|\.npmrc$)/],
];

// Files that belong to no part on purpose and cannot change a build.
const INERT = /^(\.gitignore|\.gitattributes|\.dockerignore|\.env\.example|docker-compose\.yml|\.claude\/)/;

/** Which parts a list of changed file paths touches. */
export function parts(files) {
  const hit = Object.fromEntries(PARTS.map((p) => [p, false]));
  for (const file of files) {
    let matched = false;
    for (const [part, pattern] of RULES) {
      if (pattern.test(file)) {
        hit[part] = true;
        matched = true;
      }
    }
    if (!matched && !INERT.test(file)) hit.all = true; // a file nobody planned for: be careful
  }
  // The shared files affect every part's build, but a page or Kodi-only change must not.
  if (hit.all) for (const p of ["server", "web", "kodi", "site"]) hit[p] = true;
  return hit;
}

/** True when the change can alter something that ships: the server or the Kodi add-on. */
export const shipped = (hit) => hit.server || hit.kodi;

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

/** The parts touched in `base..head`; every part when the range cannot be read. */
export function between(base, head = "HEAD") {
  const files = changedFiles(base, head);
  return files === null ? parts(["unknown-file"]) : parts(files);
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

/** Parts touched by the release `tag` since the release before it. */
export function release(tag) {
  const previous = previousTag(tag);
  return previous ? between(previous, tag) : parts(["unknown-file"]);
}

/**
 * The version the Kodi add-on is at: the newest release that changed it. Releases that did not
 * touch the add-on leave it where it was, so Kodi does not offer an "update" that changes nothing.
 */
export function kodiVersion(all = tags(), touched = (tag) => release(tag).kodi) {
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
