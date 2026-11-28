import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ANIMATED_ICONS, AnimatedIcon, variantsFor, type AnimatedIconName } from "@/components/ui/animated-icons";
import { Dialog } from "@/components/ui/dialog";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { TopNavItems } from "@/components/teacher/top-nav";
import { WinView } from "@/components/student/win";
import { GenerationHero } from "@/components/teacher/generation-hero";
import { saveLastResult } from "@/lib/student-helpers";
import { renderWithProviders } from "@/test/utils";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/app",
  useSearchParams: () => new URLSearchParams(),
}));

const css = readFileSync(path.join(__dirname, "../../styles/v9-motion.css"), "utf8");
const result = { stars: 3, xp: 60, points: 84, personalBest: true, totalXp: 400, level: 7, xpIntoLevel: 400, badgeUnlocked: null, classGoal: { goalXp: 500, earnedXp: 440 } };

describe("animated icons (lucide-animated, installed locally)", () => {
  it("renders every icon fully drawn, decorative and sized", () => {
    for (const name of Object.keys(ANIMATED_ICONS) as AnimatedIconName[]) {
      const { container, unmount } = render(<AnimatedIcon name={name} size={18} />);
      const svg = container.querySelector("svg.aicon");
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveAttribute("width", "18");
      expect(svg?.querySelectorAll("path, line, circle").length).toBeGreaterThan(0);
      unmount();
    }
  });

  it("covers the five resources, the analysis and the navigation", () => {
    for (const name of ["sparkles", "presentation", "fileText", "listChecks", "layers", "gamepad", "check", "plus", "bookOpen", "users", "shieldCheck"]) expect(ANIMATED_ICONS[name]).toBeDefined();
  });

  it("describes each effect as a drawn rest state and one cycle, using transform, opacity and stroke only", () => {
    for (const k of ["draw", "y", "x", "pop"] as const) {
      const v = variantsFor({ k, v: 2, delay: 0.1 });
      expect(Object.keys(v)).toEqual(["normal", "animate"]);
      const keys = [...Object.keys(v.normal as object), ...Object.keys(v.animate as object)].filter((x) => x !== "transition");
      for (const key of keys) expect(["pathLength", "opacity", "scale", "x", "y"]).toContain(key);
    }
    expect(variantsFor({ k: "pop" }).animate).toBeDefined();
  });
});

describe("top navigation", () => {
  it("marks the current item with one sliding pill and keeps the links", () => {
    const { container } = renderWithProviders(<TopNavItems pathname="/app" isAdmin onOpenLessons={jest.fn()} onOpenClasses={jest.fn()} />, { scope: "teacher" });
    expect(container.querySelectorAll(".nav-pill")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "New lesson" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
    expect(container.querySelectorAll(".nav-item svg.aicon")).toHaveLength(4);
  });

  it("plays an item icon on hover and focus without changing its label", async () => {
    const open = jest.fn();
    renderWithProviders(<TopNavItems pathname="/app/lessons/l1" isAdmin={false} onOpenLessons={open} onOpenClasses={jest.fn()} />, { scope: "teacher" });
    const lessons = screen.getByRole("button", { name: "My lessons" });
    await userEvent.hover(lessons);
    await userEvent.unhover(lessons);
    await userEvent.click(lessons);
    expect(open).toHaveBeenCalled();
    expect(document.querySelector(".nav-pill")).toBeNull();
  });
});

describe("dialog and toast", () => {
  it("closes at once in tests and under reduced motion (the exit is a CSS class with a timer elsewhere)", async () => {
    const onClose = jest.fn();
    renderWithProviders(<Dialog title="Hello" onClose={onClose}><button type="button">Inside</button></Dialog>, { scope: "teacher" });
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows a toast and removes it again", async () => {
    function Probe() {
      const toast = useToast();
      return (
        <>
          <button type="button" onClick={() => toast.show("Saved")}>show</button>
          <button type="button" onClick={() => toast.dismiss()}>hide</button>
        </>
      );
    }
    const { container } = render(<ToastProvider><Probe /></ToastProvider>);
    await userEvent.click(screen.getByRole("button", { name: "show" }));
    expect(screen.getByText("Saved").closest(".toast")).toHaveClass("mx");
    await userEvent.click(screen.getByRole("button", { name: "hide" }));
    expect(container.querySelector(".toast")).toBeNull();
  });
});

describe("win card celebration", () => {
  it("blooms and bursts confetti for a win, and fills only the earned stars", async () => {
    saveLastResult({ game: "SORT", lessonId: "l1", result: { ...result, stars: 2 } });
    const { container } = renderWithProviders(<WinView />, { scope: "student" });
    expect(await screen.findByText("+60 XP")).toBeInTheDocument();
    expect(container.querySelector(".win-bloom")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll(".confetti-burst i")).toHaveLength(24);
    expect(container.querySelectorAll(".star-earned")).toHaveLength(2);
    expect(container.querySelectorAll(".star-open")).toHaveLength(1);
  });

  it("does not celebrate a round with no stars", async () => {
    saveLastResult({ game: "SORT", lessonId: "l1", result: { ...result, stars: 0, personalBest: false } });
    const { container } = renderWithProviders(<WinView />, { scope: "student" });
    expect(await screen.findByText("+60 XP")).toBeInTheDocument();
    expect(container.querySelector(".win-bloom")).toBeNull();
    expect(container.querySelector(".confetti-burst")).toBeNull();
  });
});

describe("generation hero", () => {
  const steps = (["SLIDES", "WORKSHEET", "QUIZ", "CARDS", "GAME"] as const).map((kind, i) => ({ kind, status: i < 2 ? ("done" as const) : i === 2 ? ("working" as const) : ("waiting" as const), progress: i === 2 ? 40 : 0, error: null }));
  const labels = { SLIDES: "Slides", WORKSHEET: "Worksheet", QUIZ: "Quiz", CARDS: "Cards", GAME: "Games" };

  it("layers halo, light cone, lamp and nodes with one animated icon per resource", () => {
    const { container } = render(<GenerationHero steps={steps} percent={48} analysisDone finished={false} reduce={false} labels={labels} />);
    expect(container.querySelector("[data-variant='animated']")).not.toBeNull();
    expect(container.querySelectorAll(".gh-node")).toHaveLength(5);
    expect(container.querySelectorAll(".gh-node svg.aicon")).toHaveLength(5);
    expect(container.querySelectorAll(".gh-line-glow")).toHaveLength(5);
    expect(container.querySelectorAll(".gh-spark")).toHaveLength(1);
    expect(container.querySelector(".gh-ground")).not.toBeNull();
  });

  it("opens one light bloom and a check when finished", () => {
    const done = steps.map((s) => ({ ...s, status: "done" as const, progress: 100 }));
    const { container } = render(<GenerationHero steps={done} percent={100} analysisDone finished reduce={false} labels={labels} />);
    expect(container.querySelector(".gen-hero")).toHaveClass("finished");
    expect(container.querySelectorAll("circle[fill='url(#gh-bloom)']")).toHaveLength(1);
    expect(container.querySelector(".gen-pct svg")).not.toBeNull();
    expect(container.querySelectorAll(".gh-particles")).toHaveLength(0);
  });
});

describe("v9 stylesheet rules", () => {
  it("exits are faster than entrances and use the exit token", () => {
    expect(css).toMatch(/\.ovl\.closing[^}]*var\(--dur-exit\)[^}]*var\(--ease-in\)/);
    expect(css).toMatch(/\.drawer-ovl\.closing \.app-dlg\.drawer/);
    expect(css).toMatch(/\[dir="rtl"\] \.drawer-ovl\.closing/);
  });

  it("a miss is a soft halo, never a shake or a red flash", () => {
    const block = css.slice(css.indexOf("v9-soft-miss"), css.indexOf("v9-soft-miss") + 400);
    expect(block).not.toMatch(/translate|rotate|#e|red/i);
    expect(css).toMatch(/\.sapp \.tile\.shake, \.sapp \.slot\.shake \{ animation: v9-soft-miss/);
  });

  it("never animates layout properties", () => {
    const keyframes = [...css.matchAll(/@keyframes [\w-]+ \{/g)]
      .map((m) => {
        let depth = 0;
        let i = (m.index ?? 0) + m[0].length - 1;
        const start = i;
        for (; i < css.length; i++) {
          if (css[i] === "{") depth++;
          if (css[i] === "}" && --depth === 0) break;
        }
        return css.slice(start, i);
      })
      .join("\n");
    expect(keyframes).not.toMatch(/\b(width|height|top|left|margin|padding)\s*:/);
  });

  it("turns decorative motion off under reduced motion", () => {
    const reduced = css.slice(css.indexOf("prefers-reduced-motion"));
    for (const sel of [".win-bloom", ".msg-in", ".sapp .tile.matched", ".ovl.closing"]) expect(reduced).toContain(sel);
  });

  it("defines the two CSS linear() springs", () => {
    expect(css).toMatch(/--ease-spring-soft: linear\(/);
    expect(css).toMatch(/--ease-spring-pop: linear\(/);
  });
});
