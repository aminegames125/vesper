import changelog from "../../../../CHANGELOG.md?raw";

export interface Release {
  version: string;
  date: string;
  title: string;
  notes: string[];
}

/** The version this build was made from; the release workflow keeps package.json current. */
export const CURRENT_VERSION: string = __APP_VERSION__;

/** Reads the repository's CHANGELOG.md, so the in-app notes are never written by hand. */
export function parseChangelog(text: string): Release[] {
  const releases: Release[] = [];
  for (const block of text.split(/^## \[/m).slice(1)) {
    const head = /^([^\]]+)\]\s*-\s*(\S+)/.exec(block);
    if (!head) continue;
    const notes = [...block.matchAll(/^- (.+)$/gm)].map((m) =>
      (m[1] ?? "").replace(/\*\*/g, "").trim(),
    );
    releases.push({
      version: head[1] ?? "",
      date: head[2] ?? "",
      title: `Vesper ${head[1]}`,
      notes,
    });
  }
  return releases;
}

export const RELEASES: Release[] = parseChangelog(changelog);
