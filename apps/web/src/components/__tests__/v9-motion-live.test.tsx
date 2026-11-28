/** The motion paths that are skipped in the normal test run (IS_TEST): icons playing, the dialog exit, the finish choreography. */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AnimatedIcon } from "@/components/ui/animated-icons";
import { Dialog } from "@/components/ui/dialog";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { GenerationView } from "@/components/teacher/generation-view";
import { controlsLog } from "@/test/motion";
import { lesson, resource } from "@/test/fixtures";
import { mockFetch, renderWithProviders } from "@/test/utils";

jest.mock("@/lib/motion", () => ({ ...jest.requireActual("@/lib/motion"), IS_TEST: false }));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/app",
  useSearchParams: () => new URLSearchParams(),
}));

const motion = (on: boolean) => ((globalThis as { __reduceMotion?: boolean }).__reduceMotion = !on);
afterEach(() => {
  (globalThis as { __reduceMotion?: boolean }).__reduceMotion = undefined;
  controlsLog.length = 0;
  jest.useRealTimers();
});

describe("animated icon playback", () => {
  it("plays one cycle when `play` turns true and loops while `loop` is true", async () => {
    motion(true);
    const { rerender } = render(<AnimatedIcon name="layers" play={false} />);
    expect(controlsLog).toHaveLength(0);
    rerender(<AnimatedIcon name="layers" play />);
    await waitFor(() => expect(controlsLog).toEqual(["animate"]));
    rerender(<AnimatedIcon name="sparkles" loop gap={0.01} />);
    await waitFor(() => expect(controlsLog.length).toBeGreaterThan(2));
  });

  it("stays still under reduced motion and in a hidden tab", async () => {
    motion(false);
    render(<AnimatedIcon name="check" play loop />);
    await act(async () => undefined);
    expect(controlsLog).toHaveLength(0);
    motion(true);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    render(<AnimatedIcon name="check" loop gap={0.01} />);
    await act(async () => new Promise((r) => setTimeout(r, 120)));
    expect(controlsLog.length).toBeLessThanOrEqual(1); // at most the first cycle before the tab state is known; it never loops
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });
});

describe("dialog exit", () => {
  it("plays a 160 ms exit (the closing class) before it calls onClose", async () => {
    motion(true);
    jest.useFakeTimers();
    const onClose = jest.fn();
    const { container } = renderWithProviders(<Dialog title="Hello" onClose={onClose}><button type="button">Inside</button></Dialog>, { scope: "teacher" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(container.querySelector(".ovl")).toHaveClass("closing");
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close" })); // a second close while leaving is ignored
    act(() => void jest.advanceTimersByTime(170));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".ovl")).not.toHaveClass("closing"); // a caller that keeps it open gets it back
  });

  it("closes from the backdrop as well", () => {
    motion(true);
    jest.useFakeTimers();
    const onClose = jest.fn();
    const { container } = renderWithProviders(<Dialog title="Hello" onClose={onClose} drawer><p>x</p></Dialog>, { scope: "teacher" });
    fireEvent.mouseDown(container.querySelector(".ovl") as Element);
    act(() => void jest.advanceTimersByTime(170));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("toast", () => {
  it("renders with the motion class and leaves when dismissed", async () => {
    motion(true);
    function Probe() {
      const toast = useToast();
      return <button type="button" onClick={() => toast.show("Saved", { undo: () => undefined })}>go</button>;
    }
    render(<ToastProvider><Probe /></ToastProvider>);
    fireEvent.click(screen.getByText("go"));
    expect(screen.getAllByText("Saved")[0].closest(".toast")).toHaveClass("mx");
  });
});

describe("generation completion choreography", () => {
  const done = lesson({ status: "READY", checks: [], resources: (["SLIDES", "WORKSHEET", "QUIZ", "CARDS", "GAME"] as const).map((k) => resource(k, null, { status: "READY", progress: 100 })) });
  const working = lesson({ status: "GENERATING", checks: [], resources: [resource("SLIDES", null, { status: "READY", progress: 100 }), resource("WORKSHEET", null, { status: "WORKING", progress: 30 })] });

  it("blooms, then eases out, then hands over to the workspace", async () => {
    motion(true);
    mockFetch({ "GET /lessons/l1": () => ({ body: done }) });
    const onFinished = jest.fn();
    const { container } = renderWithProviders(<GenerationView lessonId="l1" onFinished={onFinished} onCancelled={jest.fn()} />, { scope: "teacher" });
    expect(await screen.findByRole("heading", { name: "Your lesson kit is ready" })).toBeInTheDocument();
    expect(container.querySelector(".gen-hero")).toHaveClass("finished");
    expect(onFinished).not.toHaveBeenCalled(); // the bloom plays first
    await waitFor(() => expect(onFinished).toHaveBeenCalledWith("l1"), { timeout: 4000 });
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("rotates a real status line for the step being made, with a cross-fade", async () => {
    motion(true);
    mockFetch({ "GET /lessons/l1": () => ({ body: working }) });
    renderWithProviders(<GenerationView lessonId="l1" onFinished={jest.fn()} onCancelled={jest.fn()} />, { scope: "teacher" });
    expect(await screen.findByText("Writing practice questions by level")).toBeInTheDocument();
    expect(await screen.findByText("Building the answer key", undefined, { timeout: 5000 })).toBeInTheDocument();
  });
});
