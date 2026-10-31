import changelog from "../../../../CHANGELOG.md?raw";

export type ReleaseKind = "major" | "minor" | "patch";

export interface ReleaseGroup {
  /** "Added", "Fixed" or "Changed". */
  title: string;
  notes: string[];
}

export interface Release {
  version: string;
  date: string;
  title: string;
  /** Every note, flat. */
  notes: string[];
  /** The notes under their Added / Fixed / Changed headings. */
  groups: ReleaseGroup[];
  kind: ReleaseKind;
  /** The running number of pushes that made a release, when the entry records it. */
  push: number | null;
  /** How many commits that push carried, when the entry records it. */
  changes: number | null;
}

/** The version this build was made from; the release workflow keeps package.json current. */
export const CURRENT_VERSION: string = __APP_VERSION__;

const KINDS: ReleaseKind[] = ["major", "minor", "patch"];

/** Older entries carry no marker, so their kind comes from how the number moved. */
function kindFromVersions(version: string, previous: string | undefined): ReleaseKind {
  const now = version.split(".").map(Number);
  const before = previous?.split(".").map(Number);
  if (!before) return "minor";
  if ((now[0] ?? 0) > (before[0] ?? 0)) return "major";
  if ((now[1] ?? 0) > (before[1] ?? 0)) return "minor";
  return "patch";
}

/** Reads the repository's CHANGELOG.md, so the in-app notes are never written by hand. */
export function parseChangelog(text: string): Release[] {
  const releases: Release[] = [];
  const marker: boolean[] = [];
  for (const block of text.split(/^## \[/m).slice(1)) {
    const head = /^([^\]]+)\]\s*-\s*(\d{4}-\d{2}-\d{2})([^\n]*)/.exec(block);
    if (!head) continue;
    const meta = /<!--\s*(.*?)\s*-->/.exec(head[3] ?? "")?.[1] ?? "";
    const field = (name: string) => new RegExp(`${name}:\\s*([\\w]+)`).exec(meta)?.[1];
    const marked = field("release");
    const number = (name: string) => {
      const value = Number(field(name));
      return Number.isFinite(value) && field(name) !== undefined ? value : null;
    };

    const groups: ReleaseGroup[] = [];
    for (const part of block.split(/^### /m).slice(1)) {
      const title = part.split("\n", 1)[0]?.trim() ?? "";
      const notes = [...part.matchAll(/^- (.+)$/gm)].map((m) =>
        (m[1] ?? "").replace(/\*\*/g, "").trim(),
      );
      if (title && notes.length) groups.push({ title, notes });
    }
    // Entries without headings still list their bullets.
    const flat = [...block.matchAll(/^- (.+)$/gm)].map((m) =>
      (m[1] ?? "").replace(/\*\*/g, "").trim(),
    );
    if (groups.length === 0 && flat.length) groups.push({ title: "Changed", notes: flat });

    releases.push({
      version: head[1] ?? "",
      date: head[2] ?? "",
      title: `Vesper ${head[1]}`,
      notes: flat,
      groups,
      kind: KINDS.find((k) => k === marked) ?? "patch",
      push: number("push"),
      changes: number("changes"),
    });
    marker.push(KINDS.some((k) => k === marked));
  }
  // Entries that predate the marker get their kind from the entry below them.
  releases.forEach((r, i) => {
    if (!marker[i]) r.kind = kindFromVersions(r.version, releases[i + 1]?.version);
  });
  return releases;
}

export const RELEASES: Release[] = parseChangelog(changelog);
