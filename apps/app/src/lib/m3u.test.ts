import { describe, expect, it } from "vitest";
import { groupBy, parseM3U } from "./m3u";

const SAMPLE = `﻿#EXTM3U
#EXTINF:-1 tvg-id="news.us" tvg-logo="https://x.test/a.png" group-title="News",Alpha, The News
http://x.test/a.m3u8
#EXTVLCOPT:network-caching=1000
#EXTINF:-1 group-title="Sports",Beta
http://x.test/b.m3u8
#EXTINF:-1,Gamma
http://x.test/c.m3u8
#EXTINF:-1 group-title="News",Orphan without url
`;

describe("parseM3U", () => {
  const channels = parseM3U(SAMPLE.replace(/\n/g, "\r\n"), "p1");

  it("reads names, including commas in titles", () => {
    expect(channels.map((c) => c.name)).toEqual(["Alpha, The News", "Beta", "Gamma"]);
  });

  it("reads attributes and defaults the group", () => {
    expect(channels[0]).toMatchObject({
      tvgId: "news.us",
      logo: "https://x.test/a.png",
      group: "News",
      providerId: "p1",
    });
    expect(channels[2]?.group).toBe("Ungrouped");
  });

  it("skips entries without a stream url and unknown directives", () => {
    expect(channels).toHaveLength(3);
  });

  it("assigns unique ids", () => {
    expect(new Set(channels.map((c) => c.id)).size).toBe(3);
  });
});

describe("groupBy", () => {
  it("orders groups by size", () => {
    const grouped = groupBy(parseM3U(SAMPLE));
    expect(grouped.map(([name]) => name)).toEqual(["News", "Sports", "Ungrouped"]);
  });
});
