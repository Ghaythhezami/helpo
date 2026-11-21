import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GameKind, PracticeQuiz, PracticeResult, StudentPractice } from "@helpo/shared";
import { PracticeHub, openHref } from "@/components/student/practice-hub";
import { PracticeQuizView } from "@/components/student/practice-quiz";
import { resolvePath } from "@/components/student/join-flow";
import { PreviewAsStudent } from "@/components/teacher/preview-student";
import { Workspace } from "@/components/teacher/workspace";
import { WorkspaceBridgeProvider } from "@/components/teacher/workspace-bridge";
import { NavItems } from "@/components/teacher/side-nav";
import { gradeLocally, normalizeAnswer, outcomeFromPractice, previewGames, practiceQuestions, previewQuestions } from "@/lib/practice";
import { gameContent, lesson, quizContent, resource } from "@/test/fixtures";
import { mockFetch, renderWithProviders } from "@/test/utils";
import en from "../../../messages/en.json";
import ar from "../../../messages/ar.json";

const push = jest.fn();
const replace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: jest.fn() }),
  usePathname: () => "/play",
  useSearchParams: () => new URLSearchParams(),
}));
jest.setTimeout(60000);
beforeEach(() => {
  push.mockReset();
  replace.mockReset();
});

const ALL: GameKind[] = ["MATCH", "MEMORY", "SORT", "EQUATION", "TRUE_FALSE"];
const practice = (extra: Partial<StudentPractice> = {}): StudentPractice => ({
  className: "6B",
  open: [{ sessionId: "se1", type: "LIVE_QUIZ", joinCode: "482913", lessonTitle: "Photosynthesis" }],
  lessons: [
    { lessonId: "l1", title: "Photosynthesis", number: 4, quizQuestions: 10, games: ALL, bestStars: 2 },
    { lessonId: "l2", title: "Water cycle", number: null, quizQuestions: 0, games: ["MATCH"], bestStars: 0 },
  ],
  ...extra,
});
const me = { displayName: "Sara A.", className: "6B", band: "EXPLORER", settings: { soundsEnabled: false } };
const unauthorized = { status: 401, body: { title: "Unauthorized", status: 401 } };

describe("practice hub", () => {
  it("shows what is live and one card per lesson with the quiz, every game and the best stars", async () => {
    mockFetch({ "GET /play/practice": () => ({ body: practice() }), "GET /play/me": () => ({ body: me }) });
    renderWithProviders(<PracticeHub />, { scope: "student" });
    expect(await screen.findByRole("heading", { name: "Live now" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Join the quiz" })).toHaveAttribute("href", "/play/quiz/se1");
    const list = screen.getByRole("list", { name: "Lessons to practice" });
    const first = within(list).getAllByRole("listitem")[0];
    expect(within(first).getByRole("heading", { name: "4. Photosynthesis" })).toBeInTheDocument();
    expect(within(first).getByRole("link", { name: "Quiz · 10 questions" })).toHaveAttribute("href", "/play/practice/l1");
    expect(within(first).getAllByRole("link")).toHaveLength(6);
    expect(within(first).getByRole("link", { name: "Match it" })).toHaveAttribute("href", "/play/games/l1/MATCH");
    expect(within(first).getByRole("link", { name: "True or false rush" })).toHaveAttribute("href", "/play/games/l1/TRUE_FALSE");
    expect(within(first).getByRole("img", { name: "Best: 2 of 3 stars" })).toBeInTheDocument();
    const second = within(list).getAllByRole("listitem")[1];
    expect(within(second).queryByRole("link", { name: /Quiz/ })).not.toBeInTheDocument();
    expect(within(second).getByRole("img", { name: "Not played yet" })).toBeInTheDocument();
    expect(await screen.findByText("Sara A., pick something to play.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Done for today" })).toHaveAttribute("href", "/join");
    expect(screen.getByRole("link", { name: "Switch class" })).toHaveAttribute("href", "/join");
  });

  it("routes homework to the self-paced screen and a live game to the lesson's first game", () => {
    const p = practice();
    expect(openHref({ sessionId: "s2", type: "ASSIGNMENT", joinCode: "111222", lessonTitle: "x" }, p.lessons)).toBe("/play/self/s2?code=111222");
    expect(openHref({ sessionId: "s3", type: "GAME", joinCode: "1", lessonTitle: "Photosynthesis" }, p.lessons)).toBe("/play/games/l1/MATCH");
    expect(openHref({ sessionId: "s3", type: "GAME", joinCode: "1", lessonTitle: "Unknown" }, p.lessons)).toBeNull();
  });

  it("labels homework and game cards, and drops a game session it cannot open", async () => {
    mockFetch({
      "GET /play/practice": () => ({
        body: practice({
          open: [
            { sessionId: "s2", type: "ASSIGNMENT", joinCode: "111222", lessonTitle: "Water cycle" },
            { sessionId: "s3", type: "GAME", joinCode: "1", lessonTitle: "Water cycle" },
            { sessionId: "s4", type: "GAME", joinCode: "1", lessonTitle: "Missing lesson" },
          ],
        }),
      }),
      "GET /play/me": () => unauthorized,
    });
    renderWithProviders(<PracticeHub />, { scope: "student" });
    expect(await screen.findByRole("link", { name: "Start homework" })).toHaveAttribute("href", "/play/self/s2?code=111222");
    expect(screen.getByRole("link", { name: "Play now" })).toHaveAttribute("href", "/play/games/l2/MATCH");
    expect(screen.queryByText("Missing lesson")).not.toBeInTheDocument();
    expect(screen.getByText("Class 6B")).toBeInTheDocument();
  });

  it("explains empty states for no open sessions and no lessons", async () => {
    mockFetch({ "GET /play/practice": () => ({ body: practice({ open: [], lessons: [] }) }), "GET /play/me": () => ({ body: me }) });
    renderWithProviders(<PracticeHub />, { scope: "student" });
    expect(await screen.findByText("Nothing is live right now. Practice any time below.")).toBeInTheDocument();
    expect(screen.getByText("No lessons to practice yet")).toBeInTheDocument();
    expect(screen.getByText("When your teacher shares a lesson, it will show up here.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Done for today" })).toBeInTheDocument();
  });

  it("shows an error with a retry, then the hub", async () => {
    let fail = true;
    const { calls } = mockFetch({
      "GET /play/practice": () => (fail ? { status: 500, body: { title: "Boom", status: 500 } } : { body: practice({ open: [] }) }),
      "GET /play/me": () => ({ body: me }),
    });
    renderWithProviders(<PracticeHub />, { scope: "student" });
    expect(await screen.findByRole("alert", {}, { timeout: 8000 })).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Practice anytime" })).toBeInTheDocument();
    expect(calls.filter((c) => c.path === "/play/practice").length).toBeGreaterThanOrEqual(2);
  });

  it("sends a student without a cookie to /join", async () => {
    mockFetch({ "GET /play/practice": () => unauthorized, "GET /play/me": () => unauthorized });
    renderWithProviders(<PracticeHub />, { scope: "student" });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/join"));
    expect(await screen.findByRole("link", { name: "Join your class" })).toHaveAttribute("href", "/join");
  });

  it("uses the Arabic game names in Arabic", async () => {
    mockFetch({ "GET /play/practice": () => ({ body: practice() }), "GET /play/me": () => ({ body: me }) });
    renderWithProviders(<PracticeHub />, { scope: "student", locale: "ar" });
    expect(await screen.findByRole("heading", { name: "مباشر الآن" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "صح أم خطأ" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "طابِق" })[0]).toHaveAttribute("href", "/play/games/l1/MATCH");
  });
});

const pq: PracticeQuiz = {
  lessonId: "l1",
  lessonTitle: "Photosynthesis",
  questions: [
    { id: "Q1", type: "mcq", prompt: "Which part catches light?", options: ["Leaf", "Root"], pairs: null, timeLimitSec: 30 },
    { id: "Q2", type: "short", prompt: "What is chlorophyll?", options: null, pairs: null, timeLimitSec: 30 },
    { id: "Q3", type: "matching", prompt: "Match the parts", options: null, pairs: [{ left: "Root", right: "Water" }, { left: "Leaf", right: "Light" }], timeLimitSec: 30 },
  ],
};
const presult: PracticeResult = {
  score: 0.67,
  correct: 2,
  total: 3,
  xp: 12,
  review: [
    { questionId: "Q1", correct: true, explanation: "Leaves hold chlorophyll.", correctAnswer: "Leaf" },
    { questionId: "Q2", correct: false, explanation: "It is a pigment.", correctAnswer: "green pigment" },
    { questionId: "Q3", correct: true, explanation: "", correctAnswer: "Root = Water" },
  ],
};

describe("practice quiz", () => {
  it("asks one question at a time, posts the answers and shows the review with the small XP", async () => {
    const { calls } = mockFetch({
      "GET /play/practice/l1/quiz": () => ({ body: pq }),
      "POST /play/practice/l1/quiz": () => ({ body: presult }),
      "GET /play/practice": () => ({ body: practice() }),
    });
    renderWithProviders(<PracticeQuizView lessonId="l1" />, { scope: "student" });
    expect(await screen.findByText("Which part catches light?")).toBeInTheDocument();
    const next = screen.getByRole("button", { name: "Next" });
    expect(next).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(screen.getByRole("button", { name: "Leaf" }));
    await userEvent.click(next);
    fireEvent.change(await screen.findByLabelText("Your answer"), { target: { value: "green" } });
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Leaf" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(await screen.findByLabelText("Root"), { target: { value: "Water" } });
    fireEvent.change(screen.getByLabelText("Leaf"), { target: { value: "Light" } });
    await userEvent.click(screen.getByRole("button", { name: "Send my answers" }));

    expect(await screen.findByText("You got 2 of 3 right.")).toBeInTheDocument();
    expect(screen.getByText("+12 XP for practising")).toBeInTheDocument();
    const body = calls.find((c) => c.method === "POST" && c.path === "/play/practice/l1/quiz")!.body as { answers: { questionId: string }[]; durationSec: number };
    expect(body.answers.map((a) => a.questionId)).toEqual(["Q1", "Q2", "Q3"]);
    expect(typeof body.durationSec).toBe("number");
    const review = screen.getByRole("list", { name: "Your answers" });
    expect(within(review).getByText("Which part catches light?")).toBeInTheDocument();
    expect(within(review).getByText(/Not yet\. Here is why: Correct answer: green pigment It is a pigment\./)).toBeInTheDocument();
    expect(within(review).getByText(/Nice work! Leaves hold chlorophyll\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Play a game" })).toHaveAttribute("href", "/play/games/l1/MATCH");
    expect(screen.getByRole("link", { name: "Back to practice" })).toHaveAttribute("href", "/play");
  });

  it("falls back to the hub when the lesson has no game, and shows a send error", async () => {
    let fail = true;
    mockFetch({
      "GET /play/practice/l1/quiz": () => ({ body: { ...pq, questions: [pq.questions[0]] } }),
      "POST /play/practice/l1/quiz": () => (fail ? { status: 500, body: { title: "x", status: 500 } } : { body: { ...presult, total: 1 } }),
      "GET /play/practice": () => ({ body: practice({ lessons: [] }) }),
    });
    renderWithProviders(<PracticeQuizView lessonId="l1" />, { scope: "student" });
    await userEvent.click(await screen.findByRole("button", { name: "Leaf" }));
    await userEvent.click(screen.getByRole("button", { name: "Send my answers" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Send my answers" }));
    expect(await screen.findByRole("link", { name: "Play a game" })).toHaveAttribute("href", "/play");
  });

  it("says when a quiz has no questions and when the student has no cookie", async () => {
    mockFetch({ "GET /play/practice/l1/quiz": () => ({ body: { ...pq, questions: [] } }) });
    const { unmount } = renderWithProviders(<PracticeQuizView lessonId="l1" />, { scope: "student" });
    expect(await screen.findByText("This quiz has no questions yet.")).toBeInTheDocument();
    unmount();
    mockFetch({ "GET /play/practice/l1/quiz": () => unauthorized });
    renderWithProviders(<PracticeQuizView lessonId="l1" />, { scope: "student" });
    expect(await screen.findByRole("link", { name: "Join your class" })).toHaveAttribute("href", "/join");
  });
});

describe("join flow lands in practice", () => {
  it("goes to /play when nothing is live or no game exists", async () => {
    mockFetch({ "GET /play/games": () => ({ body: [] }) });
    await expect(resolvePath({ participantId: "p", displayName: "S", sessionId: null, next: "home" } as never)).resolves.toBe("/play");
    await expect(resolvePath({ participantId: "p", displayName: "S", sessionId: null, next: "game" } as never)).resolves.toBe("/play");
  });
});

describe("practice helpers", () => {
  it("maps server questions and keeps matching rights out of order", () => {
    const qs = practiceQuestions(pq);
    expect(qs[0].options).toEqual(["Leaf", "Root"]);
    expect(qs[2].matching?.lefts).toEqual(["Root", "Leaf"]);
    expect([...qs[2].matching!.rights].sort()).toEqual(["Light", "Water"]);
    expect(outcomeFromPractice(presult)).toMatchObject({ xp: 12, correct: 2 });
    expect(previewQuestions(quizContent as never)[2].matching?.lefts).toEqual(["Root"]);
    expect(practiceQuestions({ ...pq, questions: [{ ...pq.questions[2], pairs: null }] })[0].matching).toBeNull();
  });

  it("grades every question type in the browser", () => {
    const content = {
      questions: [
        ...quizContent.questions,
        { ...quizContent.questions[0], id: "Q4", type: "tf", options: [{ text: "True", correct: false }, { text: "False", correct: true }] },
        { ...quizContent.questions[0], id: "Q5", type: "short", options: null, acceptedAnswers: null },
      ],
    } as never;
    const out = gradeLocally(content, [
      { questionId: "Q1", optionIndex: 0 },
      { questionId: "Q2", text: " Green-Pigment! " },
      { questionId: "Q3", pairs: [{ left: "Root", right: "Water" }] },
      { questionId: "Q4", optionIndex: 0 },
      { questionId: "Q5", text: "x" },
    ]);
    expect(out.review.map((r) => r.correct)).toEqual([true, true, true, false, false]);
    expect(out.review[3].correctAnswer).toBe("False");
    expect(out.review[2].correctAnswer).toBe("Root = Water");
    expect(out).toMatchObject({ correct: 3, total: 5, xp: null });
    expect(gradeLocally({ questions: [] }, [])).toMatchObject({ score: 0, total: 0 });
    expect(gradeLocally(content, []).correct).toBe(0);
    expect(normalizeAnswer("  A, b!  ")).toBe("a b");
  });

  it("lists every template the content can feed, whatever the band", () => {
    expect(previewGames(gameContent)).toEqual(ALL);
    expect(previewGames(null)).toEqual([]);
    expect(previewGames({ ...gameContent, statements: [], equationTiles: [] } as never)).toEqual(["MATCH", "MEMORY", "SORT"]);
  });

  it("keeps the English and Arabic keys in step for the new screens", () => {
    const keys = (o: Record<string, string>) => Object.keys(o).filter((k) => /^(practice|preview\.student|meta\.title\.(practice|preview))/.test(k) || k === "join.open.practice").sort();
    expect(keys(ar)).toEqual(keys(en));
    expect(keys(en).length).toBeGreaterThan(30);
  });
});

describe("preview as student (teacher)", () => {
  const route = (l = lesson()) => ({ "GET /lessons/l1": () => ({ body: l }) });
  const playCalls = (calls: { path: string }[]) => calls.filter((c) => c.path.startsWith("/play"));

  it("plays the lesson's own quiz and grades it locally, with the banner and no play calls", async () => {
    const { calls } = mockFetch(route());
    renderWithProviders(<PreviewAsStudent id="l1" />, { scope: "teacher" });
    expect(await screen.findByText("Preview: answers are not saved")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the workspace" })).toHaveAttribute("href", "/app/lessons/l1");
    expect(screen.getByText("Which part catches light?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Leaf" }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(await screen.findByLabelText("Your answer"), { target: { value: "green pigment" } });
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(await screen.findByLabelText("Root"), { target: { value: "Water" } });
    await userEvent.click(screen.getByRole("button", { name: "Send my answers" }));
    expect(await screen.findByText("You got 3 of 3 right.")).toBeInTheDocument();
    expect(screen.queryByText(/XP for practising/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Play again" }));
    expect(await screen.findByText("Which part catches light?")).toBeInTheDocument();
    expect(playCalls(calls)).toHaveLength(0);
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });

  it("switches to a game built from the lesson content, finishes it and never calls the play endpoints", async () => {
    const { calls } = mockFetch(route());
    renderWithProviders(<PreviewAsStudent id="l1" />, { scope: "teacher" });
    await screen.findByText("Which part catches light?");
    const group = screen.getByRole("group", { name: "What to preview" });
    expect(within(group).getAllByRole("button")).toHaveLength(6);
    await userEvent.click(within(group).getByRole("button", { name: "Sort it" }));
    expect(within(group).getByRole("button", { name: "Sort it" })).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByText("Sunlight")).toBeInTheDocument();
    expect(playCalls(calls)).toHaveLength(0);
  });

  it("finishes a round locally and offers Play again", async () => {
    const { calls } = mockFetch(route());
    renderWithProviders(<PreviewAsStudent id="l1" />, { scope: "teacher" });
    await screen.findByText("Which part catches light?");
    await userEvent.click(within(screen.getByRole("group", { name: "What to preview" })).getByRole("button", { name: "True or false rush" }));
    for (const s of gameContent.statements) {
      await screen.findByText(s.text);
      const board = within(document.querySelector(".qtf") as HTMLElement);
      await userEvent.click(board.getByRole("button", { name: s.isTrue ? "True" : "False" }));
      await userEvent.click(await screen.findByRole("button", { name: "Next" }));
    }
    await userEvent.click(await screen.findByRole("button", { name: "See my results" }));
    expect(await screen.findByText(/Nothing was saved/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Play again" }));
    expect(await screen.findByText(gameContent.statements[0].text)).toBeInTheDocument();
    expect(playCalls(calls)).toHaveLength(0);
  });

  it("renders every template in Arabic from the same content", async () => {
    mockFetch(route());
    renderWithProviders(<PreviewAsStudent id="l1" />, { scope: "teacher", locale: "ar" });
    expect(await screen.findByText("معاينة: لا تُحفظ الإجابات")).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "ماذا تعاين" });
    for (const name of ["طابِق", "بطاقات الذاكرة", "صنِّف", "رتِّب الخطوات", "صح أم خطأ"]) {
      await userEvent.click(within(group).getByRole("button", { name }));
      expect(within(group).getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");
    }
  });

  it("shows only the quiz when there is no game, and an empty state when nothing is ready", async () => {
    mockFetch(route(lesson({ resources: [resource("QUIZ", quizContent)] })));
    const { unmount } = renderWithProviders(<PreviewAsStudent id="l1" />, { scope: "teacher" });
    expect(await screen.findByText("Which part catches light?")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "What to preview" })).not.toBeInTheDocument();
    unmount();
    mockFetch(route(lesson({ resources: [resource("QUIZ", null, { status: "WORKING" })] })));
    renderWithProviders(<PreviewAsStudent id="l1" />, { scope: "teacher" });
    expect(await screen.findByText("Nothing to preview yet. Wait until the kit is ready.")).toBeInTheDocument();
  });

  it("shows an error with retry when the lesson cannot load", async () => {
    mockFetch({ "GET /lessons/l1": () => ({ status: 500, body: { title: "x", status: 500 } }) });
    renderWithProviders(<PreviewAsStudent id="l1" />, { scope: "teacher" });
    expect(await screen.findByRole("button", { name: "Try again" }, { timeout: 8000 })).toBeInTheDocument();
  });

  it("is reachable from the workspace header and from the side menu", async () => {
    mockFetch({ "GET /lessons/l1": () => ({ body: lesson() }) });
    renderWithProviders(
      <WorkspaceBridgeProvider>
        <NavItems pathname="/app/lessons/l1" isAdmin={false} onOpenLessons={jest.fn()} onOpenClasses={jest.fn()} onSignOut={jest.fn()} />
        <Workspace id="l1" />
      </WorkspaceBridgeProvider>,
      { scope: "teacher" },
    );
    const links = await screen.findAllByRole("link", { name: "Preview as student" });
    await waitFor(() => expect(screen.getAllByRole("link", { name: "Preview as student" })).toHaveLength(2));
    for (const a of screen.getAllByRole("link", { name: "Preview as student" })) expect(a).toHaveAttribute("href", "/app/lessons/l1/preview");
    expect(links.length).toBeGreaterThan(0);
  });
});
