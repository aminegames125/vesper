import assert from "node:assert/strict";
import { test } from "node:test";
import { kodiVersion, parts, previousTag, shipped } from "./changes.mjs";

const only = (hit) => Object.entries(hit).filter(([, v]) => v).map(([k]) => k).sort();

test("a Kodi-only change touches only Kodi", () => {
  assert.deepEqual(only(parts(["apps/kodi/plugin.video.vesper/service.py"])), ["kodi"]);
});

test("a server change touches the server but not Kodi or the site", () => {
  assert.deepEqual(only(parts(["apps/server/src/jobs.rs", "crates/vesper-recorder/src/hls.rs"])), ["server"]);
});

test("the admin panel is built into the server, so it counts for both", () => {
  assert.deepEqual(only(parts(["apps/admin/src/app.tsx"])), ["server", "web"]);
});

test("the landing page and docs ship nothing", () => {
  const site = parts(["apps/site/src/App.tsx", "brand/banner.svg"]);
  assert.deepEqual(only(site), ["site"]);
  assert.equal(shipped(site), false);
  const docs = parts(["README.md", "docs/EXTENDING.md", "examples/kodi-extension/listener.py"]);
  assert.deepEqual(only(docs), ["docs"]);
  assert.equal(shipped(docs), false);
});

test("the CI workflow, lockfiles and root config can affect everything", () => {
  for (const file of [".github/workflows/ci.yml", "pnpm-lock.yaml", "package.json"]) {
    assert.deepEqual(only(parts([file])).filter((p) => p !== "tooling"), ["all", "kodi", "server", "site", "web"], file);
  }
});

test("release tooling ships nothing and builds nothing", () => {
  for (const file of ["scripts/release-doctor.mjs", ".github/workflows/release.yml", "scripts/changes.mjs"]) {
    const hit = parts([file]);
    assert.deepEqual(only(hit), ["tooling"], file);
    assert.equal(shipped(hit), false);
  }
});

test("the end-to-end scripts count for the server and the add-on", () => {
  assert.deepEqual(only(parts(["scripts/e2e-kodi.mjs"])), ["kodi", "server", "tooling"]);
});

test("a file nobody planned for is treated carefully, but known inert files are not", () => {
  assert.equal(parts(["mystery.bin"]).all, true);
  assert.deepEqual(only(parts([".gitignore", "docker-compose.yml"])), []);
});

test("an empty change touches nothing", () => {
  assert.deepEqual(only(parts([])), []);
});

test("the previous tag is the next one down the list", () => {
  const all = ["v0.3.0", "v0.2.1", "v0.2.0"];
  assert.equal(previousTag("v0.3.0", all), "v0.2.1");
  assert.equal(previousTag("v0.2.0", all), null);
});

test("Kodi stays at the last release that changed it", () => {
  const all = ["v0.30.0", "v0.29.0", "v0.28.0", "v0.27.0"];
  const touched = (tag) => tag === "v0.28.0" || tag === "v0.27.0";
  assert.equal(kodiVersion(all, touched), "0.28.0");
  assert.equal(kodiVersion(all, () => false), "0.27.0");
});
