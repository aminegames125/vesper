#!/usr/bin/env node
// Prints the GitHub release notes for a tag: the banner, then that version's changelog entry,
// then the standing notes in docs/RELEASE_NOTES.md.
//
//   node scripts/release-notes.mjs v0.9.0
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tag = process.argv[2];
if (!tag) {
  console.error("usage: release-notes.mjs <tag>");
  process.exit(2);
}
const version = tag.replace(/^v/, "");
const repo = process.env.GITHUB_REPOSITORY || "aminegames125/vesper";

const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
const block = changelog.split(/^## \[/m).find((b) => b.startsWith(`${version}]`));
const body = block
  ? block
      .split("\n")
      .slice(1)
      .join("\n")
      .trim()
  : "";
const kind = /release:\s*(\w+)/.exec(block ?? "")?.[1];
const label = kind ? `${kind[0].toUpperCase()}${kind.slice(1)} update` : "Release";

const parts = [
  `![Vesper ${version}, ${label}](https://raw.githubusercontent.com/${repo}/${tag}/brand/release-banner.svg)`,
  body,
  readFileSync(join(root, "docs/RELEASE_NOTES.md"), "utf8").trim(),
];
console.log(parts.filter(Boolean).join("\n\n"));
