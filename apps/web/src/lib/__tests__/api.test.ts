import { LOCALE_HEADER } from "@helpo/shared";
import { ApiError, api, errorMessage, getApiLocale, getRequestStats, resetRequestStats, setApiLocale } from "../api";

function respond(status: number, body?: unknown, contentType = "application/problem+json") {
  global.fetch = jest.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": contentType } })) as unknown as typeof fetch;
}

describe("api client", () => {
  afterEach(() => setApiLocale("en"));

  it("maps problem+json to a typed ApiError", async () => {
    respond(422, { type: "about:blank", title: "Unprocessable", status: 422, detail: "Too many pages", errors: [{ path: "pageRange", message: "Required" }] });
    const error = await api("/lessons", { method: "POST", body: {} }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.detail).toBe("Too many pages");
    expect(error.fieldErrors).toEqual([{ path: "pageRange", message: "Required" }]);
  });

  it("keeps extra members such as existingLessonId on a duplicate upload", async () => {
    respond(409, { title: "Duplicate", status: 409, existingLessonId: "l9" });
    const error = (await api("/lessons", { method: "POST", body: {} }).catch((e) => e)) as ApiError;
    expect(error.status).toBe(409);
    expect(error.extra.existingLessonId).toBe("l9");
  });

  it("flags 401 and 404", async () => {
    respond(401, { title: "Unauthorized", status: 401 });
    expect(((await api("/me").catch((e) => e)) as ApiError).isUnauthorized).toBe(true);
    respond(404, { title: "Not found", status: 404 });
    expect(((await api("/me").catch((e) => e)) as ApiError).isNotFound).toBe(true);
  });

  it("turns a network failure into status 0", async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError("failed");
    }) as unknown as typeof fetch;
    const error = (await api("/me").catch((e) => e)) as ApiError;
    expect(error.isNetwork).toBe(true);
    expect(errorMessage(error)).toMatch(/can't reach/i);
  });

  it("returns undefined for 204 and parses JSON otherwise", async () => {
    respond(204);
    await expect(api("/x", { method: "DELETE" })).resolves.toBeUndefined();
    respond(200, { ok: true }, "application/json");
    await expect(api<{ ok: boolean }>("/x")).resolves.toEqual({ ok: true });
  });

  it("sends the x-helpo-locale header on every call", async () => {
    respond(200, {}, "application/json");
    setApiLocale("ar");
    await api("/me");
    const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)[LOCALE_HEADER]).toBe("ar");
    expect(getApiLocale()).toBe("ar");
  });

  it("builds query strings and skips empty values", async () => {
    respond(200, [], "application/json");
    await api("/join/schools/riverside/classes", { query: { grade: 6, empty: "" } });
    expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toBe("/api/join/schools/riverside/classes?grade=6");
  });

  it("translates friendly messages by locale", () => {
    setApiLocale("ar");
    expect(errorMessage(new ApiError({ status: 404, title: "Not found" }))).toBe("لم نجد ما تبحث عنه.");
  });
});

describe("request counter", () => {
  beforeEach(() => resetRequestStats());

  it("counts every call by path (query string excluded) and logs method and time", async () => {
    respond(200, { ok: true }, "application/json");
    await api("/lessons", { query: { classId: "c1" } });
    await api("/lessons");
    await api("/lessons", { method: "POST", body: {} });
    await api("/me");
    const stats = getRequestStats();
    expect(stats.total).toBe(4);
    expect(stats.byPath).toEqual({ "/lessons": 3, "/me": 1 });
    expect(stats.log.map((l) => l.method)).toEqual(["GET", "GET", "POST", "GET"]);
    expect(stats.log[0]).toEqual({ t: expect.any(Number), method: "GET", path: "/lessons" });
  });

  it("counts failed calls too, exposes itself on window and resets", async () => {
    respond(500, { title: "x", status: 500 });
    await api("/me").catch(() => undefined);
    expect(window.__nibrasRequests).toBe(getRequestStats());
    expect(window.__nibrasRequests?.total).toBe(1);
    window.__nibrasRequests?.reset();
    expect(getRequestStats()).toMatchObject({ total: 0, byPath: {}, log: [] });
  });
});
