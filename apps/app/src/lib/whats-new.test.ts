import { describe, expect, it } from "vitest";
import { parseChangelog } from "./whats-new";

describe("parseChangelog", () => {
  it("reads versions, dates and bullets, newest first", () => {
    const text = `# Changelog

## [0.3.0] - 2026-10-31

### Added
- **Billboard** on Home
- Top 10 rail

## [0.2.0] - 2026-10-30

### Fixed
- Player loads streams
`;
    const releases = parseChangelog(text);
    expect(releases.map((r) => r.version)).toEqual(["0.3.0", "0.2.0"]);
    expect(releases[0]).toMatchObject({
      date: "2026-10-31",
      notes: ["Billboard on Home", "Top 10 rail"],
    });
    expect(releases[1]?.notes).toEqual(["Player loads streams"]);
  });

  it("reads the release kind, push number and change count from the marker", () => {
    const [release] =
      parseChangelog(`## [1.0.0] - 2026-11-02 <!-- release: major; push: 12; changes: 7 -->

### Added
- A thing

### Fixed
- Another thing
`);
    expect(release).toMatchObject({ kind: "major", push: 12, changes: 7 });
    expect(release?.groups).toEqual([
      { title: "Added", notes: ["A thing"] },
      { title: "Fixed", notes: ["Another thing"] },
    ]);
  });

  it("works out the kind of older entries from how the number moved", () => {
    const kinds = parseChangelog(`## [0.4.1] - 2026-10-31
- a

## [0.4.0] - 2026-10-30
- b

## [0.3.2] - 2026-10-29
- c
`).map((r) => r.kind);
    expect(kinds[0]).toBe("patch");
    expect(kinds[1]).toBe("minor");
  });
});
