import assert from "node:assert/strict";
import { test } from "node:test";
import { decide, sourceTag } from "./release-plan.mjs";

const all = ["v0.4.0", "v0.3.0", "v0.2.0", "v0.1.0"];
const ships = (server, kodi) => ({ ships: { server, kodi } });
// What each release changed: the server in 0.1 and 0.2, Kodi in 0.1 and 0.3, only docs in 0.4.
const history = { "v0.1.0": ships(true, true), "v0.2.0": ships(true, false), "v0.3.0": ships(false, true), "v0.4.0": ships(false, false) };
const changed = (tag) => history[tag];
const everythingUsable = () => true;

test("the newest earlier release that changed a part is its source", () => {
  assert.equal(sourceTag("server", "v0.4.0", all, changed), "v0.2.0");
  assert.equal(sourceTag("kodi", "v0.4.0", all, changed), "v0.3.0");
  assert.equal(sourceTag("kodi", "v0.1.0", all, changed), null);
});

test("a part that changed is built", () => {
  const plan = decide({ tag: "v0.3.0", all: all.slice(0), changed, usable: everythingUsable });
  assert.deepEqual(plan.kodi, { build: true, source: "v0.3.0" });
  assert.deepEqual(plan.server, { build: false, source: "v0.2.0" });
});

test("a part that did not change is carried from the release that last built it", () => {
  const plan = decide({ tag: "v0.4.0", all, changed, usable: everythingUsable });
  assert.deepEqual(plan.server, { build: false, source: "v0.2.0" });
  assert.deepEqual(plan.kodi, { build: false, source: "v0.3.0" });
});

test("it builds after all when the source release lost its files or was never published", () => {
  const usable = (tag, part) => !(tag === "v0.2.0" && part === "server");
  const plan = decide({ tag: "v0.4.0", all, changed, usable });
  assert.deepEqual(plan.server, { build: true, source: "v0.4.0" });
  assert.deepEqual(plan.kodi, { build: false, source: "v0.3.0" });
});

test("the first release builds everything", () => {
  const plan = decide({ tag: "v0.1.0", all, changed, usable: everythingUsable });
  assert.equal(plan.server.build, true);
  assert.equal(plan.kodi.build, true);
});

test("with no earlier release to copy from, an unchanged part is built", () => {
  const onlyDocs = { "v0.2.0": ships(false, false), "v0.1.0": ships(false, false) };
  const plan = decide({ tag: "v0.2.0", all: ["v0.2.0", "v0.1.0"], changed: (t) => onlyDocs[t], usable: everythingUsable });
  assert.equal(plan.server.build, true);
});
