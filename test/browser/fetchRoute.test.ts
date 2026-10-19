import { describe, expect, it, vi } from "vitest";
import { apiPath, interceptFetch } from "../../src/browser/fetchRoute";

const ORIGIN = "https://gaurabacharya.github.io";
const BASE = "/gale-petition-prep-demo/";

describe("apiPath", () => {
  it("finds API calls with or without the site's base path", () => {
    expect(apiPath("/cases", ORIGIN, BASE)).toBe("/cases");
    expect(apiPath("/cases/abc/letter?x=1", ORIGIN, BASE)).toBe("/cases/abc/letter?x=1");
    expect(apiPath(`${BASE}fields/abc`, ORIGIN, BASE)).toBe("/fields/abc");
    expect(apiPath("/status", ORIGIN, "/")).toBe("/status");
  });

  it("leaves other URLs alone", () => {
    expect(apiPath(`${BASE}samples/degree.pdf`, ORIGIN, BASE)).toBeUndefined();
    expect(apiPath("/casesx", ORIGIN, BASE)).toBeUndefined();
    expect(apiPath("https://example.com/cases", ORIGIN, BASE)).toBeUndefined();
  });
});

describe("interceptFetch", () => {
  it("answers API calls in the page and sends everything else to the network", async () => {
    const real = vi.fn(async () => new Response("network"));
    const handle = vi.fn(async (r: Request) => new Response(`app ${new URL(r.url).pathname} ${r.method} ${await r.text()}`));
    const f = interceptFetch(real as unknown as typeof fetch, handle, ORIGIN, BASE);

    const res = await f("/fields/1", { method: "PATCH", body: '{"status":"approved"}' });
    expect(await res.text()).toBe('app /fields/1 PATCH {"status":"approved"}');
    expect(await (await f(`${BASE}samples/passport.png`)).text()).toBe("network");
    expect(real).toHaveBeenCalledTimes(1);
  });
});
