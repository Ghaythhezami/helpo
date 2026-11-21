import fs from "node:fs";
import path from "node:path";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthForm } from "@/components/public/auth-form";
import { PlayFrame } from "@/components/student/frame";
import { JoinPage } from "@/components/student/join-page";
import { CreateScreen } from "@/components/teacher/create-screen";
import { Workspace } from "@/components/teacher/workspace";
import { InlineConfirm } from "@/components/ui/confirm";
import { Tabs } from "@/components/ui/tabs";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { authMock } from "@/test/better-auth-react";
import { lesson } from "@/test/fixtures";
import { mockFetch, renderWithProviders } from "@/test/utils";

const replace = jest.fn();
let search = "";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: replace, replace, refresh: jest.fn() }),
  usePathname: () => "/app",
  useSearchParams: () => new URLSearchParams(search),
}));
jest.setTimeout(60000);

const css = (file: string) => fs.readFileSync(path.join(__dirname, "../../", file), "utf8");

beforeEach(() => {
  replace.mockReset();
  search = "";
  authMock.signIn.email.mockReset().mockResolvedValue({ data: {}, error: null });
  authMock.signUp.email.mockReset().mockResolvedValue({ data: {}, error: null });
});

describe("UX audit: keyboard and RTL", () => {
  const tabs = [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }];

  it("Tabs: in Arabic (RTL) the left arrow moves forward and the right arrow back", () => {
    const onChange = jest.fn();
    renderWithProviders(<Tabs group="g" label="L" value="b" onChange={onChange} tabs={tabs} />, { locale: "ar" });
    const b = screen.getByRole("tab", { name: "B" });
    fireEvent.keyDown(b, { key: "ArrowLeft" });
    fireEvent.keyDown(b, { key: "ArrowRight" });
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(["c", "a"]);
  });

  it("Tabs: the hidden 'to check' text for a badge is translated", () => {
    renderWithProviders(<Tabs group="g" label="L" value="a" onChange={jest.fn()} tabs={[{ id: "a", label: "A", badge: 2 }]} />, { locale: "ar" });
    expect(screen.getByText("للمراجعة")).toBeInTheDocument();
    expect(screen.queryByText(/to check/)).not.toBeInTheDocument();
  });

  it("InlineConfirm: the group name is translated", () => {
    renderWithProviders(<InlineConfirm message="Sure?" confirmLabel="Yes" cancelLabel="No" onConfirm={jest.fn()} onCancel={jest.fn()} />, { locale: "ar" });
    expect(screen.getByRole("group", { name: "يرجى التأكيد" })).toBeInTheDocument();
  });

  it("AuthForm: the forward arrow flips in RTL via the shared .flip class", () => {
    const { container } = renderWithProviders(<AuthForm mode="login" />, { locale: "ar" });
    expect(container.querySelector("button svg")).toHaveClass("flip");
  });
});

describe("UX audit: forms and errors", () => {
  const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

  it("AuthForm: a failed sign-in marks the fields invalid and links them to the error text", async () => {
    authMock.signIn.email.mockResolvedValueOnce({ data: {}, error: { message: "raw english server text" } });
    renderWithProviders(<AuthForm mode="login" />);
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid");
    type("Email", "a@b.co");
    type("Password", "longenough1");
    await userEvent.click(screen.getByRole("button", { name: /Sign in/ }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That email and password don't match.");
    expect(alert).not.toHaveTextContent("raw english server text");
    for (const label of ["Email", "Password"]) {
      expect(screen.getByLabelText(label)).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByLabelText(label).getAttribute("aria-describedby")).toContain(alert.id);
    }
  });

  it("AuthForm: the sign-in error is Arabic in the Arabic UI", async () => {
    authMock.signIn.email.mockResolvedValueOnce({ data: {}, error: { message: "Invalid email or password" } });
    renderWithProviders(<AuthForm mode="login" />, { locale: "ar" });
    fireEvent.change(document.getElementById("email")!, { target: { value: "a@b.co" } });
    fireEvent.change(document.getElementById("password")!, { target: { value: "longenough1" } });
    await userEvent.click(screen.getByRole("button", { name: /دخول/ }));
    expect((await screen.findByRole("alert")).textContent).not.toMatch(/Invalid/);
  });

  it("AuthForm sign-up: names the missing fields and keeps the password hint described", async () => {
    renderWithProviders(<AuthForm mode="signup" />);
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-describedby", "password-hint");
    type("Email", "alex@riverside.org");
    type("Password", "longenough1");
    await userEvent.click(screen.getByRole("button", { name: /Create account/ }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Your name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("School name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid");
  });

  it("AuthForm sign-up: an existing account gets a plain instruction, anything else a generic line", async () => {
    authMock.signUp.email.mockResolvedValueOnce({ data: {}, error: { message: "User already exists", code: "USER_ALREADY_EXISTS" } });
    renderWithProviders(<AuthForm mode="signup" />);
    type("Your name", "Alex");
    type("School name", "Riverside");
    type("Email", "alex@riverside.org");
    type("Password", "longenough1");
    await userEvent.click(screen.getByRole("button", { name: /Create account/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("An account with that email already exists. Sign in instead.");
    authMock.signUp.email.mockResolvedValueOnce({ data: {}, error: { message: "boom" } });
    await userEvent.click(screen.getByRole("button", { name: /Create account/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("We couldn't create that account."));
  });

  it("Join: a code that matches nothing marks the code field invalid and points at the status message", async () => {
    search = "code=000000";
    mockFetch({ "GET /play/code/000000": () => ({ status: 404, body: { title: "Not found", status: 404 } }) });
    renderWithProviders(<JoinPage />, { scope: "student" });
    const input = await screen.findByLabelText(/code/i);
    await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "true"));
    const status = document.getElementById(input.getAttribute("aria-describedby")!);
    expect(status).toHaveTextContent("That code doesn't match anything live.");
  });
});

describe("UX audit: states", () => {
  it("Create: a failed class load is an error with Retry, not the empty 'no class' state", async () => {
    mockFetch({ "GET /classes": () => ({ status: 403, body: { title: "x", status: 403 } }), "GET /lessons": () => ({ body: [] }) });
    renderWithProviders(<CreateScreen />, { scope: "teacher" });
    expect(await screen.findByRole("alert")).toHaveTextContent("You don't have access to that.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create a class/i })).not.toBeInTheDocument();
  });

  it("Toast: a toast with Undo stays 8 seconds, a plain one 3.5", () => {
    jest.useFakeTimers();
    try {
      function Probe() {
        const toast = useToast();
        return (
          <>
            <button onClick={() => toast.show("Plain")}>plain</button>
            <button onClick={() => toast.show("Undoable", { undo: jest.fn() })}>undo</button>
          </>
        );
      }
      renderWithProviders(<ToastProvider><Probe /></ToastProvider>);
      fireEvent.click(screen.getByText("plain"));
      expect(screen.getAllByText("Plain").length).toBeGreaterThan(0);
      act(() => void jest.advanceTimersByTime(3600));
      expect(screen.queryByText("Plain")).not.toBeInTheDocument();
      fireEvent.click(screen.getByText("undo"));
      act(() => void jest.advanceTimersByTime(7500));
      expect(screen.getAllByText("Undoable").length).toBeGreaterThan(0);
      act(() => void jest.advanceTimersByTime(600));
      expect(screen.queryByText("Undoable")).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it("Workspace: the document title names the lesson", async () => {
    mockFetch({ "GET /lessons/l1": () => ({ body: lesson() }) });
    renderWithProviders(<Workspace id="l1" />, { scope: "teacher" });
    await waitFor(() => expect(document.title).toBe(`${lesson().title} · Nibras`));
  });
});

describe("UX audit: children (grades 2 to 5)", () => {
  it("PlayFrame: the frame takes the student's band, so Explorer targets apply on every play screen", async () => {
    mockFetch({ "GET /play/me": () => ({ body: { band: "EXPLORER", settings: {}, streak: { days: 0, saversLeft: 0, message: "" } } }) });
    renderWithProviders(<PlayFrame><p>game</p></PlayFrame>, { scope: "student" });
    expect(document.querySelector(".sapp")?.getAttribute("data-band")).toBe("navigator");
    await waitFor(() => expect(document.querySelector(".sapp")?.getAttribute("data-band")).toBe("explorer"));
  });
});

describe("UX audit: stylesheet guards", () => {
  it("globals.css has a catch-all prefers-reduced-motion block that stops animations and transitions", () => {
    const g = css("app/globals.css");
    const block = g.slice(g.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(block).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    expect(block).toMatch(/animation-iteration-count:\s*1\s*!important/);
  });

  it("the language switch is at least 44px tall in the app shell, and the mobile logo is 44px wide", () => {
    const a = css("styles/app.css");
    expect(a).toMatch(/\.app-shell \.langsw button\s*\{[^}]*min-height:\s*44px/);
    expect(a).toMatch(/\.app-head \.logo\s*\{[^}]*min-width:\s*44px/);
  });

  it("the sign-in / sign-up switch link has a 44px hit area (19px line + 2 x 14px padding)", () => {
    expect(css("styles/extras.css")).toMatch(/\.authalt a\s*\{[^}]*padding-block:\s*14px/);
  });

  it("the skip link keeps white text above the .tapp/.sapp link colour (2.1:1 before)", () => {
    expect(css("app/globals.css")).toMatch(/:root \.skip-link,\s*:root \.skip-link:hover\s*\{\s*color:\s*#fff/);
  });

  it("input borders use the 3:1 --field-line token, not the decorative --line", () => {
    expect(css("app/globals.css")).toMatch(/--field-line:\s*#8777c4/);
    expect(css("styles/teacher.css")).toMatch(/\.field select,\.field input,\.field textarea\{[^}]*border:2px solid var\(--field-line\)/);
    expect(css("styles/student.css")).toMatch(/\.codef input\{[^}]*var\(--field-line\)/);
  });

  it("Explorer gets 64px on the game bar controls", () => {
    expect(css("styles/app.css")).toMatch(/\[data-band="explorer"\] \.gbar \.back,[\s\S]*?min-height:\s*64px/);
  });

  it("the English and Arabic message files have the same keys", () => {
    const en = JSON.parse(fs.readFileSync(path.join(__dirname, "../../../messages/en.json"), "utf8"));
    const ar = JSON.parse(fs.readFileSync(path.join(__dirname, "../../../messages/ar.json"), "utf8"));
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
  });
});
