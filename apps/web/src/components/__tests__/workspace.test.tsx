import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateScreen } from "@/components/teacher/create-screen";
import { Workspace } from "@/components/teacher/workspace";
import { ResultsBody } from "@/components/teacher/results";
import { LiveBoard } from "@/components/teacher/live-board";
import { Whiteboard } from "@/components/teacher/whiteboard";
import { Making } from "@/components/teacher/making";
import { ClassManager } from "@/components/teacher/class-manager";
import { classDetail, lesson, resource, results, session, slidesContent, summaries, quizContent } from "@/test/fixtures";
import { mockFetch, renderWithProviders } from "@/test/utils";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push, refresh: jest.fn() }),
  usePathname: () => "/app",
  useSearchParams: () => new URLSearchParams(),
}));

jest.setTimeout(60000);
beforeEach(() => push.mockReset());

const classes = [{ id: "c1", name: "6B", grade: 6, subject: "Science", band: "NAVIGATOR", studentCount: 24 }];
const statusText = () => screen.getAllByRole("status").map((e) => e.textContent).join(" | ");

describe("Create screen", () => {
  const base = { "GET /classes": () => ({ body: classes }), "GET /lessons": () => ({ body: summaries }) };

  it("shows the previous lessons strip and a searchable list", async () => {
    mockFetch(base);
    renderWithProviders(<CreateScreen />, { scope: "teacher" });
    expect(await screen.findByRole("heading", { name: "What are we teaching today?" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Photosynthesis/ })).toHaveAttribute("href", "/app/lessons/l1");
    await userEvent.click(screen.getByRole("button", { name: "See all" }));
    await userEvent.type(screen.getByLabelText("Search lessons"), "zzz");
    expect(screen.getByText("No lesson matches that.")).toBeInTheDocument();
  });

  it("fills the prompt from a suggestion chip and refines it with AI, with Undo and tap-to-add chips", async () => {
    mockFetch({ ...base, "POST /lessons/refine-prompt": () => ({ body: { prompt: "Photosynthesis for grade 6, with a short experiment.", suggestions: ["+ Add a quiz", "+ Add a game"] } }) });
    renderWithProviders(<CreateScreen />, { scope: "teacher" });
    const refine = await screen.findByRole("button", { name: "Refine with AI" });
    expect(refine).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "The Solar System for Grade 4" }));
    expect(screen.getByLabelText("Or describe your lesson")).toHaveValue("The Solar System for Grade 4");
    await userEvent.click(refine);
    await waitFor(() => expect(screen.getByLabelText("Or describe your lesson")).toHaveValue("Photosynthesis for grade 6, with a short experiment."));
    await userEvent.click(screen.getByRole("button", { name: "+ Add a quiz" }));
    expect((screen.getByLabelText("Or describe your lesson") as HTMLTextAreaElement).value).toContain("Add a quiz");
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByLabelText("Or describe your lesson")).toHaveValue("The Solar System for Grade 4");
  });

  it("keeps the text and says so when refining fails", async () => {
    mockFetch({ ...base, "POST /lessons/refine-prompt": () => ({ status: 500, body: { title: "x", status: 500 } }) });
    renderWithProviders(<CreateScreen />, { scope: "teacher" });
    await userEvent.type(await screen.findByLabelText("Or describe your lesson"), "A lesson about plants");
    await userEvent.click(screen.getByRole("button", { name: "Refine with AI" }));
    expect(await screen.findByText(/Couldn't refine right now/)).toBeInTheDocument();
    expect(screen.getByLabelText("Or describe your lesson")).toHaveValue("A lesson about plants");
  });

  it("rejects a bad file type and an oversized file", async () => {
    mockFetch(base);
    renderWithProviders(<CreateScreen />, { scope: "teacher" });
    const input = (await screen.findByText("Select lesson file")).closest("label")!.querySelector("input")!;
    fireEvent.change(input, { target: { files: [new File(["x"], "a.exe")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/isn't supported/);
    fireEvent.change(input, { target: { files: [new File([new ArrayBuffer(21 * 1024 * 1024)], "big.pdf")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/over 20 MB/);
  });

  it("creates a lesson from a prompt (autoGenerate) and opens the workspace", async () => {
    const { calls } = mockFetch({ ...base, "POST /lessons": () => ({ body: { lessonId: "l9" } }) });
    renderWithProviders(<CreateScreen />, { scope: "teacher" });
    await userEvent.type(await screen.findByLabelText("Or describe your lesson"), "Fractions for grade 4 with word problems");
    await userEvent.click(screen.getByRole("button", { name: "Make lesson kit" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/lessons/l9"));
    expect(calls.find((c) => c.path === "/lessons" && c.method === "POST")).toBeTruthy();
  });

  it("offers Open it / Make a new one on a duplicate upload and asks for a page range over 150 pages", async () => {
    let mode: "dup" | "pages" = "dup";
    mockFetch({
      ...base,
      "POST /lessons": () => (mode === "dup" ? { status: 409, body: { title: "Duplicate", status: 409, existingLessonId: "l1" } } : { status: 422, body: { title: "Too long", status: 422 } }),
    });
    renderWithProviders(<CreateScreen />, { scope: "teacher" });
    const field = await screen.findByLabelText("Or describe your lesson");
    await userEvent.type(field, "Photosynthesis for grade 6 please");
    await userEvent.click(screen.getByRole("button", { name: "Make lesson kit" }));
    expect(await screen.findByText(/You already made a kit/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open it" })).toHaveAttribute("href", "/app/lessons/l1");
    mode = "pages";
    await userEvent.click(screen.getByRole("button", { name: "Make a new one" }));
    expect(await screen.findByText(/over 150 pages/)).toBeInTheDocument();
  });

  it("asks for a class first when the teacher has none", async () => {
    mockFetch({ "GET /classes": () => ({ body: [] }), "GET /lessons": () => ({ body: [] }) });
    renderWithProviders(<CreateScreen />, { scope: "teacher" });
    expect(await screen.findByText("Add a class first")).toBeInTheDocument();
  });
});

describe("Workspace", () => {
  const route = (l = lesson()) => ({ "GET /lessons/l1": () => ({ body: l }) });

  it("shows the tabs with status dots and switches resources", async () => {
    mockFetch(route());
    renderWithProviders(<Workspace id="l1" />, { scope: "teacher" });
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    for (const [tab, marker] of [["Worksheet", /Worksheet/], ["Quiz", /Which part catches light/], ["Game", /Plant parts/], ["Cards", /Term 1/], ["Slides", /How plants make food/]] as const) {
      await userEvent.click(screen.getByRole("tab", { name: new RegExp(tab) }));
      expect(await screen.findAllByText(marker)).not.toHaveLength(0);
    }
  });

  it("lists items with drag handles, reorders with Alt+arrow and saves a new version with Undo", async () => {
    const { calls } = mockFetch({ ...route(), "PATCH /resources/r-SLIDES": () => ({ body: {} }) });
    renderWithProviders(<Workspace id="l1" />, { scope: "teacher" });
    await screen.findByRole("heading", { level: 1 });
    const first = screen.getAllByRole("button", { name: /Photosynthesis/ }).find((b) => b.className.includes("row-main"))!;
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown", altKey: true });
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH" && c.path === "/resources/r-SLIDES")).toBe(true));
    const patch = calls.find((c) => c.method === "PATCH")!.body as { content: { slides: { title: string }[] } };
    expect(patch.content.slides[0].title).toBe("What plants need");
    await userEvent.click(screen.getByRole("button", { name: "Delete item 2" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "PATCH").length).toBe(2));
  });

  it("pages through slides and toggles Draw on slide", async () => {
    mockFetch(route());
    renderWithProviders(<Workspace id="l1" />, { scope: "teacher" });
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByText("1 / 7")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next slide" }));
    expect(screen.getByText("2 / 7")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Draw on slide" }));
    expect(screen.getByRole("toolbar", { name: "Drawing tools" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Draw on slide" }));
    expect(screen.queryByRole("toolbar", { name: "Drawing tools" })).not.toBeInTheDocument();
  });

  it("accepts a check from the edit panel and sends the ask-Nibras change request", async () => {
    const { calls } = mockFetch({
      ...route(),
      "PATCH /checks/k1": () => ({ body: {} }),
      "POST /resources/r-SLIDES/change": () => ({ body: { summary: "Made it simpler", resource: resource("SLIDES", {}) } }),
    });
    renderWithProviders(<Workspace id="l1" />, { scope: "teacher" });
    await screen.findByRole("heading", { level: 1 });
    await userEvent.type(screen.getByLabelText("Ask Nibras"), "make slide 2 easier");
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/resources/r-SLIDES/change")).toBe(true));
    await userEvent.click(screen.getByRole("tab", { name: /Quiz/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Accept Quiz Q1 as written" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/checks/k1" && (c.body as { status: string }).status === "ACCEPTED")).toBe(true));
  });

  it("opens What Nibras understood, the download menu and the whiteboard", async () => {
    mockFetch(route());
    renderWithProviders(<Workspace id="l1" />, { scope: "teacher" });
    await screen.findByRole("heading", { level: 1 });
    await userEvent.click(screen.getByRole("button", { name: "What Nibras understood" }));
    expect(await screen.findByText("A summary.")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: /Download/ }));
    expect(screen.getByRole("link", { name: "Download PPTX" })).toHaveAttribute("href", "/api/resources/r-SLIDES/export?format=pptx");
    await userEvent.click(screen.getAllByRole("button", { name: "Whiteboard" })[0]);
    expect(screen.getByRole("dialog", { name: "Whiteboard" })).toBeInTheDocument();
  });

  it("shares in two steps: two big choices, then code, link, copy and the open switch, asking before sharing with open checks", async () => {
    const { calls } = mockFetch({
      ...route(),
      "POST /resources/r-QUIZ/share": () => ({ body: session() }),
      "POST /sessions/se1/action": () => ({ body: session({ status: "ENDED", isOpen: false }) }),
    });
    Object.assign(navigator, { clipboard: { writeText: jest.fn(async () => undefined) } });
    renderWithProviders(<Workspace id="l1" />, { scope: "teacher" });
    await screen.findByRole("heading", { level: 1 });
    await userEvent.click(screen.getAllByRole("button", { name: /Share/ })[0]);
    const dialog = await screen.findByRole("dialog", { name: "Share settings" });
    expect(within(dialog).getByText("Play live in class")).toBeInTheDocument();
    expect(within(dialog).getByText("Students do it on their own")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByText("Play live in class"));
    expect(await within(dialog).findByText(/1 things are still unchecked/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Share anyway" }));
    expect(await within(dialog).findByLabelText(/Join code 482 913/)).toBeInTheDocument();
    expect((calls.find((c) => c.path === "/resources/r-QUIZ/share")!.body as { approveAnyway?: boolean }).approveAnyway).toBe(true);
    await userEvent.click(within(dialog).getByRole("button", { name: "Copy" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("http://localhost/join?code=482913");
    await userEvent.click(within(dialog).getByRole("switch"));
    await waitFor(() => expect(calls.some((c) => c.path === "/sessions/se1/action")).toBe(true));
    expect(await within(dialog).findByText("Closed to new students")).toBeInTheDocument();
  });

  it("keeps Individual disabled for grades 2 to 5", async () => {
    mockFetch({ ...route(lesson({ grade: 4, band: "EXPLORER", checks: [] })) });
    renderWithProviders(<Workspace id="l1" />, { scope: "teacher" });
    await screen.findByRole("heading", { level: 1 });
    await userEvent.click(screen.getAllByRole("button", { name: /Share/ })[0]);
    const dialog = await screen.findByRole("dialog", { name: "Share settings" });
    await userEvent.click(within(dialog).getByText("Options"));
    expect(within(dialog).getByRole("radio", { name: "Individual" })).toHaveAttribute("aria-disabled", "true");
    expect(within(dialog).getByText(/off for grades 2 to 5/)).toBeInTheDocument();
  });

  it("shows the honest pipeline while the kit is still being made", async () => {
    mockFetch(route(lesson({ status: "EXTRACTING", resources: [], checks: [], sourceChars: 0, blueprint: null })));
    renderWithProviders(<Workspace id="l1" />, { scope: "teacher" });
    expect(await screen.findByText("Reading your file")).toBeInTheDocument();
    expect(screen.getByText("Understanding the lesson")).toBeInTheDocument();
  });
});

describe("Results dialog body", () => {
  it("leads with three numbers and a what-to-do-next card, with details in tabs", async () => {
    mockFetch({ "GET /classes/c1": () => ({ body: classDetail }), "POST /lessons/l1/reteach": () => ({ body: { warmUpTitle: "Warm up", warmUpSteps: ["Step"], smallGroupTask: "Task", targetObjectiveCode: "O1" } }) });
    renderWithProviders(<ResultsBody lesson={lesson()} results={results} />, { scope: "teacher" });
    const numbers = screen.getByRole("group", { name: "Class numbers" });
    expect(within(numbers).getByText("22 / 24")).toBeInTheDocument();
    expect(within(numbers).getByText("74%")).toBeInTheDocument();
    expect(within(numbers).getByText("10 min")).toBeInTheDocument();
    expect(screen.getByText(/Review O1, now at 58%/)).toBeInTheDocument();
    for (const tab of ["Students", "Concepts", "More", "Questions"]) {
      await userEvent.click(screen.getByRole("tab", { name: tab }));
    }
    await userEvent.click(screen.getByRole("button", { name: "Make a re-teach plan" }));
    expect((await screen.findAllByText("Warm up")).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("tab", { name: "Students" }));
    expect(screen.getByRole("columnheader", { name: "Student" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Concepts" }));
    await userEvent.click(screen.getAllByRole("button", { name: "View as table" })[0]);
  });

  it("explains when nobody has answered yet", () => {
    mockFetch({ "GET /classes/c1": () => ({ body: classDetail }) });
    renderWithProviders(<ResultsBody lesson={lesson()} results={{ ...results, sessionId: null, answered: 0, average: null }} />, { scope: "teacher" });
    expect(screen.getByText("No results yet")).toBeInTheDocument();
  });
});

describe("Live board", () => {
  it("runs a quiz: start, reveal, next and end with an inline confirm", async () => {
    const { calls } = mockFetch({ "POST /sessions/se1/action": () => ({ body: session({ status: "LIVE" }) }) });
    renderWithProviders(<LiveBoard lesson={lesson()} session={session()} onEnded={jest.fn()} />, { scope: "teacher" });
    expect(screen.getByText("Waiting for students")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Start the quiz" }));
    await waitFor(() => expect(calls.some((c) => (c.body as { action: string }).action === "start")).toBe(true));
    await userEvent.click(screen.getByRole("button", { name: "End quiz" }));
    expect(screen.getByText(/End this for all 4 students/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Keep going" }));
  });

  it("shows the question with the answer key after reveal and the game progress for mini-games", () => {
    mockFetch({});
    const { unmount } = renderWithProviders(<LiveBoard lesson={lesson({ resources: [resource("QUIZ", quizContent)] })} session={session({ status: "LIVE", revealed: true, distribution: [3, 1] })} onEnded={jest.fn()} />, { scope: "teacher" });
    expect(screen.getByText("Which part catches light?")).toBeInTheDocument();
    expect(screen.getByText("The answer is shown.")).toBeInTheDocument();
    unmount();
    renderWithProviders(<LiveBoard lesson={lesson()} session={session({ type: "GAME", game: "MATCH", question: null })} onEnded={jest.fn()} />, { scope: "teacher" });
    expect(screen.getAllByText(/4 of 24 playing/).length).toBeGreaterThan(0);
  });
});

describe("Whiteboard", () => {
  it("draws, undoes, clears, minimizes and maximizes", async () => {
    renderWithProviders(<Whiteboard lessonId="wb-test" onClose={jest.fn()} />);
    const canvas = screen.getByRole("img", { name: "Drawing area" });
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 30, clientY: 30, pointerId: 1 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    const undo = screen.getByRole("button", { name: /Undo/ });
    await waitFor(() => expect(undo).toBeEnabled());
    expect(JSON.parse(window.localStorage.getItem("helpo:board:wb-test") ?? "[]")).toHaveLength(1);
    await userEvent.click(undo);
    expect(undo).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Eraser (E)" }));
    expect(screen.getByRole("button", { name: "Eraser (E)" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(window, { key: "p" });
    expect(screen.getByRole("button", { name: "Pencil (P)" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: /Colour #D32F2F/i }));
    await userEvent.click(screen.getByRole("button", { name: "Size 12" }));
    await userEvent.click(screen.getByRole("button", { name: "Full screen" }));
    expect(screen.getByRole("dialog", { name: "Whiteboard" }).className).toContain("full");
    await userEvent.click(screen.getByRole("button", { name: "Exit full screen" }));
    await userEvent.click(screen.getByRole("button", { name: "Minimize the whiteboard" }));
    await userEvent.click(screen.getByRole("button", { name: "Open the whiteboard" }));
    expect(screen.getByRole("dialog", { name: "Whiteboard" })).toBeInTheDocument();
  });
});

describe("Making and class manager", () => {
  it("lets the teacher make the kit from the blueprint step and retry a failed resource", async () => {
    const { calls } = mockFetch({ "POST /lessons/l1/generate": () => ({ body: {} }), "POST /lessons/l1/resources/GAME/retry": () => ({ body: {} }) });
    const { unmount } = renderWithProviders(<Making lesson={lesson({ status: "ANALYZED", resources: [] })} />, { scope: "teacher" });
    await userEvent.click(screen.getByRole("button", { name: /Make lesson kit/ }));
    await waitFor(() => expect(calls.some((c) => c.path === "/lessons/l1/generate")).toBe(true));
    unmount();
    renderWithProviders(<Making lesson={lesson({ status: "PARTIAL", resources: [resource("SLIDES", slidesContent), resource("GAME", null, { status: "FAILED" })] })} />, { scope: "teacher" });
    await userEvent.click(screen.getAllByRole("button", { name: /Try again/ })[0]);
    await waitFor(() => expect(calls.some((c) => c.path === "/lessons/l1/resources/GAME/retry")).toBe(true));
    expect(statusText()).toBeDefined();
  });

  it("creates a class and pastes students", async () => {
    const { calls } = mockFetch({
      "GET /classes": () => ({ body: classes }),
      "GET /classes/c1": () => ({ body: classDetail }),
      "POST /classes/c1/students": () => ({ body: [{ id: "s9" }] }),
      "PATCH /classes/c1/settings": () => ({ body: {} }),
    });
    renderWithProviders(<ClassManager />, { scope: "teacher" });
    await userEvent.type(await screen.findByLabelText("Paste student names, one per line"), "Mia Lopez{enter}Ali Ben");
    await userEvent.click(screen.getByRole("button", { name: /Add 2 students/ }));
    await waitFor(() => expect(calls.some((c) => c.path === "/classes/c1/students")).toBe(true));
    await userEvent.click(screen.getAllByRole("switch")[1]);
    await waitFor(() => expect(calls.some((c) => c.path === "/classes/c1/settings")).toBe(true));
  });
});
