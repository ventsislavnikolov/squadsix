import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCoords } from "./geo";

const fetchMock = vi.fn<typeof fetch>();

function redirect(location: string | null, status = 302) {
  const headers = new Headers(location ? { location } : {});
  return Promise.resolve(new Response(null, { status, headers }));
}

/** Each test uses its own link: the module remembers every link it resolved. */
let n = 0;
const short = () => {
  n += 1;
  return `https://maps.app.goo.gl/link${n}`;
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveCoords", () => {
  it("has nothing for no link", async () => {
    expect(await resolveCoords(null)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads a full link without fetching", async () => {
    expect(
      await resolveCoords("https://www.google.com/maps/@42.6977,23.3219,15z")
    ).toEqual({ lat: 42.6977, lng: 23.3219 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("follows a short link to the coordinates, and remembers them", async () => {
    const link = short();
    fetchMock
      .mockReturnValueOnce(redirect("https://www.google.com/maps/place/Arena"))
      .mockReturnValueOnce(
        redirect("/maps/place/Arena/data=!3d42.65!4d23.35", 301)
      );
    const coords = { lat: 42.65, lng: 23.35 };
    expect(await resolveCoords(link)).toEqual(coords);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(link);
    expect(init?.redirect).toBe("manual");

    expect(await resolveCoords(link)).toEqual(coords);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up on a link that ends without a redirect", async () => {
    const link = short();
    fetchMock.mockReturnValueOnce(redirect(null, 200));
    expect(await resolveCoords(link)).toBeNull();
    // Remembered as unreadable too.
    expect(await resolveCoords(link)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops at a redirect without a location, or after five hops", async () => {
    fetchMock.mockReturnValueOnce(redirect(null));
    expect(await resolveCoords(short())).toBeNull();

    fetchMock.mockImplementation(() =>
      redirect("https://www.google.com/maps/place/Nowhere")
    );
    expect(await resolveCoords(short())).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("only ever fetches Google's own map hosts", async () => {
    expect(await resolveCoords("https://example.com/maps/x")).toBeNull();
    expect(await resolveCoords("http://maps.app.goo.gl/plain-http")).toBeNull();
    expect(await resolveCoords("https://goo.gl/not-a-map")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockReturnValueOnce(redirect("https://evil.example/@1.5,2.5"));
    expect(await resolveCoords("https://goo.gl/maps/abc")).toEqual({
      lat: 1.5,
      lng: 2.5,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a failed fetch or a bad link as no coordinates", async () => {
    fetchMock.mockRejectedValueOnce(new Error("timeout"));
    expect(await resolveCoords(short())).toBeNull();
    expect(await resolveCoords("not a url")).toBeNull();
  });
});
