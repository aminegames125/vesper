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
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = (p) => join(root, p);
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

const SEMVER = /^\d+\.\d+\.\d+$/;
const WORKSPACE_CRATES = ["vesper", "vesper-recorder", "vesper-server"];
const JSON_FILES = [
  "package.json",
  "apps/app/package.json",
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

function nextVersion() {
  const tag = lastTag();
  const base = tag ? tag.slice(1) : JSON.parse(readFileSync(file("package.json"), "utf8")).version;
  if (!SEMVER.test(base)) throw new Error(`Cannot read a version from "${base}"`);
  const commits = commitsSince(tag);
  if (tag && commits.length === 0) return null;
  let [major, minor, patch] = base.split(".").map(Number);
  const breaking = commits.some((c) => /^\w+(\([^)]*\))?!:/.test(c.subject) || /BREAKING CHANGE/.test(c.body));
  const feature = commits.some((c) => /^feat(\([^)]*\))?:/i.test(c.subject));
  if (breaking && major > 0) [major, minor, patch] = [major + 1, 0, 0];
  else if (breaking || feature) [minor, patch] = [minor + 1, 0];
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

function versionCode(version) {
  const [major, minor, patch] = version.split(".").map(Number);
  return major * 10000 + minor * 100 + patch;
}

function changelogEntry(version, commits) {
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
  return `## [${version}] - ${date}\n\n${sections.join("\n\n") || "- Maintenance release."}\n\n`;
}

function setVersion(version) {
  if (!SEMVER.test(version)) throw new Error(`"${version}" is not a version like 1.2.3`);
  const commits = commitsSince(lastTag());

  for (const path of JSON_FILES) setJsonVersion(path, version);
  setJsonVersion("apps/app/src-tauri/tauri.conf.json", version);

  edit("Cargo.toml", (text) =>
    text.replace(/(\[workspace\.package\][^[]*?\nversion\s*=\s*")[^"]+(")/, `$1${version}$2`),
  );
  // Cargo.lock lists the workspace crates too; keeping it in step lets `cargo --locked` pass.
  edit("Cargo.lock", (text) =>
    WORKSPACE_CRATES.reduce(
      (acc, name) => acc.replace(new RegExp(`(name = "${name}"\\nversion = ")[^"]+(")`), `$1${version}$2`),
      text,
    ),
  );

  edit("apps/android/app/build.gradle.kts", (text) =>
    text
      .replace(/(\?: )\d+(\s*\n\s*versionName)/, `$1${versionCode(version)}$2`)
      .replace(/(versionName = \(findProperty\("versionName"\) as String\?\) \?: ")[^"]+(")/, `$1${version}$2`)
      .replace(/-PversionName=[\d.]+ -PversionCode=\d+/, `-PversionName=${version} -PversionCode=${versionCode(version)}`),
  );

  edit("README.md", (text) =>
    text
      .replace(
        /(<!-- version:start -->)[\s\S]*?(<!-- version:end -->)/,
        `$1<img alt="Version" src="https://img.shields.io/badge/version-${version}-FF5C7A?style=for-the-badge&labelColor=151518" />$2`,
      )
      .replace(/(Pushing a tag such as `v)\d+\.\d+\.\d+(`)/, `$1${version}$2`),
  );

  edit("CHANGELOG.md", (text) => {
    if (text.includes(`## [${version}]`)) return text;
    return text.replace(/(^## \[)/m, `${changelogEntry(version, commits)}$1`);
  });

  edit("scripts/make-msix.ps1", (text) =>
    text.replace(/-Version \d+\.\d+\.\d+ -Out Vesper-\d+\.\d+\.\d+-/, `-Version ${version} -Out Vesper-${version}-`),
  );
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
