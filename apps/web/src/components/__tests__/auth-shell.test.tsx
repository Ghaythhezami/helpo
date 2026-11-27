import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthForm } from "@/components/public/auth-form";
import { PublicShell } from "@/components/public/public-shell";
import { Landing } from "@/components/public/landing";
import { TeacherShell, useSelectedClassId } from "@/components/teacher/shell";
import { authMock } from "@/test/better-auth-react";
import { mockFetch, renderWithProviders } from "@/test/utils";

const replace = jest.fn();
const refresh = jest.fn();
let search = "";
let pathname = "/app";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: replace, replace, refresh }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
}));
jest.setTimeout(60000);

beforeEach(() => {
  replace.mockReset();
  refresh.mockReset();
  search = "";
  pathname = "/app";
  authMock.signIn.email.mockReset().mockResolvedValue({ data: {}, error: null });
  authMock.signUp.email.mockReset().mockResolvedValue({ data: {}, error: null });
  authMock.signOut.mockReset().mockResolvedValue({ data: {}, error: null });
});

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });

describe("AuthForm", () => {
  it("signs in and goes to the safe next page", async () => {
    search = "next=/app/lessons/l1";
    renderWithProviders(<AuthForm mode="login" />);
    const submit = screen.getByRole("button", { name: /Sign in/ });
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent("Please fix the fields marked below.");
    expect(screen.getByLabelText(/^Email/)).toHaveFocus();
    expect(authMock.signIn.email).not.toHaveBeenCalled();
    type("Email", " teacher@school.org ");
    type("Password", "longenough1");
    await userEvent.click(screen.getByRole("button", { name: /Sign in/ }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/lessons/l1"));
    expect(authMock.signIn.email).toHaveBeenCalledWith({ email: "teacher@school.org", password: "longenough1" });
    expect(refresh).toHaveBeenCalled();
  });

  it("ignores an unsafe next target", async () => {
    search = "next=https://evil.example";
    renderWithProviders(<AuthForm mode="login" />);
    type("Email", "a@b.co");
    type("Password", "longenough1");
    await userEvent.click(screen.getByRole("button", { name: /Sign in/ }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app"));
  });

  it("shows our own translated message when sign-in fails, never the server text", async () => {
    authMock.signIn.email.mockResolvedValueOnce({ data: {}, error: { message: "Wrong password" } });
    renderWithProviders(<AuthForm mode="login" />);
    type("Email", "a@b.co");
    type("Password", "longenough1");
    await userEvent.click(screen.getByRole("button", { name: /Sign in/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That email and password don't match.");
    authMock.signIn.email.mockResolvedValueOnce({ data: {}, error: {} });
    await userEvent.click(screen.getByRole("button", { name: /Sign in/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("That email and password don't match."));
    expect(replace).not.toHaveBeenCalled();
  });

  it("signs up, saves the school, and then opens the app", async () => {
    const { calls } = mockFetch({ "PUT /me/school": () => ({ body: {} }) });
    renderWithProviders(<AuthForm mode="signup" />);
    type("Your name", "Alex Green");
    type("School name", "Riverside");
    type("Email", "alex@riverside.org");
    type("Password", "longenough1");
    await userEvent.click(screen.getByRole("button", { name: /Create account/ }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app"));
    expect(authMock.signUp.email).toHaveBeenCalledWith({ name: "Alex Green", email: "alex@riverside.org", password: "longenough1" });
    expect(calls.find((c) => c.path === "/me/school")?.body).toEqual({ name: "Riverside" });
  });

  it("asks for a name and school before creating an account", async () => {
    renderWithProviders(<AuthForm mode="signup" />);
    type("Email", "alex@riverside.org");
    type("Password", "longenough1");
    await userEvent.click(screen.getByRole("button", { name: /Create account/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please fix the fields marked below.");
    expect(screen.getByText("Enter your name.")).toBeInTheDocument();
    expect(screen.getByText("Enter your school's name.")).toBeInTheDocument();
    expect(authMock.signUp.email).not.toHaveBeenCalled();
  });

  it("reports a failed sign-up and a failed school save without navigating", async () => {
    authMock.signUp.email.mockResolvedValueOnce({ data: {}, error: { message: "Email already used" } });
    renderWithProviders(<AuthForm mode="signup" />);
    type("Your name", "Alex");
    type("School name", "Riverside");
    type("Email", "alex@riverside.org");
    type("Password", "longenough1");
    await userEvent.click(screen.getByRole("button", { name: /Create account/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("An account with that email already exists. Sign in instead.");
    mockFetch({ "PUT /me/school": () => ({ status: 500, body: { title: "x", status: 500 } }) });
    await userEvent.click(screen.getByRole("button", { name: /Create account/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/went wrong on our side/));
    expect(replace).not.toHaveBeenCalled();
  });

  it("links between sign-in and sign-up", () => {
    const { unmount } = renderWithProviders(<AuthForm mode="login" />);
    expect(screen.getByRole("link", { name: "Create a teacher account" })).toHaveAttribute("href", "/signup");
    unmount();
    renderWithProviders(<AuthForm mode="signup" />);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });
});

describe("public shell and landing", () => {
  it("shows the logo, the language switch and the two entry links around the page", () => {
    renderWithProviders(<PublicShell><Landing /></PublicShell>);
    expect(screen.getAllByRole("link", { name: "Join your class" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Teacher sign-in/ })[0]).toHaveAttribute("href", "/login");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("One lesson in, a full kit out");
    expect(screen.getByRole("link", { name: "Create a teacher account" })).toHaveAttribute("href", "/signup");
    expect(screen.getByRole("button", { name: "العربية" })).toBeInTheDocument();
  });

  it("renders the landing page in Arabic", () => {
    renderWithProviders(<Landing />, { locale: "ar" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("درس واحد");
  });
});

describe("teacher shell", () => {
  const me = { id: "u1", name: "Alex Green", email: "a@b.c", school: { id: "s", name: "Riverside", slug: "riverside" } };
  const classes = [{ id: "c1", name: "6B", grade: 6, subject: "Science", band: "NAVIGATOR", studentCount: 24 }, { id: "c2", name: "7C", grade: 7, subject: "Science", band: "NAVIGATOR", studentCount: 20 }];

  function Probe() {
    const { classId, setClassId } = useSelectedClassId();
    return <button onClick={() => setClassId("c2")}>class:{classId ?? "none"}</button>;
  }

  it("opens the avatar menu and signs out", async () => {
    mockFetch({ "GET /me": () => ({ body: me }), "GET /classes": () => ({ body: classes }) });
    renderWithProviders(<TeacherShell><p>content</p></TeacherShell>, { scope: "teacher" });
    await userEvent.click(await screen.findByRole("button", { name: "AG account menu" }));
    expect(screen.getByText("Riverside")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(authMock.signOut).toHaveBeenCalled());
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("closes the menu with Escape or a click outside, and opens the class dialog", async () => {
    mockFetch({ "GET /me": () => ({ body: me }), "GET /classes": () => ({ body: classes }), "GET /classes/c1": () => ({ body: { id: "c1", name: "6B", grade: 6, subject: "S", band: "NAVIGATOR", studentCount: 0, settings: { pointsEnabled: true, teamsEnabled: false, soundsEnabled: false, celebrationsEnabled: true, weeklyGoalXp: 500 }, students: [], weekXp: 0, lessons: [] } }) });
    renderWithProviders(<TeacherShell><p>content</p></TeacherShell>, { scope: "teacher" });
    const avatar = await screen.findByRole("button", { name: "AG account menu" });
    await userEvent.click(avatar);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
    await userEvent.click(avatar);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
    const mm = window.matchMedia;
    window.matchMedia = ((q: string) => ({ ...mm(q), matches: q.includes("min-width: 1024px") })) as typeof window.matchMedia;
    renderWithProviders(<TeacherShell><p>content</p></TeacherShell>, { scope: "teacher" });
    await userEvent.click(await screen.findByRole("button", { name: "Classes" }));
    window.matchMedia = mm;
    expect(await screen.findByRole("dialog", { name: "Your classes" })).toBeInTheDocument();
  });

  it("remembers the selected class and falls back to the first class", async () => {
    mockFetch({ "GET /me": () => ({ body: me }), "GET /classes": () => ({ body: classes }) });
    window.localStorage.setItem("helpo:class", "gone");
    renderWithProviders(<TeacherShell><Probe /></TeacherShell>, { scope: "teacher" });
    await screen.findByText("class:c1");
    await userEvent.click(screen.getByText("class:c1"));
    expect(screen.getByText("class:c2")).toBeInTheDocument();
    expect(window.localStorage.getItem("helpo:class")).toBe("c2");
  });

  it("sends a signed-out visitor to the sign-in page", async () => {
    pathname = "/app/lessons/l1";
    mockFetch({ "GET /me": () => ({ status: 401, body: { title: "Unauthorized", status: 401 } }), "GET /classes": () => ({ status: 401, body: { title: "Unauthorized", status: 401 } }) });
    renderWithProviders(<TeacherShell><p>x</p></TeacherShell>, { scope: "teacher" });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?next=%2Fapp%2Flessons%2Fl1"));
  });

  it("switches the language from the header and saves it for the teacher", async () => {
    const { calls } = mockFetch({ "GET /me": () => ({ body: me }), "GET /classes": () => ({ body: [] }), "PUT /me/locale": () => ({ body: me }) });
    const mm = window.matchMedia;
    window.matchMedia = ((q: string) => ({ ...mm(q), matches: q.includes("min-width: 1024px") })) as typeof window.matchMedia;
    renderWithProviders(<TeacherShell><p>x</p></TeacherShell>, { scope: "teacher" });
    await userEvent.click(await screen.findByRole("button", { name: "AG account menu" }));
    await userEvent.click(await screen.findByRole("button", { name: "العربية" }));
    window.matchMedia = mm;
    await waitFor(() => expect(calls.some((c) => c.path === "/me/locale")).toBe(true));
    expect(document.documentElement.dir).toBe("rtl");
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
  });
});
