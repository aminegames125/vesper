import assert from "node:assert/strict";
import { test } from "node:test";
import { kodiVersion, PARTS, parts, previousTag, shipped } from "./changes.mjs";

const only = (hit) => PARTS.filter((p) => hit[p]).sort();

test("a Kodi-only change touches only Kodi, and ships it", () => {
  const hit = parts(["apps/kodi/plugin.video.vesper/service.py"]);
  assert.deepEqual(only(hit), ["kodi"]);
  assert.deepEqual(hit.ships, { server: false, kodi: true });
});

test("a server change touches the server but not Kodi or the site", () => {
  const hit = parts(["apps/server/src/jobs.rs", "crates/vesper-recorder/src/hls.rs"]);
  assert.deepEqual(only(hit), ["server"]);
  assert.deepEqual(hit.ships, { server: true, kodi: false });
});

test("the admin panel is built into the server, so it counts for both", () => {
  const hit = parts(["apps/admin/src/app.tsx"]);
  assert.deepEqual(only(hit), ["server", "web"]);
  assert.equal(hit.ships.server, true);
});

test("the landing page and docs ship nothing", () => {
  const site = parts(["apps/site/src/App.tsx", "brand/banner.svg"]);
  assert.deepEqual(only(site), ["site"]);
  assert.equal(shipped(site), false);
  const docs = parts(["README.md", "docs/EXTENDING.md", "examples/kodi-extension/listener.py"]);
  assert.deepEqual(only(docs), ["docs"]);
  assert.equal(shipped(docs), false);
});

test("changing the CI workflow makes CI check everything but ships nothing", () => {
  const hit = parts([".github/workflows/ci.yml"]);
  assert.deepEqual(only(hit), ["all", "kodi", "server", "site", "tooling", "web"]);
  assert.equal(shipped(hit), false);
});

test("a lockfile change rebuilds the server (the admin panel is inside it) but not the add-on", () => {
  const hit = parts(["pnpm-lock.yaml"]);
  assert.deepEqual(only(hit), ["server", "site", "web"]);
  assert.deepEqual(hit.ships, { server: true, kodi: false });
});

test("root JavaScript config is checked for the web parts and ships nothing", () => {
  for (const file of ["package.json", "biome.json", "turbo.json"]) {
    const hit = parts([file]);
    assert.deepEqual(only(hit), ["site", "web"], file);
    assert.equal(shipped(hit), false, file);
  }
});

test("release tooling ships nothing and builds nothing", () => {
  for (const file of ["scripts/release-doctor.mjs", ".github/workflows/release.yml", "scripts/changes.mjs"]) {
    const hit = parts([file]);
    assert.deepEqual(only(hit), ["tooling"], file);
    assert.equal(shipped(hit), false);
  }
});

test("the end-to-end scripts are checked against the server and the add-on, not shipped", () => {
  const hit = parts(["scripts/e2e-kodi.mjs"]);
  assert.deepEqual(only(hit), ["kodi", "server", "tooling"]);
  assert.equal(shipped(hit), false);
});

test("a file nobody planned for is treated carefully, but known inert files are not", () => {
  assert.equal(parts(["mystery.bin"]).all, true);
  assert.deepEqual(only(parts([".gitignore", "docker-compose.yml"])), []);
});

test("an empty change touches nothing", () => {
  assert.deepEqual(only(parts([])), []);
  assert.equal(shipped(parts([])), false);
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
  assert.equal(
    kodiVersion(all, () => false),
    "0.27.0",
  );
});
