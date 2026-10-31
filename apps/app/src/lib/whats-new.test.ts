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
});
