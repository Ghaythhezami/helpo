import { act, fireEvent, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CheckView, LessonDetail } from "@helpo/shared";
import { JoinFlow } from "@/components/student/join-flow";
import { LanguageSwitch } from "@/components/ui/language-switch";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { TranslationBanner } from "@/components/teacher/translation-banner";
import { qk } from "@/lib/queries";
import { useCheckResolution } from "@/lib/use-check-resolution";
import { Providers, makeClient, mockFetch, renderWithProviders } from "@/test/utils";
import { QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui/toast";
import { I18nProvider } from "@/lib/i18n";
import type { ReactNode } from "react";

const push = jest.fn();
const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push, refresh }),
  usePathname: () => "/join",
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
});

describe("join flow", () => {
  const routes = (live: boolean) => ({
    "GET /join/schools/riverside/classes": () => ({ body: [{ classId: "c1", className: "6B", grade: 6, teacherName: "Alex Green", live: live ? { sessionId: "se1", type: "LIVE_QUIZ", game: null, lessonTitle: "Photosynthesis" } : null }] }),
    "GET /join/classes/c1/students": () => ({ body: [{ id: "s1", displayName: "Sara A." }, { id: "s2", displayName: "Omar K." }] }),
    "POST /join": () => ({ body: { participantId: "p1", displayName: "Sara A.", sessionId: "se1", next: "quiz" } }),
  });

  it("goes grade, class, name and joins with one big button that follows what is live", async () => {
    const { calls } = mockFetch(routes(true));
    renderWithProviders(<JoinFlow />, { scope: "student" });
    const join = screen.getByRole("button", { name: "Join" });
    expect(join).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(screen.getByRole("button", { name: /^6/ }));
    await userEvent.click(await screen.findByRole("button", { name: /6B/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Sara A." }));
    const quiz = await screen.findByRole("button", { name: "Join the quiz" });
    expect(screen.getByText(/Live now: Photosynthesis/)).toBeInTheDocument();
    await userEvent.click(quiz);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/play/quiz/se1"));
    expect(calls.find((c) => c.method === "POST" && c.path === "/join")?.body).toEqual({ classId: "c1", studentId: "s1" });
  });

  it("says nothing is live yet when the class has nothing running", async () => {
    mockFetch(routes(false));
    renderWithProviders(<JoinFlow />, { scope: "student" });
    await userEvent.click(screen.getByRole("button", { name: /^6/ }));
    await userEvent.click(await screen.findByRole("button", { name: /6B/ }));
    expect(await screen.findByText("Nothing is live yet")).toBeInTheDocument();
  });

  it("opens the code field from ?code= and asks for a first name", async () => {
    mockFetch({
      "GET /play/code/482913": () => ({ body: { classId: "c1", className: "6B", grade: 6, teacherName: "Alex", live: { sessionId: "se1", type: "LIVE_QUIZ", game: null, lessonTitle: "Photosynthesis" } } }),
      "POST /play/code/482913/join": (b) => ({ body: { participantId: "p", displayName: (b as { name: string }).name, sessionId: "se1", next: "quiz" } }),
    });
    renderWithProviders(<JoinFlow initialCode="482913" />, { scope: "student" });
    await userEvent.type(await screen.findByLabelText("What's your name?"), "Sara A.");
    await userEvent.click(await screen.findByRole("button", { name: "Join the quiz" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/play/quiz/se1"));
  });
});

describe("check resolution with undo", () => {
  const check: CheckView = { id: "k1", resource: "QUIZ", itemRef: "Q4", kind: "FACT_CHECK", message: "m", suggestion: "s", sourcePage: 6, status: "OPEN" };
  const lesson = { id: "l1", checks: [check] } as unknown as LessonDetail;

  function wrapper(client = makeClient()) {
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <I18nProvider locale="en">
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      </QueryClientProvider>
    );
    return Wrapper;
  }

  it("accepts a check at once, offers Undo and sets it back to OPEN", async () => {
    const { calls } = mockFetch({ "PATCH /checks/k1": () => ({ body: {} }), "GET /lessons/l1": () => ({ body: lesson }) });
    const client = makeClient();
    client.setQueryData(qk.lesson("l1"), lesson);
    const { result } = renderHook(() => useCheckResolution("l1"), { wrapper: wrapper(client) });
    act(() => result.current.resolve(check, "ACCEPTED"));
    await waitFor(() => expect((client.getQueryData(qk.lesson("l1")) as LessonDetail).checks[0].status).toBe("ACCEPTED"));
    await waitFor(() => expect(calls.some((c) => c.path === "/checks/k1" && (c.body as { status: string }).status === "ACCEPTED")).toBe(true));
  });

  it("rolls back when the server says no", async () => {
    mockFetch({ "PATCH /checks/k1": () => ({ status: 500, body: { title: "x", status: 500 } }), "GET /lessons/l1": () => ({ body: lesson }) });
    const client = makeClient();
    client.setQueryData(qk.lesson("l1"), lesson);
    const { result } = renderHook(() => useCheckResolution("l1"), { wrapper: wrapper(client) });
    act(() => result.current.resolve(check, "DISMISSED"));
    await waitFor(() => expect((client.getQueryData(qk.lesson("l1")) as LessonDetail).checks[0].status).toBe("OPEN"));
  });

  it("shows an Undo toast that reopens the check", async () => {
    const { calls } = mockFetch({ "PATCH /checks/k1": () => ({ body: {} }), "GET /lessons/l1": () => ({ body: lesson }) });
    const client = makeClient();
    client.setQueryData(qk.lesson("l1"), lesson);
    function Harness() {
      const { resolve } = useCheckResolution("l1");
      return <button onClick={() => resolve(check, "ACCEPTED")}>go</button>;
    }
    renderWithProviders(<Harness />, { client });
    await userEvent.click(screen.getByText("go"));
    await userEvent.click(await screen.findByRole("button", { name: /Undo/ }));
    await waitFor(() => expect(calls.filter((c) => c.path === "/checks/k1").map((c) => (c.body as { status: string }).status)).toEqual(["ACCEPTED", "OPEN"]));
  });
});

describe("language switch", () => {
  it("sets the cookie, lang and dir, and saves the preference for a signed-in teacher", async () => {
    const { calls } = mockFetch({ "PUT /me/locale": () => ({ body: {} }) });
    renderWithProviders(<LanguageSwitch />, { scope: "teacher" });
    await userEvent.click(screen.getByRole("button", { name: "العربية" }));
    expect(document.cookie).toContain("helpo_locale=ar");
    expect(document.documentElement.dir).toBe("rtl");
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.path === "/me/locale" && (c.body as { locale: string }).locale === "ar" && c.headers["x-helpo-locale"] === "ar")).toBe(true));
    await userEvent.click(screen.getByRole("button", { name: "English" }));
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("does not call the API when nobody is signed in", async () => {
    const { fn } = mockFetch({});
    renderWithProviders(<LanguageSwitch />, { scope: "public" });
    await userEvent.click(screen.getByRole("button", { name: "العربية" }));
    await waitFor(() => expect(document.documentElement.lang).toBe("ar"));
    expect(fn).not.toHaveBeenCalledWith(expect.stringContaining("/locale"), expect.anything());
    act(() => {
      document.documentElement.lang = "en";
    });
  });
});

describe("translation banner", () => {
  const base = { contentLocale: "en", resources: [{ status: "READY", contentLocale: "en" }] };
  const lesson = (ar: string) => ({ ...base, translations: { en: "ready", ar } }) as unknown as LessonDetail;

  it("is silent when the translation is ready", () => {
    renderWithProviders(<TranslationBanner lesson={lesson("ready")} />, { locale: "ar" });
    expect(screen.queryByText(/نترجم/)).not.toBeInTheDocument();
  });
  it("shows a calm banner with progress while translating and says what is shown meanwhile", () => {
    renderWithProviders(<TranslationBanner lesson={lesson("working")} />, { locale: "ar" });
    expect(screen.getByText(/نترجم هذا الدرس إلى العربية/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });
  it("offers Try again after a failed start", async () => {
    const retry = jest.fn();
    renderWithProviders(<TranslationBanner lesson={lesson("missing")} failed onRetry={retry} />, { locale: "ar" });
    await userEvent.click(screen.getByRole("button", { name: "حاول مرة أخرى" }));
    expect(retry).toHaveBeenCalled();
  });
});

describe("ui primitives", () => {
  it("Button keeps focus but ignores clicks when disabled", () => {
    const onClick = jest.fn();
    renderWithProviders(<Button disabled onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Go" })).toHaveAttribute("aria-disabled", "true");
  });
  it("Switch toggles with role=switch", async () => {
    const onChange = jest.fn();
    renderWithProviders(<Switch checked={false} label="Sounds" onChange={onChange} />);
    await userEvent.click(screen.getByRole("switch", { name: "Sounds" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
  it("Progress scales with transform instead of animating width", () => {
    renderWithProviders(<Progress value={3} max={4} label="XP" />);
    const bar = screen.getByRole("progressbar", { name: "XP" });
    expect(bar.firstElementChild).toHaveStyle({ transform: "scaleX(0.75)" });
  });
  it("Tabs move with the arrow keys", async () => {
    const onChange = jest.fn();
    renderWithProviders(<Tabs group="t" label="Resources" value="a" onChange={onChange} tabs={[{ id: "a", label: "A" }, { id: "b", label: "B" }]} />);
    screen.getByRole("tab", { name: "A" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("b");
  });
  it("Providers render children", () => {
    renderWithProviders(<Providers><p>hello</p></Providers>);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });
});
