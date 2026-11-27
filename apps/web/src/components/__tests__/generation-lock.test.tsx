import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TeacherShell } from "@/components/teacher/shell";
import { GEN_LOCK_KEY, isLockedStatus, lockGeneration, relockCandidate, unlockGeneration } from "@/lib/generation-lock";
import { authMock } from "@/test/better-auth-react";
import { lesson, summaries } from "@/test/fixtures";
import { mockFetch, renderWithProviders } from "@/test/utils";

const replace = jest.fn();
let pathname = "/app";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: replace, replace, refresh: jest.fn() }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(""),
}));
jest.setTimeout(30000);

const me = { id: "u1", name: "Alex Green", email: "a@b.c", role: "TEACHER", school: { id: "s", name: "Riverside", slug: "riverside" } };
const generating = () => lesson({ status: "GENERATING", checks: [], resources: [] });
const routes = (extra: Record<string, () => { status?: number; body?: unknown }> = {}) => ({
  "GET /me": () => ({ body: me }),
  "GET /classes": () => ({ body: [] }),
  "GET /lessons": () => ({ body: [] }),
  "GET /lessons/l1": () => ({ body: generating() }),
  ...extra,
});

beforeEach(() => {
  replace.mockReset();
  pathname = "/app";
  window.localStorage.clear();
  authMock.signOut.mockReset().mockResolvedValue({ data: {}, error: null });
});

describe("generation lock store", () => {
  it("locks, unlocks and knows the busy statuses", () => {
    lockGeneration("l1");
    expect(window.localStorage.getItem(GEN_LOCK_KEY)).toBe("l1");
    unlockGeneration();
    expect(window.localStorage.getItem(GEN_LOCK_KEY)).toBeNull();
    expect(["UPLOADED", "EXTRACTING", "ANALYZING", "ANALYZED", "GENERATING"].every(isLockedStatus)).toBe(true);
    expect(["READY", "PARTIAL", "FAILED"].some(isLockedStatus)).toBe(false);
  });

  it("re-locks only a recent, busy lesson (never an old one or one waiting at ANALYZED)", () => {
    const now = Date.parse("2026-11-27T12:00:00Z");
    const recent = new Date(now - 60_000).toISOString();
    const old = new Date(now - 3 * 3600_000).toISOString();
    expect(relockCandidate([{ id: "a", status: "GENERATING", createdAt: recent }], now)).toBe("a");
    expect(relockCandidate([{ id: "a", status: "GENERATING", createdAt: old }], now)).toBeNull();
    expect(relockCandidate([{ id: "a", status: "ANALYZED", createdAt: recent }], now)).toBeNull();
    expect(relockCandidate(undefined, now)).toBeNull();
  });
});

describe("shell while a kit is generating", () => {
  it("makes the rest of the app inert, trapping nav, menu, logo and tabs behind the generation view", async () => {
    window.localStorage.setItem(GEN_LOCK_KEY, "l1");
    pathname = "/app/lessons/l1";
    mockFetch(routes());
    const { container } = renderWithProviders(<TeacherShell><button>Slides tab</button></TeacherShell>, { scope: "teacher" });
    expect(await screen.findByRole("dialog", { name: /Making|lesson kit/ })).toBeInTheDocument();
    const inert = container.querySelector(".app-inert");
    expect(inert).toHaveAttribute("inert");
    expect(inert).toContainElement(screen.getByText("Slides tab"));
    expect(inert).toContainElement(screen.getByRole("link", { name: "Nibras home", hidden: true }));
    expect(inert?.contains(screen.getByRole("dialog"))).toBe(false);
  });

  it("sends a visit to any other page back to the generating lesson", async () => {
    window.localStorage.setItem(GEN_LOCK_KEY, "l1");
    pathname = "/app";
    mockFetch(routes());
    renderWithProviders(<TeacherShell><p>x</p></TeacherShell>, { scope: "teacher" });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/lessons/l1"));
  });

  it("re-locks after a refresh when the lessons list shows a recent lesson still being made", async () => {
    const busy = { ...summaries[0], id: "l1", status: "GENERATING", createdAt: new Date().toISOString() };
    mockFetch(routes({ "GET /lessons": () => ({ body: [busy] }) }));
    renderWithProviders(<TeacherShell><p>x</p></TeacherShell>, { scope: "teacher" });
    await waitFor(() => expect(window.localStorage.getItem(GEN_LOCK_KEY)).toBe("l1"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/lessons/l1"));
  });

  it("warns before the tab closes while locked, and not otherwise", async () => {
    window.localStorage.setItem(GEN_LOCK_KEY, "l1");
    mockFetch(routes());
    renderWithProviders(<TeacherShell><p>x</p></TeacherShell>, { scope: "teacher" });
    await screen.findByRole("dialog");
    const locked = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(locked);
    expect(locked.defaultPrevented).toBe(true);
    act(() => unlockGeneration());
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Making|lesson kit/ })).toBeNull());
    const free = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(free);
    expect(free.defaultPrevented).toBe(false);
  });

  it("Cancel goes back to Create and lifts the lock", async () => {
    window.localStorage.setItem(GEN_LOCK_KEY, "l1");
    pathname = "/app/lessons/l1";
    mockFetch(routes({ "POST /lessons/l1/cancel": () => ({ body: {} }) }));
    renderWithProviders(<TeacherShell><p>x</p></TeacherShell>, { scope: "teacher" });
    await userEvent.click(await screen.findByRole("button", { name: "Cancel generation" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, cancel" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app"));
    expect(window.localStorage.getItem(GEN_LOCK_KEY)).toBeNull();
  });

  it("lifts the lock and opens the workspace when the kit is READY", async () => {
    window.localStorage.setItem(GEN_LOCK_KEY, "l1");
    pathname = "/app/lessons/l1";
    mockFetch(routes({ "GET /lessons/l1": () => ({ body: lesson({ status: "READY" }) }) }));
    const { container } = renderWithProviders(<TeacherShell><p>x</p></TeacherShell>, { scope: "teacher" });
    await waitFor(() => expect(window.localStorage.getItem(GEN_LOCK_KEY)).toBeNull(), { timeout: 4000 });
    expect(replace).toHaveBeenCalledWith("/app/lessons/l1");
    await waitFor(() => expect(container.querySelector(".app-inert")).not.toHaveAttribute("inert"));
    expect(container.querySelector("main")).toHaveClass("gen-reveal");
  });
});
