import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Confetti, CountUp, Skeleton } from "@/components/ui/motion";
import { Tabs } from "@/components/ui/tabs";
import { stagger } from "@/lib/motion";
import { renderWithProviders } from "@/test/utils";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/app",
  useSearchParams: () => new URLSearchParams(),
}));

const css = readFileSync(path.join(__dirname, "../../styles/v7.css"), "utf8");

describe("v7 motion primitives", () => {
  it("CountUp renders the final value in the DOM from the first paint", () => {
    render(<CountUp value={74} format={(n) => `${Math.round(n)}%`} />);
    expect(screen.getByText("74%")).toBeInTheDocument();
  });

  it("Confetti is decorative and hidden from assistive tech", () => {
    const { container } = render(<Confetti pieces={6} />);
    const burst = container.querySelector(".confetti-burst");
    expect(burst).toHaveAttribute("aria-hidden", "true");
    expect(burst?.querySelectorAll("i")).toHaveLength(6);
  });

  it("Skeleton is hidden from assistive tech and shaped by its props", () => {
    const { container } = render(<Skeleton block={{ h: 40 }} lines={3} />);
    expect(container.querySelector(".sk")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll(".sk-l")).toHaveLength(3);
    expect(container.querySelectorAll(".sk-b")).toHaveLength(1);
  });

  it("stagger is capped so long lists do not feel slow", () => {
    expect(stagger(1)).toBeCloseTo(0.04);
    expect(stagger(100)).toBe(0.4);
  });

  it("Tabs draws one sliding indicator, on the selected tab only", () => {
    renderWithProviders(<Tabs group="t" label="Tabs" value="b" onChange={() => undefined} tabs={[{ id: "a", label: "A" }, { id: "b", label: "B" }]} />);
    const selected = screen.getByRole("tab", { name: "B" });
    expect(selected.querySelector(".tab-ind")).not.toBeNull();
    expect(screen.getByRole("tab", { name: "A" }).querySelector(".tab-ind")).toBeNull();
  });
});

describe("v7.css contract", () => {
  it("defines the motion, elevation and focus tokens", () => {
    for (const token of ["--dur-fast", "--dur-enter", "--ease-out", "--e1", "--e2", "--e3", "--focus-ring", "--fs-md", "--r-lg", "--sp-4"]) expect(css).toContain(`${token}:`);
  });

  it("animates only transform, opacity and SVG strokes (no layout properties in keyframes)", () => {
    const frames = [...css.matchAll(/@keyframes[^{]+\{([\s\S]*?)\n\}/g)].map((m) => m[1]).join("\n");
    expect(frames).not.toMatch(/\b(width|height|top|left|right|bottom|margin|padding)\s*:/);
  });

  it("has a reduced-motion fallback that removes confetti and shimmer", () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*\.confetti-burst \{ display: none; \}/);
  });
});
