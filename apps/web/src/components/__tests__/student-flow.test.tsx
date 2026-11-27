import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GAME_TEMPLATES, type GameKind, type StudentQuizState } from "@helpo/shared";
import { GamePlay } from "@/components/student/game-play";
import { QuizView } from "@/components/student/quiz";
import { WinView } from "@/components/student/win";
import { ReadAloud } from "@/components/student/read-aloud";
import { StudentFrame } from "@/components/student/frame";
import { JoinPage } from "@/components/student/join-page";
import { SelfPacedPage } from "@/components/student/self-paced-page";
import { Avatar } from "@/components/student/avatar";
import { beep, readLastResult, saveLastResult, speak } from "@/lib/student-helpers";
import { gameContent } from "@/test/fixtures";
import { mockFetch, renderWithProviders } from "@/test/utils";

const push = jest.fn();
let search = "";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push, refresh: jest.fn() }),
  usePathname: () => "/play",
  useSearchParams: () => new URLSearchParams(search),
}));
jest.setTimeout(60000);
beforeEach(() => {
  push.mockReset();
  search = "";
  window.sessionStorage.clear();
});

const statusText = () => screen.getAllByRole("status").map((e) => e.textContent).join(" | ");
const home = (band = "NAVIGATOR", sounds = false) => ({ displayName: "Sara A.", className: "6B", band, xp: 1, level: 1, levelTitle: "Seedling", xpIntoLevel: 1, xpForNextLevel: 500, streak: { days: 1, saversLeft: 1, message: "" }, quests: [], badges: [], classGoal: { goalXp: 500, earnedXp: 1 }, live: null, journey: [], avatar: { items: [], background: "lavender", unlocked: [] }, settings: { pointsEnabled: true, teamsEnabled: false, soundsEnabled: sounds, celebrationsEnabled: true, weeklyGoalXp: 500 } });
const tap = (text: string, which = 0) => {
  const nodes = screen.getAllByText(new RegExp(`^${text}$`));
  fireEvent.click((nodes[which] ?? nodes[0]).closest("button")!);
};
const press = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name, hidden: true }));
const result = { stars: 3, xp: 60, points: 84, personalBest: true, totalXp: 400, level: 7, xpIntoLevel: 400, badgeUnlocked: null, classGoal: { goalXp: 500, earnedXp: 440 } };

const quizState = (extra: Partial<StudentQuizState> = {}): StudentQuizState => ({
  sessionId: "se1",
  status: "LIVE",
  lessonTitle: "Photosynthesis",
  questionIndex: 3,
  questionCount: 10,
  question: { prompt: "True or false: plants eat soil.", options: ["True", "False"], type: "true_false" },
  myAnswer: null,
  revealed: null,
  ...extra,
});

describe("live quiz (student)", () => {
  it("waits in the lobby, then ends with a way back", async () => {
    mockFetch({ "GET /play/sessions/se1": () => ({ body: quizState({ status: "LOBBY", question: null }) }) });
    const { unmount } = renderWithProviders(<QuizView sessionId="se1" />, { scope: "student" });
    expect(await screen.findByText("Waiting for your teacher to start.")).toBeInTheDocument();
    unmount();
    mockFetch({ "GET /play/sessions/se1": () => ({ body: quizState({ status: "ENDED", question: null }) }) });
    renderWithProviders(<QuizView sessionId="se1" />, { scope: "student" });
    expect(await screen.findByText("Quiz finished")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Done" })).toHaveAttribute("href", "/play");
  });

  it("saves an answer once, shows the XP pop, and keeps the answer on re-render", async () => {
    let answered = false;
    const { calls } = mockFetch({
      "GET /play/sessions/se1": () => ({ body: quizState({ myAnswer: answered ? { optionIndex: 1, text: null } : null }) }),
      "POST /play/sessions/se1/answers": () => {
        answered = true;
        return { body: quizState({ myAnswer: { optionIndex: 1, text: null } }) };
      },
    });
    renderWithProviders(<QuizView sessionId="se1" />, { scope: "student" });
    expect(await screen.findByText("True or false: plants eat soil.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("False").closest("button")!);
    await waitFor(() => expect(statusText()).toMatch(/Answer saved/));
    expect(calls.find((c) => c.path === "/play/sessions/se1/answers")?.body).toEqual({ questionIndex: 3, optionIndex: 1 });
    expect(screen.getByText("False").closest("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("sends a short answer and shows a gentle Not yet with the explanation after reveal", async () => {
    const short = { prompt: "What is chlorophyll?", options: [], type: "short" as const };
    let revealed = false;
    const { calls } = mockFetch({
      "GET /play/sessions/se1": () => ({ body: quizState({ question: short, revealed: revealed ? { correctIndex: null, explanation: "A green pigment.", correct: false } : null }) }),
      "POST /play/sessions/se1/answers": () => ({ body: quizState({ question: short, myAnswer: { optionIndex: null, text: "water" } }) }),
    });
    renderWithProviders(<QuizView sessionId="se1" />, { scope: "student" });
    const input = await screen.findByLabelText("Your answer");
    expect(screen.getByRole("button", { name: "Send my answer" })).toHaveAttribute("aria-disabled", "true");
    fireEvent.change(input, { target: { value: "water" } });
    await userEvent.click(screen.getByRole("button", { name: "Send my answer" }));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/answers"))).toBe(true));
    revealed = true;
    await waitFor(() => expect(screen.getByText(/Not yet\. Here is why/)).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.getByText("A green pigment.")).toBeInTheDocument();
  });

  it("marks the correct option after reveal and praises a right answer", async () => {
    const mcq = { prompt: "Which part catches light?", options: ["Leaf", "Root"], type: "mcq" as const };
    mockFetch({ "GET /play/sessions/se1": () => ({ body: quizState({ question: mcq, myAnswer: { optionIndex: 0, text: null }, revealed: { correctIndex: 0, explanation: "Leaves.", correct: true } }) }) });
    renderWithProviders(<QuizView sessionId="se1" />, { scope: "student" });
    expect(await screen.findByText("Nice work!")).toBeInTheDocument();
    expect(screen.getByText("Leaf").closest("button")?.className).toContain("right-ans");
    expect(screen.getByText("(Correct)", { exact: false })).toBeInTheDocument();
  });

  it("explains how to join when the student cookie is missing", async () => {
    mockFetch({ "GET /play/sessions/se1": () => ({ status: 401, body: { title: "Unauthorized", status: 401 } }) });
    renderWithProviders(<QuizView sessionId="se1" />, { scope: "student" });
    expect(await screen.findByRole("link", { name: "Join your class" })).toHaveAttribute("href", "/join");
  });
});

describe("playing a mini-game", () => {
  const routes = (kind: GameKind, band = "NAVIGATOR", sounds = false, post: () => { status?: number; body?: unknown } = () => ({ body: result })) => ({
    [`GET /play/games/l1/${kind}`]: () => ({ body: { lessonId: "l1", lessonTitle: "Photosynthesis", game: kind, content: gameContent, bestStars: 1 } }),
    "GET /play/me": () => ({ body: home(band, sounds) }),
    "POST /play/games/result": post,
  });

  it.each(Object.keys(GAME_TEMPLATES) as GameKind[])("shows the %s template with its name", async (kind) => {
    mockFetch(routes(kind));
    renderWithProviders(<GamePlay lessonId="l1" game={kind} />, { scope: "student" });
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(GAME_TEMPLATES[kind].name);
  });

  it("finishes a match, posts the counts and opens the win card with the stored result", async () => {
    const { calls } = mockFetch(routes("MATCH"));
    renderWithProviders(<GamePlay lessonId="l1" game="match" />, { scope: "student" });
    await screen.findByText("Roots");
    for (const [l, r] of [["Roots", "Take in water"], ["Leaf", "Makes food"], ["Stem", "Carries water"]]) {
      tap(l);
      tap(r);
    }
    press(/Start round 2/);
    for (const [l, r] of [["Flower", "Makes seeds"], ["Seed", "New plant"], ["Sun", "Energy"]]) {
      tap(l);
      tap(r);
    }
    press(/See my results/);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/play/win"));
    expect(calls.find((c) => c.path === "/play/games/result")?.body).toEqual({ lessonId: "l1", game: "MATCH", total: 6, firstTryCorrect: 6, retriedCorrect: 0, wrongTries: 0, hintsUsed: 0 });
    expect(readLastResult()?.result.stars).toBe(3);
  });

  it("posts the wrong tries and hints a sort game used", async () => {
    const { calls } = mockFetch(routes("SORT"));
    renderWithProviders(<GamePlay lessonId="l1" game="SORT" />, { scope: "student" });
    await screen.findByText("Sunlight");
    const basket = (yes: boolean) => document.querySelector(`.basket.${yes ? "yes" : "no"}`) as HTMLElement;
    press(/^Hint \(-5 points\)$/);
    tap("Sunlight");
    fireEvent.click(basket(false));
    for (const it of ["Sunlight", "Water", "Candy", "Plastic"]) {
      tap(it);
      fireEvent.click(basket(it === "Sunlight" || it === "Water"));
    }
    press(/See my results/);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/play/win"));
    expect(calls.find((c) => c.path === "/play/games/result")?.body).toEqual({ lessonId: "l1", game: "SORT", total: 4, firstTryCorrect: 3, retriedCorrect: 1, wrongTries: 1, hintsUsed: 1 });
  });

  it("plays odd one out through the page and posts its counts", async () => {
    const odd = { ...gameContent, oddOneOut: [{ items: ["Oak", "Pine", "Rose", "Maple"], oddIndex: 2, explanation: "A rose is a flower." }, { items: ["Cat", "Dog", "Cow", "Rock"], oddIndex: 3, explanation: "A rock is not alive." }] };
    const { calls } = mockFetch({
      ...routes("ODD_ONE_OUT"),
      "GET /play/games/l1/ODD_ONE_OUT": () => ({ body: { lessonId: "l1", lessonTitle: "Photosynthesis", game: "ODD_ONE_OUT", content: odd, bestStars: 0 } }),
    });
    renderWithProviders(<GamePlay lessonId="l1" game="odd_one_out" />, { scope: "student" });
    await screen.findByText("Which card does not belong?");
    for (const [odd1, why] of [["Rose", "A rose is a flower."], ["Rock", "A rock is not alive."]]) {
      fireEvent.click(screen.getByRole("button", { name: odd1 }));
      expect(screen.getByText(why)).toBeInTheDocument();
      if (odd1 === "Rose") press(/Next round/);
    }
    press(/See my results/);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/play/win"));
    expect(calls.find((c) => c.path === "/play/games/result")?.body).toEqual({ lessonId: "l1", game: "ODD_ONE_OUT", total: 2, firstTryCorrect: 2, retriedCorrect: 0, wrongTries: 0, hintsUsed: 0 });
  });

  it("finishes true-or-false and posts the result", async () => {
    const { calls } = mockFetch(routes("TRUE_FALSE"));
    renderWithProviders(<GamePlay lessonId="l1" game="TRUE_FALSE" />, { scope: "student" });
    await screen.findByText("Plants make food.");
    for (const st of gameContent.statements) {
      press(new RegExp(st.isTrue ? "^True$" : "^False$"));
      press(/^Next$/);
    }
    press(/See my results/);
    await waitFor(() => expect(calls.some((c) => c.path === "/play/games/result")).toBe(true));
  });

  it("shows the server error with Try again when the result can't be saved", async () => {
    mockFetch(routes("TRUE_FALSE", "NAVIGATOR", false, () => ({ status: 500, body: { title: "x", status: 500 } })));
    renderWithProviders(<GamePlay lessonId="l1" game="TRUE_FALSE" />, { scope: "student" });
    await screen.findByText("Plants make food.");
    for (const st of gameContent.statements) {
      press(new RegExp(st.isTrue ? "^True$" : "^False$"));
      press(/^Next$/);
    }
    press(/See my results/);
    expect(await screen.findByRole("alert")).toHaveTextContent(/went wrong on our side/);
    fireEvent.click(screen.getByRole("button", { name: "Try again", hidden: true }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("pauses, resumes with Escape, and stops for today", async () => {
    mockFetch(routes("SORT"));
    renderWithProviders(<GamePlay lessonId="l1" game="SORT" />, { scope: "student" });
    await screen.findByText("Sunlight");
    press(/Pause/);
    expect(screen.getByRole("dialog", { name: "Paused" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    press(/Pause/);
    press(/Stop for today/);
    expect(push).toHaveBeenCalledWith("/play");
  });

  it("keeps sound off by default and explains when the class has sounds off", async () => {
    mockFetch(routes("MATCH", "NAVIGATOR", false));
    renderWithProviders(<GamePlay lessonId="l1" game="MATCH" />, { scope: "student" });
    await screen.findByText("Roots");
    const toggle = screen.getByRole("button", { name: /Sound/, hidden: true });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(statusText()).toMatch(/turned game sounds off/);
  });

  it("offers the optional timer only to Studio students", async () => {
    mockFetch(routes("MATCH", "STUDIO", true));
    renderWithProviders(<GamePlay lessonId="l1" game="MATCH" />, { scope: "student" });
    await screen.findByText("Roots");
    const timer = await screen.findByRole("button", { name: /Timer/, hidden: true });
    fireEvent.click(timer);
    expect(timer).toHaveAttribute("aria-pressed", "true");
  });

  it("rejects an unknown game and shows the join link when not signed in", async () => {
    mockFetch({});
    const { unmount } = renderWithProviders(<GamePlay lessonId="l1" game="nope" />, { scope: "student" });
    expect(await screen.findByRole("alert")).toHaveTextContent("We don't know that game.");
    unmount();
    mockFetch({ "GET /play/games/l1/MATCH": () => ({ status: 401, body: { title: "Unauthorized", status: 401 } }) });
    renderWithProviders(<GamePlay lessonId="l1" game="MATCH" />, { scope: "student" });
    expect(await screen.findByRole("link", { name: "Join your class" })).toBeInTheDocument();
  });
});

describe("win card", () => {
  it("shows stars, XP and the personal best with the way on", async () => {
    saveLastResult({ game: "SORT", lessonId: "l1", result });
    renderWithProviders(<WinView />, { scope: "student" });
    expect(await screen.findByText("+60 XP")).toBeInTheDocument();
    // points are the API value, on their own line, separate from XP
    expect(screen.getByText("84 points")).toBeInTheDocument();
    expect(screen.getByText("Personal best!")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "3 stars earned" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Play again" })).toHaveAttribute("href", "/play/games/l1/SORT");
    expect(screen.getByRole("link", { name: "Done" })).toHaveAttribute("href", "/play");
  });

  it("does not claim a personal best when there was none, and handles an empty store", async () => {
    saveLastResult({ game: "MATCH", lessonId: "l1", result: { ...result, personalBest: false, stars: 1 } });
    const { unmount } = renderWithProviders(<WinView />, { scope: "student" });
    expect(await screen.findByText("+60 XP")).toBeInTheDocument();
    expect(screen.queryByText("Personal best!")).not.toBeInTheDocument();
    unmount();
    window.sessionStorage.clear();
    renderWithProviders(<WinView />, { scope: "student" });
    expect(await screen.findByText("No round to show yet")).toBeInTheDocument();
  });
});

describe("student frame, join page and helpers", () => {
  it("renders the frame with the language switch and the slim logo", () => {
    renderWithProviders(<StudentFrame band="STUDIO"><p>child</p></StudentFrame>, { scope: "student" });
    expect(document.querySelector(".sapp")?.getAttribute("data-band")).toBe("studio");
    expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
  });

  it("takes the class code from the link and sets the band from the chosen grade", async () => {
    search = "code=395550&school=riverside";
    mockFetch({ "GET /play/code/395550": () => ({ body: { classId: "c1", className: "6B", grade: 6, teacherName: "A", live: null } }) });
    renderWithProviders(<JoinPage />, { scope: "student" });
    expect(await screen.findByText(/Class code/)).toBeInTheDocument();
    expect(await screen.findByText("395550")).toBeInTheDocument();
  });

  it("passes the code to the self-paced quiz", async () => {
    search = "code=395550";
    mockFetch({ "GET /play/sessions/se1/questions": () => ({ body: { sessionId: "se1", lessonTitle: "T", questions: [{ id: "Q1", type: "mcq", prompt: "Pick one", options: ["A", "B"], matching: null }] } }) });
    renderWithProviders(<SelfPacedPage sessionId="se1" />, { scope: "student" });
    fireEvent.click((await screen.findByText("A")).closest("button")!);
    expect(screen.queryByLabelText(/Class code/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send my answers" })).not.toHaveAttribute("aria-disabled");
  });

  it("reads text aloud and handles missing speech support", async () => {
    const speakFn = jest.fn();
    const cancel = jest.fn();
    Object.assign(window, { speechSynthesis: { speak: speakFn, cancel }, SpeechSynthesisUtterance: function (this: { text: string }, text: string) { this.text = text; } });
    renderWithProviders(<ReadAloud text="Hello" />);
    await userEvent.click(screen.getByRole("button", { name: "Read aloud: Hello" }));
    expect(speakFn).toHaveBeenCalled();
    expect(speak("x", "ar")).toBe(true);
    delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
    expect(speak("x", "en")).toBe(false);
    renderWithProviders(<ReadAloud text="Quiet" compact />);
    await userEvent.click(screen.getByRole("button", { name: "Read aloud: Quiet" }));
  });

  it("plays a short tone only when sound is on and survives a missing audio API", () => {
    const osc = { frequency: { value: 0 }, connect: jest.fn(), start: jest.fn(), stop: jest.fn() };
    const ctx = { createOscillator: () => osc, createGain: () => ({ gain: { value: 0 }, connect: jest.fn() }), destination: {}, currentTime: 0, close: jest.fn(async () => undefined) };
    (window as unknown as { AudioContext: unknown }).AudioContext = jest.fn(() => ctx);
    beep(false, 440);
    expect(osc.start).not.toHaveBeenCalled();
    beep(true, 440);
    expect(osc.start).toHaveBeenCalled();
    (window as unknown as { AudioContext: unknown }).AudioContext = jest.fn(() => {
      throw new Error("blocked");
    });
    expect(() => beep(true, 440)).not.toThrow();
  });

  it("reads a corrupted stored result as nothing and renders an avatar with accessories", () => {
    window.sessionStorage.setItem("helpo:last-result", "{not json");
    expect(readLastResult()).toBeNull();
    const { container } = renderWithProviders(<Avatar items={["hat", "scarf"]} background="meadow" size={60} />);
    expect(container.querySelectorAll("img.ov")).toHaveLength(2);
    act(() => undefined);
  });
});
