import { describe, expect, it } from "vitest";
import { decodeEpgText, nowNext, toProgramme } from "./epg";
import { catchupUrl, episodeUrl, liveUrl, movieUrl, normalizeHost } from "./xtream";

const auth = { host: "tv.example.com:8080/", username: "u", password: "p" };

describe("xtream links", () => {
  it("adds a scheme and strips trailing slashes", () => {
    expect(normalizeHost(" tv.example.com:8080/ ")).toBe("http://tv.example.com:8080");
    expect(normalizeHost("https://x.test//")).toBe("https://x.test");
  });

  it("builds live, movie and episode links", () => {
    expect(liveUrl(auth, 12)).toBe("http://tv.example.com:8080/live/u/p/12.m3u8");
    expect(movieUrl(auth, 7, "mkv")).toBe("http://tv.example.com:8080/movie/u/p/7.mkv");
    expect(episodeUrl(auth, "99", "mp4")).toBe("http://tv.example.com:8080/series/u/p/99.mp4");
  });

  it("builds a catch-up link from the provider's own start time", () => {
    expect(catchupUrl(auth, 12, "2026-03-20 18:00:00", 3300)).toBe(
      "http://tv.example.com:8080/timeshift/u/p/55/2026-03-20:18-00/12.m3u8",
    );
  });
});

describe("guide helpers", () => {
  it("decodes base64 UTF-8 and leaves plain text alone", () => {
    const encoded = btoa(String.fromCharCode(...new TextEncoder().encode("Café du soir")));
    expect(decodeEpgText(encoded)).toBe("Café du soir");
    expect(decodeEpgText("Plain title!")).toBe("Plain title!");
    expect(decodeEpgText(undefined)).toBe("");
  });

  it("normalises a raw programme, accepting stop or end timestamps", () => {
    const p = toProgramme({
      id: 5,
      title: btoa("News"),
      start: "2026-03-20 18:00:00",
      start_timestamp: "100",
      stop_timestamp: "200",
      has_archive: 1,
    });
    expect(p).toMatchObject({ title: "News", start: 100, end: 200, hasArchive: true });
  });

  it("finds now, next and progress", () => {
    const list = [
      toProgramme({ id: 1, start_timestamp: 0, end_timestamp: 100 }),
      toProgramme({ id: 2, start_timestamp: 100, end_timestamp: 200 }),
      toProgramme({ id: 3, start_timestamp: 200, end_timestamp: 300 }),
    ];
    const { now, next, progress } = nowNext(list, 150);
    expect(now?.id).toBe("2");
    expect(next?.id).toBe("3");
    expect(progress).toBe(0.5);
  });
});
