import fs from "node:fs";
import path from "node:path";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError, errorMessage, setApiLocale } from "@/lib/api";
import { DemoPicker } from "@/components/public/demo-picker";
import { AuthForm } from "@/components/public/auth-form";
import { PublicShell } from "@/components/public/public-shell";
import { PlayFrame } from "@/components/student/frame";
import { AdminView, queuesUrl } from "@/components/teacher/admin-view";
import { TeacherShell } from "@/components/teacher/shell";
import { Whiteboard } from "@/components/teacher/whiteboard";
import { authMock } from "@/test/better-auth-react";
import { mockFetch, renderWithProviders } from "@/test/utils";
import en from "../../../messages/en.json";
import ar from "../../../messages/ar.json";

const replace = jest.fn();
const refresh = jest.fn();
let pathname = "/app";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: replace, replace, refresh }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(""),
}));
let cookieValue: string | undefined;
jest.mock("next/headers", () => ({ cookies: async () => ({ get: () => (cookieValue ? { value: cookieValue } : undefined) }) }));
jest.setTimeout(60000);

const realMatchMedia = window.matchMedia;
function viewport(desktop: boolean, wide = true) {
  window.matchMedia = ((q: string) => ({
    ...realMatchMedia(q),
    matches: q.includes("min-width: 1024px") ? desktop : q.includes("max-width: 1279px") ? !wide : false,
  })) as typeof window.matchMedia;
}

beforeEach(() => {
  replace.mockReset();
  refresh.mockReset();
  pathname = "/app";
  cookieValue = undefined;
  window.localStorage.clear();
  authMock.signOut.mockReset().mockResolvedValue({ data: {}, error: null });
  viewport(true);
});
afterEach(() => {
  window.matchMedia = realMatchMedia;
  setApiLocale("en");
});

const accounts = [
  { key: "teacher", label: "Teacher", labelAr: "معلّم", description: "Make lessons", descriptionAr: "أنشئ دروسًا", email: "teacher@demo.nibras.app", next: "/app" },
  { key: "student", label: "Student", labelAr: "طالب", description: "Play a quiz", descriptionAr: "العب اختبارًا", email: null, next: "/join?code=202020" },
  { key: "admin", label: "Admin", labelAr: "مدير", description: "See the platform", descriptionAr: "شاهد المنصة", email: "admin@demo.nibras.app", next: "/admin" },
];

describe("DemoPicker", () => {
  it("renders nothing when the API has no demo accounts (404)", async () => {
    const { fn } = mockFetch({});
    renderWithProviders(<DemoPicker />);
    await waitFor(() => expect(fn).toHaveBeenCalled());
    expect(screen.queryByText("Try Nibras with a demo account")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("signs in with one click, shows the loading state, and goes to next", async () => {
    const { calls } = mockFetch({ "GET /demo/accounts": () => ({ body: accounts }), "POST /demo/login": () => ({ body: { account: "student", next: "/join?code=202020" } }) });
    renderWithProviders(<DemoPicker />);
    expect(await screen.findByText("Try Nibras with a demo account")).toBeInTheDocument();
    expect(screen.getByText("Nibras2020@")).toBeInTheDocument();
    expect(screen.getByText(/teacher@demo.nibras.app/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Student/ }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/join?code=202020"));
    expect(calls.find((c) => c.path === "/demo/login")?.body).toEqual({ account: "student" });
    expect(refresh).toHaveBeenCalled();
  });

  it("shows a gentle error when the login fails and lets the visitor retry", async () => {
    mockFetch({ "GET /demo/accounts": () => ({ body: accounts }), "POST /demo/login": () => ({ status: 500, body: { title: "x", status: 500 } }) });
    renderWithProviders(<DemoPicker />);
    await userEvent.click(await screen.findByRole("button", { name: /Teacher/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That didn't work. Try again.");
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Teacher/ })).not.toHaveAttribute("aria-busy", "true");
  });

  it("uses the Arabic labels in the Arabic UI and sits above the sign-in form", async () => {
    mockFetch({ "GET /demo/accounts": () => ({ body: accounts }) });
    renderWithProviders(<AuthForm mode="login" />, { locale: "ar" });
    expect(await screen.findByText("جرّب نبراس بحساب تجريبي")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /معلّم/ })).toBeInTheDocument();
  });
});

const overview = {
  totals: { schools: 1, teachers: 2, classes: 3, students: 4, lessons: 5, sessions: 6, answers: 7 },
  lessonsByStatus: { READY: 4, FAILED: 1 },
  ai: { resources: 9, tokensIn: 1200, tokensOut: 3400, byModel: [{ model: "claude-x", resources: 9, tokensIn: 1200, tokensOut: 3400 }] },
  recentLessons: [{ id: "l1", title: "Fractions", teacherName: "Alex", status: "READY", createdAt: "2026-11-20T10:00:00.000Z" }],
  recentSessions: [{ id: "s1", type: "LIVE", joinCode: "202020", status: "CLOSED", joined: 3, createdAt: "2026-11-20T10:00:00.000Z" }],
  runtime: { queueDriver: "bullmq", realtime: "socket.io", aiMode: "claude", demoLogin: true },
};
const baseMe = { id: "u1", name: "Alex Green", email: "a@b.c", school: { id: "s", name: "Riverside", slug: "riverside" } };

describe("Admin", () => {
  it("renders the overview for an admin and links the queues only for bullmq", async () => {
    process.env.NEXT_PUBLIC_API_WS_URL = "http://api.test";
    mockFetch({ "GET /me": () => ({ body: { ...baseMe, role: "ADMIN" } }), "GET /admin/overview": () => ({ body: overview }), "GET /classes": () => ({ body: [] }) });
    renderWithProviders(<AdminView />, { scope: "teacher" });
    expect(await screen.findByText("Fractions")).toBeInTheDocument();
    expect(screen.getByText("claude-x")).toBeInTheDocument();
    expect(screen.getByText("202020")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open queues/ })).toHaveAttribute("href", expect.stringContaining("/admin/queues"));
  });

  it("builds the queue link only for the bullmq driver", () => {
    expect(queuesUrl(overview as never, "http://api.test")).toBe("http://api.test/admin/queues");
    expect(queuesUrl({ ...overview, runtime: { ...overview.runtime, queueDriver: "memory" } } as never, "http://api.test")).toBeNull();
  });

  it("sends a non-admin back to the app", async () => {
    const { calls } = mockFetch({ "GET /me": () => ({ body: { ...baseMe, role: "TEACHER" } }), "GET /admin/overview": () => ({ body: overview }) });
    renderWithProviders(<AdminView />, { scope: "teacher" });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app"));
    expect(calls.some((c) => c.path === "/admin/overview")).toBe(false);
  });
});

describe("Side menu and logo", () => {
  const routes = (role: string) => ({ "GET /me": () => ({ body: { ...baseMe, role } }), "GET /classes": () => ({ body: [] }), "GET /lessons": () => ({ body: [] }) });

  it("the avatar menu shows Admin only for admins", async () => {
    mockFetch(routes("ADMIN"));
    const { unmount } = renderWithProviders(<TeacherShell><p>x</p></TeacherShell>, { scope: "teacher" });
    await userEvent.click(await screen.findByRole("button", { name: "AG account menu" }));
    expect(screen.getAllByRole("link", { name: "Admin" }).length).toBeGreaterThan(1);
    unmount();
    mockFetch(routes("TEACHER"));
    renderWithProviders(<TeacherShell><p>x</p></TeacherShell>, { scope: "teacher" });
    await userEvent.click(await screen.findByRole("button", { name: "AG account menu" }));
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
  });

  it("the logo goes home: /app for teachers, / when signed out, /join for students, in both languages", async () => {
    mockFetch(routes("TEACHER"));
    const teacher = renderWithProviders(<TeacherShell><p>x</p></TeacherShell>, { scope: "teacher" });
    expect(screen.getByRole("link", { name: "Nibras home" })).toHaveAttribute("href", "/app");
    teacher.unmount();
    const pub = renderWithProviders(<PublicShell><p>x</p></PublicShell>);
    expect(screen.getByRole("link", { name: "Nibras home" })).toHaveAttribute("href", "/");
    pub.unmount();
    mockFetch({});
    const student = renderWithProviders(<PlayFrame><p>x</p></PlayFrame>, { scope: "student" });
    expect(screen.getByRole("link", { name: "Nibras home" })).toHaveAttribute("href", "/join");
    student.unmount();
    renderWithProviders(<PublicShell><p>x</p></PublicShell>, { locale: "ar" });
    expect(screen.getByRole("link", { name: "الصفحة الرئيسية لنبراس" })).toHaveAttribute("href", "/");
  });

  it("the desktop rail toggles, remembers its state and marks the current page", async () => {
    mockFetch(routes("ADMIN"));
    renderWithProviders(<TeacherShell><p>x</p></TeacherShell>, { scope: "teacher" });
    const toggle = await screen.findByRole("button", { name: "Collapse the menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const create = screen.getAllByRole("link", { name: "Create" })[0];
    expect(create).toHaveAttribute("aria-current", "page");
    expect(await screen.findByRole("link", { name: "Admin", hidden: false })).not.toHaveAttribute("aria-current");
    await userEvent.click(toggle);
    expect(window.localStorage.getItem("helpo:rail")).toBe("collapsed");
    expect(screen.getByRole("button", { name: "Expand the menu" })).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(screen.getByRole("button", { name: "Expand the menu" }));
    expect(window.localStorage.getItem("helpo:rail")).toBe("expanded");
  });

  it("starts collapsed when the saved state says so, and opens My lessons and Classes from the rail", async () => {
    window.localStorage.setItem("helpo:rail", "collapsed");
    mockFetch(routes("TEACHER"));
    renderWithProviders(<TeacherShell><p>x</p></TeacherShell>, { scope: "teacher" });
    expect(await screen.findByRole("button", { name: "Expand the menu" })).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(screen.getByRole("button", { name: "My lessons" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("in Arabic the rail comes first in the DOM inside an RTL document, so it sits on the right", async () => {
    mockFetch(routes("TEACHER"));
    const { container } = renderWithProviders(<TeacherShell><p>x</p></TeacherShell>, { scope: "teacher", locale: "ar" });
    await screen.findByRole("button", { name: /اطوِ|القائمة/ });
    const body = container.querySelector(".app-body")!;
    expect(body.firstElementChild?.tagName).toBe("ASIDE");
    const css = fs.readFileSync(path.join(__dirname, "../../styles/app.css"), "utf8");
    expect(css).not.toMatch(/\.rail[^{]*\{[^}]*\b(left|right)\s*:/);
  });

  it("on a phone the menu is a drawer that closes with Escape and returns focus to the button", async () => {
    viewport(false);
    mockFetch(routes("TEACHER"));
    renderWithProviders(<TeacherShell><p>x</p></TeacherShell>, { scope: "teacher" });
    const button = await screen.findByRole("button", { name: "Open the menu" });
    expect(screen.queryByRole("complementary")).toBeNull();
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(button).toHaveFocus();
    await userEvent.click(button);
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(authMock.signOut).toHaveBeenCalled());
  });
});

describe("Specific error messages", () => {
  const err = (status: number, extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) => new ApiError({ title: "T", status, ...extra } as never, {});

  it("names the invalid fields for a 400", () => {
    const e = err(400, { errors: [{ path: "pageRange", message: "bad" }, { path: "items.0.className", message: "bad" }] } as never);
    expect(errorMessage(e)).toBe("Please check: page range, class name.");
  });

  it("explains 409, 413, 422 and generic 400 in plain words", () => {
    expect(errorMessage(err(409))).toMatch(/already exists/);
    expect(errorMessage(err(413))).toMatch(/20 MB/);
    expect(errorMessage(err(422))).toMatch(/page range/);
    expect(errorMessage(err(400))).toMatch(/Check what you entered/);
  });

  it("tells the visitor how long to wait on a 429", () => {
    const e = err(429);
    e.retryAfter = 30;
    expect(errorMessage(e)).toBe("Too many tries. Try again in 30 seconds.");
    expect(errorMessage(err(429))).toMatch(/Wait a minute/);
  });

  it("reads Retry-After from the response and says when the device is offline", async () => {
    mockFetch({});
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ title: "Slow down", status: 429 }), { status: 429, headers: { "Retry-After": "12", "Content-Type": "application/json" } })) as never;
    const { api } = await import("@/lib/api");
    await expect(api("/x")).rejects.toMatchObject({ retryAfter: 12 });
    global.fetch = jest.fn(async () => { throw new TypeError("Failed to fetch"); }) as never;
    const online = jest.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    await expect(api("/x").catch((e) => errorMessage(e))).resolves.toMatch(/offline/);
    online.mockReturnValue(true);
    await expect(api("/x").catch((e) => errorMessage(e))).resolves.toMatch(/connection|reach/i);
    online.mockRestore();
  });

  it("speaks Arabic when the API locale is Arabic", () => {
    setApiLocale("ar");
    expect(errorMessage(err(413))).toMatch(/20/);
    expect(errorMessage(err(429))).toBe(ar["error.429"]);
  });
});

describe("Page titles and descriptions", () => {
  it("returns the title in the visitor's language from the locale cookie", async () => {
    const { pageMetadata, layoutMetadata } = await import("@/lib/meta");
    expect(await pageMetadata("meta.title.login")).toEqual({ title: "Teacher sign-in" });
    cookieValue = "ar";
    expect(await pageMetadata("meta.title.login")).toEqual({ title: ar["meta.title.login"] });
    const root = await layoutMetadata("meta.title.default", true);
    expect(root.description).toBe(ar["meta.description"]);
    expect(root.title).toEqual({ default: ar["meta.title.default"], template: "%s · Nibras" });
    cookieValue = "xx";
    expect((await layoutMetadata("meta.title.teacher")).description).toBeUndefined();
  });

  it("every route exports generateMetadata instead of a fixed English title", () => {
    const root = path.join(__dirname, "../../app");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (/^(page|layout)\.tsx$/.test(entry.name)) files.push(p);
      }
    };
    walk(root);
    for (const f of files) expect(fs.readFileSync(f, "utf8")).not.toMatch(/export const metadata/);
    expect(files.length).toBeGreaterThan(10);
  });
});

describe("Dictionaries", () => {
  it("English and Arabic have exactly the same keys and placeholders", () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect(vars(ar[k])).toBe(vars(en[k]));
  });
});

describe("Contrast and forced-colors support", () => {
  const css = fs.readFileSync(path.join(__dirname, "../../styles/app.css"), "utf8");
  it("has forced-colors and prefers-contrast rules for borders, focus, selection and the whiteboard", () => {
    expect(css).toMatch(/@media \(forced-colors: active\)/);
    expect(css).toMatch(/@media \(prefers-contrast: more\)/);
    const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(forced).toMatch(/outline: 3px solid Highlight/);
    expect(forced).toMatch(/\.board-tools \.tool/);
    expect(forced).toMatch(/forced-color-adjust: none/);
    expect(forced).toMatch(/aria-current="page"/);
  });
  it("gives status dots a glyph so colour is never the only signal", () => {
    expect(css).toMatch(/\.dot\.s-ready::before/);
    expect(css).toMatch(/\.dot\.s-failed::before/);
  });
  it("makes Explorer read-aloud buttons 64px", () => {
    expect(css).toMatch(/\[data-band="explorer"\] \.ra[^}]*min-height: 64px/s);
  });
});

describe("Sign-in and sign-up form", () => {
  it("shows required marks as text, autocomplete hints and a 44px show/hide password toggle", async () => {
    renderWithProviders(<AuthForm mode="signup" />);
    expect(screen.getAllByText("(required)")).toHaveLength(4);
    expect(document.getElementById("name")).toHaveAttribute("autocomplete", "name");
    expect(document.getElementById("school")).toHaveAttribute("autocomplete", "organization");
    expect(document.getElementById("email")).toHaveAttribute("autocomplete", "email");
    const pw = document.getElementById("password") as HTMLInputElement;
    expect(pw).toHaveAttribute("autocomplete", "new-password");
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(toggle);
    expect(pw.type).toBe("text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(pw.type).toBe("password");
  });

  it("never disables submit while idle and validates inline on submit", async () => {
    renderWithProviders(<AuthForm mode="login" />);
    const submit = screen.getByRole("button", { name: /Sign in/ });
    expect(submit).toBeEnabled();
    fireEvent.change(document.getElementById("email")!, { target: { value: "nope" } });
    fireEvent.change(document.getElementById("password")!, { target: { value: "short" } });
    await userEvent.click(submit);
    expect(screen.getByText("Enter an email like name@school.org.")).toBeInTheDocument();
    expect(screen.getByText("Use at least 8 characters.")).toBeInTheDocument();
    expect(document.getElementById("email")).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById("email")?.getAttribute("aria-describedby")).toContain("email-err");
    expect(document.getElementById("password")).toHaveAttribute("autocomplete", "current-password");
  });
});

describe("Whiteboard keyboard", () => {
  it("moves with arrow keys and resizes with Shift plus arrows, announcing each change", async () => {
    renderWithProviders(<Whiteboard lessonId="kb" onClose={jest.fn()} />);
    const bar = screen.getByRole("button", { name: /Arrow keys move it/ });
    expect(bar.tagName).toBe("BUTTON");
    const dlg = screen.getByRole("dialog", { name: "Whiteboard" });
    const status = () => screen.getAllByRole("status").map((n) => n.textContent).join(" ");
    dlg.getBoundingClientRect = () => ({ left: 100, top: 100, width: 400, height: 300, right: 500, bottom: 400, x: 100, y: 100, toJSON: () => ({}) });
    fireEvent.keyDown(bar, { key: "ArrowRight" });
    expect(status()).toContain("Moved to 116, 100");
    fireEvent.keyDown(bar, { key: "ArrowDown", shiftKey: true });
    expect(status()).toContain("Size 400 by 316");
    fireEvent.keyDown(bar, { key: "a" });
    expect(status()).toContain("Size 400 by 316");
  });
});

import { within } from "@testing-library/react";
void act;

describe("looksLikeEmail", () => {
  it("accepts normal addresses and rejects malformed ones without a backtracking regex", async () => {
    const { looksLikeEmail } = await import("../public/auth-form");
    expect(looksLikeEmail(" teacher@school.org ")).toBe(true);
    for (const bad of ["", "teacher", "@school.org", "a@b", "a@b.", "a@@b.org", "a b@c.org", "a@.org"]) expect(looksLikeEmail(bad)).toBe(false);
    expect(looksLikeEmail(`${"a".repeat(5000)}@${"b".repeat(5000)}`)).toBe(false);
  });
});
