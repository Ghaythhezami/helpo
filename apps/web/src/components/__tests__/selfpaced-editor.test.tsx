import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SelfPacedQuiz } from "@/components/student/self-paced";
import { ItemEditor } from "@/components/teacher/item-editor";
import { resolvePath } from "@/components/student/join-flow";
import { buildSubmitBody } from "@/lib/self-paced";
import { cardsContent, quizContent, resource, slidesContent, worksheetContent } from "@/test/fixtures";
import { mockFetch, renderWithProviders } from "@/test/utils";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: push, refresh: jest.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));
jest.setTimeout(60000);

const questions = {
  sessionId: "se1",
  lessonTitle: "Plants",
  questions: [
    { id: "Q1", type: "mcq", prompt: "Which part catches light?", options: ["Leaf", "Root"], matching: null },
    { id: "Q2", type: "short", prompt: "What is chlorophyll?", options: null, matching: null },
    { id: "Q3", type: "matching", prompt: "Match", options: null, matching: { lefts: ["Root"], rights: ["Water", "Light"] } },
  ],
};

describe("self-paced quiz", () => {
  it("asks one question at a time and submits everything at once with the duration", async () => {
    const { calls } = mockFetch({
      "GET /play/sessions/se1/questions": () => ({ body: questions }),
      "POST /play/482913/submit": () => ({ body: { score: 1, correct: 3, total: 3, xp: 30, durationSec: 5, review: [{ questionId: "Q1", correct: true, correctIndex: 0, explanation: "Leaves." }] } }),
    });
    renderWithProviders(<SelfPacedQuiz sessionId="se1" code="482913" />, { scope: "student" });
    expect(await screen.findByText("Which part catches light?")).toBeInTheDocument();
    const next = screen.getByRole("button", { name: "Next" });
    expect(next).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(screen.getByRole("button", { name: "Leaf" }));
    await userEvent.click(next);
    fireEvent.change(await screen.findByLabelText("Your answer"), { target: { value: "green pigment" } });
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(await screen.findByLabelText("Root"), { target: { value: "Water" } });
    await userEvent.click(screen.getByRole("button", { name: "Send my answers" }));
    expect(await screen.findByText("You got 3 of 3 right.")).toBeInTheDocument();
    const body = calls.find((c) => c.path === "/play/482913/submit")!.body as { answers: unknown[]; durationSec: number };
    expect(body.answers).toHaveLength(3);
    expect(typeof body.durationSec).toBe("number");
  });

  it("asks for the class code when the student did not join by code", async () => {
    mockFetch({ "GET /play/sessions/se1/questions": () => ({ body: { ...questions, questions: [questions.questions[0]] } }) });
    renderWithProviders(<SelfPacedQuiz sessionId="se1" />, { scope: "student" });
    await userEvent.click(await screen.findByRole("button", { name: "Leaf" }));
    expect(screen.getByLabelText(/Class code/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send my answers" })).toHaveAttribute("aria-disabled", "true");
  });

  it("builds a bounded submit body", () => {
    expect(buildSubmitBody([{ questionId: "Q1", optionIndex: 1 }], 1000, 6400).durationSec).toBe(5);
    expect(buildSubmitBody([], 0, 10 * 3600 * 1000).durationSec).toBe(4 * 3600);
  });

  it("routes an ASSIGNMENT join to /play/self and a live game to the games list", async () => {
    mockFetch({ "GET /play/sessions/se1/questions": () => ({ body: questions }), "GET /play/sessions/se2/questions": () => ({ status: 409, body: { title: "Conflict", status: 409 } }), "GET /play/games": () => ({ body: [{ lessonId: "l1", game: "MATCH", assigned: false }] }) });
    await expect(resolvePath({ participantId: "p", displayName: "S", sessionId: "se1", next: "game" }, "482913")).resolves.toBe("/play/self/se1?code=482913");
    await expect(resolvePath({ participantId: "p", displayName: "S", sessionId: "se2", next: "game" })).resolves.toBe("/play/games/l1/MATCH");
  });
});

describe("right-margin item editor", () => {
  it("edits a slide title and text and saves", async () => {
    const onSave = jest.fn();
    renderWithProviders(<ItemEditor resource={resource("SLIDES", slidesContent)} index={1} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New title" } });
    fireEvent.change(screen.getByLabelText(/Text/), { target: { value: "One\nTwo" } });
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const saved = onSave.mock.calls[0][0];
    expect(saved.slides[1]).toMatchObject({ title: "New title", bullets: ["One", "Two"] });
  });

  it("edits a quiz question with its options and correct answer", async () => {
    const onSave = jest.fn();
    renderWithProviders(<ItemEditor resource={resource("QUIZ", quizContent)} index={0} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "Edited?" } });
    await userEvent.click(screen.getAllByRole("radio")[1]);
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const q = onSave.mock.calls[0][0].questions[0];
    expect(q.prompt).toBe("Edited?");
    expect(q.options[1].correct).toBe(true);
  });

  it("edits a card and a worksheet section", async () => {
    const onSave = jest.fn();
    const { unmount } = renderWithProviders(<ItemEditor resource={resource("CARDS", cardsContent)} index={0} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Front"), { target: { value: "Front!" } });
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave.mock.calls[0][0].cards[0].front).toBe("Front!");
    unmount();
    renderWithProviders(<ItemEditor resource={resource("WORKSHEET", worksheetContent)} index={0} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Section heading"), { target: { value: "Heading!" } });
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSave.mock.calls[1][0].sections[0].heading).toBe("Heading!"));
  });
});
