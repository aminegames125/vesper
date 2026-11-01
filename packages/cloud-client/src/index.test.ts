import { describe, expect, it } from "vitest";
import {
  CloudClient,
  CloudError,
  formatBytes,
  formatDuration,
  formatUntil,
  normalizeBase,
} from "./index";

describe("normalizeBase", () => {
  it("adds a scheme and drops trailing slashes", () => {
    expect(normalizeBase("192.168.1.5:8484/")).toBe("http://192.168.1.5:8484");
    expect(normalizeBase("https://tv.example.com//")).toBe("https://tv.example.com");
    expect(normalizeBase("  ")).toBe("");
  });
});

describe("formatters", () => {
  it("formats bytes and durations", () => {
    expect(formatBytes(1536)).toBe("2 KB");
    expect(formatBytes(5 * 1024 ** 3)).toBe("5.00 GB");
    expect(formatDuration(3725)).toBe("1h 2m");
    expect(formatDuration(75)).toBe("1m 15s");
  });
  it("describes retention", () => {
    expect(formatUntil(1000 + 7200, 1000)).toBe("2h");
    expect(formatUntil(500, 1000)).toBe("now");
  });
});

describe("CloudClient", () => {
  it("sends the token and surfaces server errors", async () => {
    const seen: { url: string; auth: string | null }[] = [];
    const fake: typeof fetch = async (input, init) => {
      seen.push({ url: String(input), auth: new Headers(init?.headers).get("authorization") });
      return new Response(JSON.stringify({ error: "Nope." }), { status: 403 });
    };
    const client = new CloudClient({ baseUrl: "10.0.0.2:8484", token: "abc", fetch: fake });
    await expect(client.me()).rejects.toMatchObject({ message: "Nope.", status: 403 });
    expect(seen[0]).toEqual({ url: "http://10.0.0.2:8484/api/v1/auth/me", auth: "Bearer abc" });
    await expect(client.me()).rejects.toBeInstanceOf(CloudError);
  });

  it("builds media urls with the token", () => {
    const client = new CloudClient({ baseUrl: "http://s", token: "t" });
    expect(client.playlistUrl("r1")).toBe("http://s/api/v1/recordings/r1/index.m3u8?token=t");
  });
});
