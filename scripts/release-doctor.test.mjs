import assert from "node:assert/strict";
import { test } from "node:test";
import { missingAssets, newer, plan } from "./release-doctor.mjs";

const full = (tag, version = tag.slice(1)) => [
  ...["linux-x64.tar.gz", "linux-arm64.tar.gz", "windows-x64.zip"].flatMap((s) => [
    `vesper-server-${tag}-${s}`,
    `vesper-server-${tag}-${s}.sha256`,
  ]),
  `plugin.video.vesper-${version}.zip`,
  `plugin.video.vesper-${version}.zip.sha256`,
  "repository.vesper-1.0.0.zip",
  "repository.vesper-1.0.0.zip.sha256",
];

const done = { status: "completed", conclusion: "success", createdAt: 0 };
const failed = (createdAt) => ({ status: "completed", conclusion: "failure", createdAt });
const base = { imageExists: () => true, runs: [] };

test("versions compare as numbers", () => {
  assert.ok(newer("v0.27.10", "v0.27.9"));
  assert.ok(!newer("v0.9.0", "v0.10.0"));
});

test("a complete asset list has nothing missing; an empty one lists everything", () => {
  assert.deepEqual(missingAssets("v1.0.0", full("v1.0.0")), []);
  assert.equal(missingAssets("v1.0.0", []).length, 10);
});

test("nothing is touched while a Release run is going", () => {
  const out = plan({ ...base, drafts: [{ tag: "v1.0.0", assets: [] }], runs: [{ status: "in_progress", conclusion: "" }] });
  assert.deepEqual(out.map((s) => s.action), ["wait"]);
});

test("a complete draft is published", () => {
  const out = plan({ ...base, drafts: [{ tag: "v1.0.0", assets: full("v1.0.0") }], runs: [done] });
  assert.equal(out[0].action, "publish");
});

test("the newest incomplete draft is retried, older incomplete drafts are deleted", () => {
  const out = plan({
    ...base,
    drafts: [
      { tag: "v1.0.0", assets: [] },
      { tag: "v1.0.2", assets: full("v1.0.2").slice(0, 3) },
      { tag: "v1.0.1", assets: full("v1.0.1") },
    ],
    runs: [done],
  });
  assert.deepEqual(out.map((s) => [s.tag, s.action]), [
    ["v1.0.2", "retry"],
    ["v1.0.1", "publish"],
    ["v1.0.0", "delete"],
  ]);
});

test("it stops retrying after three failures since the draft was made", () => {
  const out = plan({
    ...base,
    drafts: [{ tag: "v1.0.0", assets: [], createdAt: 600 }],
    runs: [failed(900), failed(800), failed(700)],
  });
  assert.equal(out[0].action, "give-up");
});

test("failures from before the draft existed do not count against it", () => {
  const out = plan({
    ...base,
    drafts: [{ tag: "v1.0.0", assets: [], createdAt: 1000 }],
    runs: [failed(900), failed(800), failed(700), failed(600)],
  });
  assert.equal(out[0].action, "retry");
});

test("a broken draft older than a published release is deleted, not retried", () => {
  const out = plan({
    ...base,
    drafts: [{ tag: "v0.27.1", assets: [], createdAt: 1 }],
    published: ["v0.27.2", "v0.28.0"],
    runs: [done],
  });
  assert.equal(out[0].action, "delete");
  assert.match(out[0].why, /superseded by v0\.27\.2/);
});

test("a release that carried its server files expects them under the original release's name", () => {
  const sources = { server: "v0.9.0", kodi: "v1.0.0" };
  const names = [...full("v0.9.0").filter((n) => n.startsWith("vesper-server-")), ...full("v1.0.0").filter((n) => !n.startsWith("vesper-server-"))];
  assert.deepEqual(missingAssets("v1.0.0", names, sources), []);
  // The release's own name would not do for the server files.
  assert.ok(missingAssets("v1.0.0", full("v1.0.0").filter((n) => !n.startsWith("vesper-server-")), sources).length > 0);
});

test("a release that carried its Kodi files expects the add-on at the older version", () => {
  const sources = { server: "v1.0.0", kodi: "v0.8.0" };
  const names = [...full("v1.0.0").filter((n) => n.startsWith("vesper-server-")), "plugin.video.vesper-0.8.0.zip", "plugin.video.vesper-0.8.0.zip.sha256", "repository.vesper-1.0.0.zip", "repository.vesper-1.0.0.zip.sha256"];
  assert.deepEqual(missingAssets("v1.0.0", names, sources), []);
});

test("a complete carried release is published once its image exists", () => {
  const sources = { server: "v0.9.0", kodi: "v1.0.0" };
  const names = [...full("v0.9.0").filter((n) => n.startsWith("vesper-server-")), ...full("v1.0.0").filter((n) => !n.startsWith("vesper-server-"))];
  const out = plan({ ...base, drafts: [{ tag: "v1.0.0", assets: names }], runs: [done], sourcesOf: () => sources });
  assert.equal(out[0].action, "publish");
});

test("files without a Docker image are not published", () => {
  const out = plan({ ...base, drafts: [{ tag: "v1.0.0", assets: full("v1.0.0") }], runs: [done], imageExists: () => false });
  assert.equal(out[0].action, "retry");
});
