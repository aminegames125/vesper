// Looks after draft releases. A failed or interrupted Release workflow leaves a draft behind that
// is empty or missing files, and since every push to main makes a new version they pile up.
//
//   node scripts/release-doctor.mjs            # fix what it finds
//   node scripts/release-doctor.mjs --dry-run  # only say what it would do
//
// The rules, in order, for each draft release:
//   - A Release workflow is still running: leave everything alone.
//   - All the expected files are there: publish it.
//   - Files are missing and a newer release (draft or published) exists: delete the draft. The tag
//     stays.
//   - Files are missing and it is the newest: start the Release workflow for it again, unless runs
//     since the draft was created have already failed MAX_TRIES times (then say so and stop).

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const MAX_TRIES = 3;

/** The files a finished release carries, from its tag (`v1.2.3`). */
export function expectedAssets(tag) {
  const version = tag.replace(/^v/, "").split("-")[0];
  const base = [
    `vesper-server-${tag}-linux-x64.tar.gz`,
    `vesper-server-${tag}-linux-arm64.tar.gz`,
    `vesper-server-${tag}-windows-x64.zip`,
    `plugin.video.vesper-${version}.zip`,
  ];
  // The repository add-on has its own version number, so it is matched by prefix below.
  return { exact: base.flatMap((f) => [f, `${f}.sha256`]), prefixes: ["repository.vesper-"] };
}

export function missingAssets(tag, names) {
  const have = new Set(names);
  const { exact, prefixes } = expectedAssets(tag);
  const missing = exact.filter((f) => !have.has(f));
  for (const prefix of prefixes) {
    for (const suffix of [".zip", ".zip.sha256"]) {
      if (![...have].some((n) => n.startsWith(prefix) && n.endsWith(suffix))) {
        missing.push(`${prefix}*${suffix}`);
      }
    }
  }
  return missing;
}

const parts = (tag) => tag.replace(/^v/, "").split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0);
export function newer(a, b) {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}

/**
 * Decides what to do. `drafts` are `{ tag, assets: [names], createdAt }`, `published` is the list
 * of tags already published, `runs` are the Release workflow's
 * recent runs `{ status, conclusion, createdAt (epoch seconds) }`, `imageExists(tag)` says whether
 * the Docker image for the tag was pushed.
 * Returns a list of `{ action: "publish" | "retry" | "delete" | "give-up" | "wait", tag, why }`.
 */
export function plan({ drafts, published = [], runs, imageExists }) {
  if (runs.some((r) => r.status !== "completed")) {
    return [{ action: "wait", tag: "", why: "a Release run is still going" }];
  }
  const sorted = [...drafts].sort((a, b) => (newer(a.tag, b.tag) ? -1 : 1));
  // Only runs after a draft was made can be about it; older failures are someone else's history.
  const failuresFor = (draft) =>
    runs.filter((r) => r.conclusion === "failure" && r.createdAt >= (draft.createdAt ?? 0)).length;
  return sorted.map((draft, index) => {
    const failures = failuresFor(draft);
    const overtaken = published.find((tag) => newer(tag, draft.tag));
    const missing = missingAssets(draft.tag, draft.assets);
    if (missing.length === 0) {
      return imageExists(draft.tag)
        ? { action: "publish", tag: draft.tag, why: "every file is attached" }
        : index === 0 && !overtaken && failures < MAX_TRIES
          ? { action: "retry", tag: draft.tag, why: "files are there but the Docker image is not" }
          : { action: "delete", tag: draft.tag, why: "no Docker image and not the newest" };
    }
    if (index > 0 || overtaken) {
      return {
        action: "delete",
        tag: draft.tag,
        why: `superseded by ${overtaken ?? sorted[0].tag}; missing ${missing.length} files`,
      };
    }
    return failures >= MAX_TRIES
      ? { action: "give-up", tag: draft.tag, why: `${failures} failed runs since it was created; missing ${missing.join(", ")}` }
      : { action: "retry", tag: draft.tag, why: `missing ${missing.length} files` };
  });
}

// ---- the part that talks to GitHub ----

const gh = (...args) => execFileSync("gh", args, { encoding: "utf8" }).trim();
const json = (...args) => JSON.parse(gh(...args) || "null");

function imageExists(repoOwner, tag) {
  try {
    execFileSync("docker", ["manifest", "inspect", `ghcr.io/${repoOwner.toLowerCase()}/vesper-server:${tag}`], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function main() {
  const dry = process.argv.includes("--dry-run");
  const repo = process.env.GITHUB_REPOSITORY || json("repo", "view", "--json", "nameWithOwner").nameWithOwner;
  const owner = repo.split("/")[0];
  const releases = json("api", `repos/${repo}/releases?per_page=50`);
  const drafts = releases
    .filter((r) => r.draft)
    .map((r) => ({
      tag: r.tag_name,
      id: r.id,
      assets: r.assets.map((a) => a.name),
      createdAt: Date.parse(r.created_at) / 1000,
    }));
  const published = releases.filter((r) => !r.draft).map((r) => r.tag_name);
  const runs = json("run", "list", "--workflow", "release.yml", "--limit", "20", "--json", "status,conclusion,createdAt").map(
    (r) => ({ ...r, createdAt: Date.parse(r.createdAt) / 1000 }),
  );
  const steps = plan({
    drafts,
    published,
    runs,
    imageExists: (tag) => imageExists(owner, tag),
  });
  if (steps.length === 0) console.log("No draft releases. Nothing to do.");
  for (const step of steps) {
    console.log(`${step.action.padEnd(8)} ${step.tag || "-"}  ${step.why}`);
    if (dry || ["wait", "give-up"].includes(step.action)) continue;
    if (step.action === "publish") gh("release", "edit", step.tag, "--draft=false", ...(steps[0] === step ? ["--latest"] : []));
    if (step.action === "retry") gh("workflow", "run", "release.yml", "-f", `tag=${step.tag}`);
    if (step.action === "delete") gh("release", "delete", step.tag, "--yes");
  }
  if (steps.some((s) => s.action === "give-up")) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
