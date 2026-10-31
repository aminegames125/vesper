#!/usr/bin/env node
// Single source of truth for Vesper's version number.
//
//   node scripts/bump-version.mjs next          print the next version (from commits since the last tag)
//   node scripts/bump-version.mjs set 0.4.0     write 0.4.0 into every config, the README and the changelog
//   node scripts/bump-version.mjs auto          next + set
//
// The next version follows the commit subjects since the latest v* tag:
//   "feat!:", "type(scope)!:" or a "BREAKING CHANGE" body -> major
//   "feat:" / "feat(scope):"                              -> minor
//   anything else                                         -> patch
//
// Each changelog entry also records what kind of release it is and how big it was, in a comment
// the app reads to draw its banner:
//   ## [0.9.0] - 2026-10-31 <!-- release: minor; push: 12; changes: 7 -->
// `push` is the running number of pushes to main that produced a release (one tag per push) and
// `changes` is how many commits that push carried.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = (p) => join(root, p);
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

const SEMVER = /^\d+\.\d+\.\d+$/;
const WORKSPACE_CRATES = ["vesper-recorder", "vesper-server"];
const JSON_FILES = [
  "package.json",
  "apps/admin/package.json",
  "packages/cloud-client/package.json",
];

function lastTag() {
  try {
    return git("describe", "--tags", "--abbrev=0", "--match", "v[0-9]*");
  } catch {
    return null;
  }
}

function commitsSince(tag) {
  const range = tag ? `${tag}..HEAD` : "HEAD";
  const raw = git("log", range, "--no-merges", "--format=%s%x1f%b%x1e");
  return raw
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [subject, body = ""] = entry.split("\x1f");
      return { subject: subject.trim(), body };
    })
    .filter((c) => !/^chore\(release\)/.test(c.subject));
}

/** What kind of release these commits make: "major" (breaking), "minor" (a feature) or "patch". */
function releaseType(commits) {
  const breaking = commits.some((c) => /^\w+(\([^)]*\))?!:/.test(c.subject) || /BREAKING CHANGE/.test(c.body));
  const feature = commits.some((c) => /^feat(\([^)]*\))?:/i.test(c.subject));
  return breaking ? "major" : feature ? "minor" : "patch";
}

/** The number of releases made so far, plus this one. */
function pushNumber() {
  try {
    return git("tag", "-l", "v[0-9]*").split("\n").filter(Boolean).length + 1;
  } catch {
    return 1;
  }
}

function nextVersion() {
  const tag = lastTag();
  const base = tag ? tag.slice(1) : JSON.parse(readFileSync(file("package.json"), "utf8")).version;
  if (!SEMVER.test(base)) throw new Error(`Cannot read a version from "${base}"`);
  const commits = commitsSince(tag);
  if (tag && commits.length === 0) return null;
  let [major, minor, patch] = base.split(".").map(Number);
  const type = releaseType(commits);
  // Before 1.0 a breaking change only moves the minor number.
  if (type === "major" && major > 0) [major, minor, patch] = [major + 1, 0, 0];
  else if (type !== "patch") [minor, patch] = [minor + 1, 0];
  else patch += 1;
  return `${major}.${minor}.${patch}`;
}

function edit(path, fn) {
  const before = readFileSync(file(path), "utf8");
  const after = fn(before);
  if (after !== before) writeFileSync(file(path), after);
  return after !== before;
}

/** Rewrites only the "version" line so the file's formatting is untouched. */
function setJsonVersion(path, version) {
  edit(path, (text) => text.replace(/^(\s*"version":\s*")[^"]+(")/m, `$1${version}$2`));
}

function changelogEntry(version, commits, meta) {
  const date = new Date().toISOString().slice(0, 10);
  const groups = { Added: [], Fixed: [], Changed: [] };
  for (const { subject } of commits) {
    const clean = subject.replace(/^\w+(\([^)]*\))?!?:\s*/, "");
    const line = `- ${clean.charAt(0).toUpperCase()}${clean.slice(1)}`;
    if (/^feat/i.test(subject)) groups.Added.push(line);
    else if (/^fix/i.test(subject)) groups.Fixed.push(line);
    else groups.Changed.push(line);
  }
  const sections = Object.entries(groups)
    .filter(([, lines]) => lines.length)
    .map(([title, lines]) => `### ${title}\n${lines.join("\n")}`);
  const marker = `<!-- release: ${meta.type}; push: ${meta.push}; changes: ${meta.changes} -->`;
  return `## [${version}] - ${date} ${marker}\n\n${sections.join("\n\n") || "- Maintenance release."}\n\n`;
}

const KIND_LABEL = { major: "MAJOR UPDATE", minor: "MINOR UPDATE", patch: "PATCH" };
const GLOW = { major: 0.5, minor: 0.3, patch: 0.14 };

/** The banner shown at the top of GitHub release notes and the README: version, kind and size. */
function bannerSvg(version, { type, push, changes }) {
  const counts = `Push ${push}  ·  ${changes} ${changes === 1 ? "change" : "changes"}`;
  const chip = KIND_LABEL[type];
  const chipWidth = 44 + chip.length * 13;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 300" role="img" aria-label="Vesper ${version}, ${KIND_LABEL[type].toLowerCase()}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#14141a"/>
      <stop offset="1" stop-color="#0a0a0c"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.85" cy="0.1" r="0.7">
      <stop offset="0" stop-color="#ff5c7a" stop-opacity="${GLOW[type]}"/>
      <stop offset="1" stop-color="#ff5c7a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1280" height="300" rx="28" fill="url(#bg)"/>
  <rect width="1280" height="300" rx="28" fill="url(#glow)"/>
  <text x="72" y="82" fill="#8b8b95" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="30" font-weight="600">Vesper</text>
  <text x="68" y="206" fill="#f4f4f6" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="128" font-weight="800">${version}</text>
  <rect x="${1208 - chipWidth}" y="56" width="${chipWidth}" height="46" rx="23" fill="${type === "major" ? "#ff5c7a" : "#ff5c7a" + (type === "minor" ? "30" : "18")}"/>
  <text x="${1208 - chipWidth / 2}" y="87" text-anchor="middle" fill="${type === "major" ? "#14141a" : "#ff5c7a"}" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="1.5">${chip}</text>
  <text x="1208" y="250" text-anchor="end" fill="#8b8b95" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="26">${counts}</text>
</svg>
`;
}

function setVersion(version) {
  if (!SEMVER.test(version)) throw new Error(`"${version}" is not a version like 1.2.3`);
  const commits = commitsSince(lastTag());
  const meta = { type: releaseType(commits), push: pushNumber(), changes: commits.length };

  for (const path of JSON_FILES) setJsonVersion(path, version);

  edit("Cargo.toml", (text) =>
    text.replace(/(\[workspace\.package\][^[]*?\nversion\s*=\s*")[^"]+(")/, `$1${version}$2`),
  );
  // Cargo.lock lists the workspace crates too; keeping it in step lets `cargo --locked` pass.
  edit("Cargo.lock", (text) =>
    WORKSPACE_CRATES.reduce(
      (acc, name) => acc.replace(new RegExp(`(name = "${name}"\nversion = ")[^"]+(")`), `$1${version}$2`),
      text,
    ),
  );

  edit("README.md", (text) =>
    text
      .replace(
        /(<!-- version:start -->)[\s\S]*?(<!-- version:end -->)/,
        `$1<img alt="Version" src="https://img.shields.io/badge/version-${version}-FF5C7A?style=for-the-badge&labelColor=151518" /> <img alt="${meta.type} update" src="https://img.shields.io/badge/release-${meta.type}-FF5C7A?style=for-the-badge&labelColor=151518" />$2`,
      )
      .replace(/(Pushing a tag such as `v)\d+\.\d+\.\d+(`)/, `$1${version}$2`),
  );

  edit("CHANGELOG.md", (text) => {
    if (text.includes(`## [${version}]`)) return text;
    return text.replace(/(^## \[)/m, `${changelogEntry(version, commits, meta)}$1`);
  });

  writeFileSync(file("brand/release-banner.svg"), bannerSvg(version, meta));
}

const [command, arg] = process.argv.slice(2);
if (command === "next") {
  console.log(nextVersion() ?? "");
} else if (command === "set") {
  setVersion(arg);
  console.log(arg);
} else if (command === "auto") {
  const version = nextVersion();
  if (version) setVersion(version);
  console.log(version ?? "");
} else {
  console.error("usage: bump-version.mjs next | set <x.y.z> | auto");
  process.exit(2);
}
