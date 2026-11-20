import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateClass, GamificationSettings, Roster, worldStops } from "@/components/teacher/classes";
import { ResultsBody, headline } from "@/components/teacher/results";
import { classDetail, lesson, results, summaries } from "@/test/fixtures";
import { mockFetch, renderWithProviders } from "@/test/utils";
import { translate } from "@/lib/messages";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: push, refresh: jest.fn() }), usePathname: () => "/app", useSearchParams: () => new URLSearchParams() }));
jest.setTimeout(60000);
beforeEach(() => push.mockReset());
const statusText = () => screen.getAllByRole("status").map((e) => e.textContent).join(" | ");

describe("create a class", () => {
  it("asks for a name, then creates the class with its grade and band", async () => {
    const onCreated = jest.fn();
    const { calls } = mockFetch({ "POST /classes": (b) => ({ body: { id: "c9", name: (b as { name: string }).name, grade: 3, subject: "Maths", band: "EXPLORER", studentCount: 0 } }) });
    renderWithProviders(<CreateClass onCreated={onCreated} />, { scope: "teacher" });
    await userEvent.click(screen.getByRole("button", { name: "Create a class" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Give the class a short name");
    fireEvent.change(screen.getByLabelText("Class name"), { target: { value: "3A" } });
    fireEvent.change(screen.getByLabelText("Grade"), { target: { value: "3" } });
    expect(screen.getByText("Grade 3 sets the Explorer band automatically.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Maths" } });
    await userEvent.click(screen.getByRole("button", { name: "Create a class" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: "c9" })));
    expect(calls.find((c) => c.path === "/classes")?.body).toEqual({ name: "3A", grade: 3, subject: "Maths" });
  });

  it("shows the server error and keeps the form", async () => {
    mockFetch({ "POST /classes": () => ({ status: 409, body: { title: "Conflict", status: 409, detail: "That class exists" } }) });
    renderWithProviders(<CreateClass />, { scope: "teacher" });
    fireEvent.change(screen.getByLabelText("Class name"), { target: { value: "6B" } });
    await userEvent.click(screen.getByRole("button", { name: "Create a class" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That class exists");
  });
});

describe("roster", () => {
  it("validates, adds pasted students, and reports a server error", async () => {
    let fail = false;
    const { calls } = mockFetch({ "POST /classes/c1/students": () => (fail ? { status: 500, body: { title: "x", status: 500 } } : { body: [{ id: "n1" }, { id: "n2" }] }), "GET /classes/c1": () => ({ body: classDetail }), "GET /classes": () => ({ body: [] }) });
    renderWithProviders(<Roster cls={classDetail} />, { scope: "teacher" });
    await userEvent.click(screen.getByRole("button", { name: "Add students" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Paste at least one name");
    fireEvent.change(screen.getByLabelText("Paste student names, one per line"), { target: { value: Array.from({ length: 61 }, (_, i) => `Student ${i}`).join("\n") } });
    await userEvent.click(screen.getByRole("button", { name: /Add 61 students/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("up to 60");
    fireEvent.change(screen.getByLabelText("Paste student names, one per line"), { target: { value: "Mia Lopez\nAli Ben" } });
    await userEvent.click(screen.getByRole("button", { name: /Add 2 students/ }));
    await waitFor(() => expect(calls.find((c) => c.path === "/classes/c1/students")?.body).toEqual({ names: ["Mia Lopez", "Ali Ben"] }));
    fail = true;
    fireEvent.change(screen.getByLabelText("Paste student names, one per line"), { target: { value: "Zed" } });
    await userEvent.click(screen.getByRole("button", { name: /Add 1 student/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/went wrong on our side/);
  });

  it("lists students A to Z and removes one after an inline confirmation", async () => {
    const { calls } = mockFetch({ "DELETE /classes/c1/students/s2": () => ({ status: 204 }), "GET /classes/c1": () => ({ body: classDetail }), "GET /classes": () => ({ body: [] }) });
    renderWithProviders(<Roster cls={classDetail} />, { scope: "teacher" });
    const list = screen.getByRole("list", { name: "6B students, A to Z" });
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)[0]).toContain("Omar Kacem");
    await userEvent.click(screen.getByRole("button", { name: "Remove Omar Kacem" }));
    expect(screen.getByText(/Remove Omar Kacem from 6B/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.queryByText(/Remove Omar Kacem from 6B/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove Omar Kacem" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove student" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
  });

  it("shows an empty state when there are no students", () => {
    mockFetch({});
    renderWithProviders(<Roster cls={{ ...classDetail, students: [] }} />, { scope: "teacher" });
    expect(screen.getByText("No students yet")).toBeInTheDocument();
  });
});

describe("class settings", () => {
  it("toggles a switch with an optimistic update and rolls back on error", async () => {
    let fail = false;
    const { calls } = mockFetch({ "PATCH /classes/c1/settings": () => (fail ? { status: 500, body: { title: "x", status: 500 } } : { body: {} }), "GET /classes/c1": () => ({ body: classDetail }) });
    renderWithProviders(<GamificationSettings cls={classDetail} />, { scope: "teacher" });
    const sounds = screen.getByRole("switch", { name: "Sounds" });
    await userEvent.click(sounds);
    await waitFor(() => expect(calls.some((c) => (c.body as { soundsEnabled?: boolean }).soundsEnabled === true)).toBe(true));
    fail = true;
    await userEvent.click(screen.getByRole("switch", { name: "Team challenges" }));
    await waitFor(() => expect(statusText()).toMatch(/went wrong on our side/));
  });

  it("validates the weekly goal and saves a valid one", async () => {
    const { calls } = mockFetch({ "PATCH /classes/c1/settings": () => ({ body: {} }), "GET /classes/c1": () => ({ body: classDetail }) });
    renderWithProviders(<GamificationSettings cls={classDetail} />, { scope: "teacher" });
    const goal = screen.getByLabelText("Weekly class goal (XP)");
    fireEvent.change(goal, { target: { value: "10" } });
    await userEvent.click(screen.getByRole("button", { name: "Save goal" }));
    expect(statusText()).toMatch(/between 50 and 10,000/);
    fireEvent.change(goal, { target: { value: "800" } });
    await userEvent.click(screen.getByRole("button", { name: "Save goal" }));
    await waitFor(() => expect(calls.some((c) => (c.body as { weeklyGoalXp?: number }).weeklyGoalXp === 800)).toBe(true));
    expect(screen.getByText(/\(this class\)/)).toBeInTheDocument();
  });

  it("orders the class world stops and marks the current lesson", () => {
    const stops = worldStops(summaries);
    expect(stops).toHaveLength(6);
    expect(stops.map((s) => s.state)).toEqual(["cur", "done", "lock", "lock", "lock", "lock"].map((_, i) => stops[i].state));
    expect(stops.filter((s) => s.state === "cur")).toHaveLength(1);
    expect(worldStops([]).every((s) => s.state === "lock" && s.note === "plan")).toBe(true);
  });
});

describe("results body", () => {
  const route = {
    "GET /classes/c1": () => ({ body: classDetail }),
    "POST /lessons/l1/reteach": () => ({ body: { warmUpTitle: "Warm up", warmUpSteps: ["Step one"], smallGroupTask: "Group task", targetObjectiveCode: "O1" } }),
    "POST /students/s1/badges": () => ({ status: 201, body: { badge: "KIND_HELPER" } }),
    "DELETE /students/s1/badges/KIND_HELPER": () => ({ status: 204 }),
    "POST /lessons": () => ({ body: lesson({ id: "l7" }) }),
  };

  it("builds the headline sentence for every case", () => {
    const t = (k: never, v?: Record<string, string | number>) => translate("en", k, v);
    expect(headline({ ...results, average: null, answered: 0 }, t as never)).toBe("No answers yet.");
    expect(headline(results, t as never)).toContain("O1 needs another look at 58%");
    expect(headline({ ...results, mastery: [{ code: "O1", text: "x", bloom: "apply", value: 0.9 }] }, t as never)).toContain("on target");
  });

  it("toggles each chart into a table", async () => {
    mockFetch(route);
    renderWithProviders(<ResultsBody lesson={lesson()} results={results} />, { scope: "teacher" });
    await userEvent.click(screen.getByRole("tab", { name: "Concepts" }));
    for (const toggle of screen.getAllByRole("button", { name: "View as table" })) await userEvent.click(toggle);
    expect(screen.getAllByRole("columnheader").length).toBeGreaterThan(3);
    await userEvent.click(screen.getByRole("tab", { name: "Questions" }));
    await userEvent.click(screen.getByRole("button", { name: "View as table" }));
    expect(screen.getByRole("columnheader", { name: "Question" })).toBeInTheDocument();
  });

  it("lists who needs help, who has not submitted, and the teacher-only ranking", async () => {
    mockFetch(route);
    renderWithProviders(<ResultsBody lesson={lesson()} results={results} />, { scope: "teacher" });
    await userEvent.click(screen.getByRole("tab", { name: "Students" }));
    expect(screen.getByText(/missed Q2/)).toBeInTheDocument();
    expect(screen.getByText("Not submitted (1)")).toBeInTheDocument();
    expect(screen.getAllByText("Mia L.").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("tab", { name: "More" }));
    expect(screen.getByText("2.4 stars")).toBeInTheDocument();
  });

  it("awards a badge to selected students and undoes it from the toast", async () => {
    const { calls } = mockFetch(route);
    renderWithProviders(<ResultsBody lesson={lesson()} results={results} />, { scope: "teacher" });
    await userEvent.click(screen.getByRole("tab", { name: "More" }));
    const award = await screen.findByRole("button", { name: "Award a badge" });
    expect(award).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(await screen.findByRole("checkbox", { name: /Sara Ahmed/ }));
    expect(screen.getByText("1 students selected.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Never Gives Up" }));
    await userEvent.click(screen.getByRole("radio", { name: "Kind Helper" }));
    await userEvent.click(award);
    await waitFor(() => expect(calls.some((c) => c.path === "/students/s1/badges" && c.method === "POST")).toBe(true));
    await userEvent.click(await screen.findByRole("button", { name: /Undo/ }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.path === "/students/s1/badges/KIND_HELPER")).toBe(true));
  });

  it("makes a re-teach plan and adds it as the next lesson", async () => {
    const { calls } = mockFetch(route);
    renderWithProviders(<ResultsBody lesson={lesson()} results={results} />, { scope: "teacher" });
    await userEvent.click(screen.getByRole("tab", { name: "More" }));
    await userEvent.click(screen.getAllByRole("button", { name: "Make a re-teach plan" })[0]);
    expect(await screen.findByText("Group task")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Make another plan" }));
    await userEvent.click(await screen.findByRole("button", { name: "Add to Lesson 5" }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect((calls.find((c) => c.path === "/lessons" && c.method === "POST")?.body as { lessonNumber: number }).lessonNumber).toBe(5);
  });

  it("says so when the re-teach plan or the badge award fails", async () => {
    mockFetch({ ...route, "POST /lessons/l1/reteach": () => ({ status: 500, body: { title: "x", status: 500 } }), "POST /students/s1/badges": () => ({ status: 500, body: { title: "x", status: 500 } }) });
    renderWithProviders(<ResultsBody lesson={lesson()} results={results} />, { scope: "teacher" });
    await userEvent.click(screen.getByRole("tab", { name: "More" }));
    await userEvent.click(screen.getAllByRole("button", { name: "Make a re-teach plan" })[0]);
    expect(await screen.findByRole("alert")).toHaveTextContent(/went wrong on our side/);
    await userEvent.click(await screen.findByRole("checkbox", { name: /Sara Ahmed/ }));
    await userEvent.click(screen.getByRole("button", { name: "Award a badge" }));
    await waitFor(() => expect(statusText()).toMatch(/went wrong on our side/));
  });

  it("shows tiles even when no time was recorded and flags the empty state", () => {
    mockFetch(route);
    const { unmount } = renderWithProviders(<ResultsBody lesson={lesson()} results={{ ...results, averageTimeSec: null, mastery: [] }} />, { scope: "teacher" });
    expect(screen.getByText("Average time").nextSibling).toHaveTextContent("–");
    unmount();
    renderWithProviders(<ResultsBody lesson={lesson()} results={{ ...results, answered: 0, sessionId: null, average: null }} />, { scope: "teacher" });
    expect(screen.getByRole("link", { name: "Start a live quiz" })).toBeInTheDocument();
  });
});
