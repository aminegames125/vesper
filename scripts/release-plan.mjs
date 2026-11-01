#!/usr/bin/env node
// Decides, for one release tag, which parts to build and which to carry forward.
//
//   node scripts/release-plan.mjs v0.30.0
//
// A part (the server files and image, or the Kodi add-on files) is built only when files that go
// into it changed since the previous release. Otherwise its files are copied from the newest
// earlier release that has them, under their original names, so every release page still carries a
// complete set: the Kodi-only release lists the server downloads too, and says which version they are.
// If there is nothing to copy from (the source release was never published, or lost its files), the
// part is built after all.
//
// Under GitHub Actions the answers are also appended to $GITHUB_OUTPUT.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { release, tags } from "./changes.mjs";

export const PART_FILES = {
  server: (name) => name.startsWith("vesper-server-"),
  kodi: (name) => name.startsWith("plugin.video.vesper-") || name.startsWith("repository.vesper-"),
};

/** The newest tag older than `tag` whose release changed `part`, or null. */
export function sourceTag(part, tag, all, changed) {
  const older = all.slice(all.indexOf(tag) + 1);
  return older.find((t) => changed(t).ships[part]) ?? null;
}

/**
 * `{ server: {build, source}, kodi: {build, source} }`. `changed(tag)` is what that release changed
 * (changes.mjs `release`), `usable(tag, part)` says whether that release still has the part's files.
 */
export function decide({ tag, all, changed, usable }) {
  const mine = changed(tag);
  const answer = {};
  for (const part of Object.keys(PART_FILES)) {
    if (mine.ships[part]) {
      answer[part] = { build: true, source: tag };
      continue;
    }
    const source = sourceTag(part, tag, all, changed);
    answer[part] =
      source && usable(source, part) ? { build: false, source } : { build: true, source: tag };
  }
  return answer;
}

const gh = (...args) => JSON.parse(execFileSync("gh", args, { encoding: "utf8" }) || "null");

/** True when a published release has the files of `part` attached. */
export function usableOnGitHub(tag, part) {
  try {
    const info = gh("release", "view", tag, "--json", "isDraft,assets");
    return !info.isDraft && info.assets.some((a) => PART_FILES[part](a.name));
  } catch {
    return false;
  }
}

export function planFor(tag) {
  const all = tags();
  return decide({ tag, all, changed: (t) => release(t), usable: usableOnGitHub });
}

function main() {
  const tag = process.argv[2];
  if (!tag) throw new Error("usage: release-plan.mjs <tag>");
  const plan = planFor(tag);
  const lines = [
    `build_server=${plan.server.build}`,
    `build_kodi=${plan.kodi.build}`,
    `server_source=${plan.server.source}`,
    `kodi_source=${plan.kodi.source}`,
  ];
  console.log(lines.join("\n"));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
