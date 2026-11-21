"use client";
/* eslint-disable react-hooks/refs -- the hook returns a callback ref and event handlers; no ref.current is read while rendering */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Eraser, Maximize2, Minimize2, Minus, PenLine, Trash2, Undo2, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { BOARD_COLORS, BOARD_SIZES, drawStrokes, loadStrokes, saveStrokes, undoStroke, type Stroke } from "@/lib/whiteboard";

/** Canvas drawing with pointer events (mouse, pen, touch). Strokes are stored normalised, so resizing redraws cleanly. */
export function useDrawing(storageKey: string, enabled = true) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const [tool, setTool] = useState<"pencil" | "eraser">("pencil");
  const [color, setColor] = useState<string>(BOARD_COLORS[0]);
  const [size, setSize] = useState<number>(BOARD_SIZES[1]);
  const [count, setCount] = useState(0);

  const redraw = useCallback(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = el.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    el.width = Math.round(width * dpr);
    el.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawStrokes(ctx, width, height, strokes.current);
  }, []);

  useEffect(() => {
    strokes.current = loadStrokes(storageKey);
    setCount(strokes.current.length);
    redraw();
  }, [storageKey, redraw]);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !enabled || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(redraw);
    ro.observe(el);
    return () => ro.disconnect();
  }, [redraw, enabled]);

  const commit = useCallback(() => {
    saveStrokes(storageKey, strokes.current);
    setCount(strokes.current.length);
  }, [storageKey]);

  const undo = useCallback(() => {
    strokes.current = undoStroke(strokes.current);
    commit();
    redraw();
  }, [commit, redraw]);

  const clear = useCallback(() => {
    strokes.current = [];
    commit();
    redraw();
  }, [commit, redraw]);

  const point = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, p: e.pressure || 0.5 };
  };
  const handlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      current.current = { tool, color, size, points: [point(e)] };
      strokes.current = [...strokes.current, current.current];
      redraw();
    },
    onPointerMove: (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!current.current) return;
      current.current.points.push(point(e));
      redraw();
    },
    onPointerUp: () => {
      if (!current.current) return;
      current.current = null;
      commit();
    },
    onPointerCancel: () => {
      current.current = null;
    },
  };

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key.toLowerCase() === "p") setTool("pencil");
        else if (e.key.toLowerCase() === "e") setTool("eraser");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, enabled]);

  const ui = { tool, setTool, color, setColor, size, setSize, count, undo, clear };
  const canvasRef = useCallback((el: HTMLCanvasElement | null) => {
    canvas.current = el;
  }, []);
  return { canvasRef, handlers, ui };
}

export type DrawingUi = ReturnType<typeof useDrawing>["ui"];

/** Pencil, eraser, colours, stroke size, undo and clear. Shared by the floating board and the draw-on-slide layer. */
export function BoardToolbar({ d, compact }: { d: DrawingUi; compact?: boolean }) {
  const { t } = useI18n();
  return (
    <div className={`board-tools ${compact ? "compact" : ""}`} role="toolbar" aria-label={t("board.tools")}>
      <button type="button" className="tool" aria-pressed={d.tool === "pencil"} onClick={() => d.setTool("pencil")} aria-label={t("board.pencil")} title="P">
        <PenLine className="ic" aria-hidden="true" />
      </button>
      <button type="button" className="tool" aria-pressed={d.tool === "eraser"} onClick={() => d.setTool("eraser")} aria-label={t("board.eraser")} title="E">
        <Eraser className="ic" aria-hidden="true" />
      </button>
      <span className="swatches" role="group" aria-label={t("board.colors")}>
        {BOARD_COLORS.map((c) => (
          <button key={c} type="button" className="swatch" style={{ background: c }} aria-label={t("board.color", { color: c })} aria-pressed={d.color === c && d.tool === "pencil"} onClick={() => { d.setColor(c); d.setTool("pencil"); }} />
        ))}
      </span>
      <span className="sizes" role="group" aria-label={t("board.size")}>
        {BOARD_SIZES.map((s) => (
          <button key={s} type="button" className="tool" aria-pressed={d.size === s} aria-label={t("board.sizeN", { n: s })} onClick={() => d.setSize(s)}>
            <i style={{ width: s + 4, height: s + 4 }} />
          </button>
        ))}
      </span>
      <button type="button" className="tool" onClick={d.undo} disabled={d.count === 0} aria-label={t("board.undo")} title="Ctrl+Z"><Undo2 className="ic" aria-hidden="true" /></button>
      <button type="button" className="tool" onClick={d.clear} disabled={d.count === 0} aria-label={t("board.clear")}><Trash2 className="ic" aria-hidden="true" /></button>
    </div>
  );
}

/** "Draw on slide": a transparent canvas over the centre resource, with its own small toolbar. */
export function DrawLayer({ storageKey }: { storageKey: string }) {
  const { t } = useI18n();
  const dr = useDrawing(storageKey);
  return (
    <>
      <canvas ref={dr.canvasRef} className="draw-layer" aria-label={t("board.canvas")} role="img" {...dr.handlers} />
      <BoardToolbar d={dr.ui} compact />
    </>
  );
}

/**
 * Floating teaching board: drag it by the title bar, resize it from the corner, minimize it to a button,
 * or maximize it for the projector.
 */
export function Whiteboard({ lessonId, onClose }: { lessonId: string; onClose: () => void }) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [mini, setMini] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [announce, setAnnounce] = useState("");
  const dr = useDrawing(lessonId, !mini);

  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const startDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if (full || (e.target as HTMLElement).closest("button")) return;
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    const w = box.current?.offsetWidth ?? 300;
    setPos({ x: Math.min(Math.max(0, e.clientX - drag.current.dx), window.innerWidth - Math.min(w, 120)), y: Math.min(Math.max(0, e.clientY - drag.current.dy), window.innerHeight - 48) });
  };

  /** Arrow keys on the title bar move the window; Shift plus arrows resize it (16 px steps). */
  const onKeys = (e: React.KeyboardEvent<HTMLElement>) => {
    if (full || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const dx = e.key === "ArrowLeft" ? -16 : e.key === "ArrowRight" ? 16 : 0;
    const dy = e.key === "ArrowUp" ? -16 : e.key === "ArrowDown" ? 16 : 0;
    if (e.shiftKey) {
      const w = Math.min(window.innerWidth, Math.max(280, Math.round(r.width) + dx));
      const h = Math.min(window.innerHeight, Math.max(240, Math.round(r.height) + dy));
      setSize({ w, h });
      setAnnounce(t("board.resized", { w, h }));
    } else {
      const x = Math.min(Math.max(0, Math.round(r.left) + dx), window.innerWidth - 120);
      const y = Math.min(Math.max(0, Math.round(r.top) + dy), window.innerHeight - 48);
      setPos({ x, y });
      setAnnounce(t("board.moved", { x, y }));
    }
  };

  if (mini) {
    return (
      <button type="button" className="board-mini btn" onClick={() => setMini(false)} aria-label={t("board.open")}>
        <PenLine className="ic" aria-hidden="true" />
        {t("board.title")}
      </button>
    );
  }
  const style = full ? undefined : { ...(pos ? { left: pos.x, top: pos.y, insetInlineStart: "auto" } : {}), ...(size ? { width: size.w, height: size.h } : {}) };
  return (
    <div ref={box} className={`board-float ${full ? "full" : ""}`} role="dialog" aria-label={t("board.title")} style={style}>
      <header className="board-bar">
        {/* A real button is the move handle: drag it with a pointer, or focus it and use the arrow keys. */}
        <button type="button" className="board-grip" aria-label={t("board.keys")} onKeyDown={onKeys} onPointerDown={startDrag} onPointerMove={onDrag} onPointerUp={() => (drag.current = null)}>
          <b>{t("board.title")}</b>
        </button>
        <span className="sp" />
        <button type="button" className="rbtn" aria-label={t("board.minimize")} onClick={() => setMini(true)}><Minus aria-hidden="true" /></button>
        <button type="button" className="rbtn" aria-label={full ? t("board.restore") : t("board.maximize")} aria-pressed={full} onClick={() => setFull((v) => !v)}>
          {full ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
        </button>
        <button type="button" className="rbtn" aria-label={t("board.close")} onClick={onClose}><X aria-hidden="true" /></button>
      </header>
      <p className="sr" role="status" aria-live="polite">{announce}</p>
      <canvas ref={dr.canvasRef} className="board-canvas" aria-label={t("board.canvas")} role="img" {...dr.handlers} />
      <BoardToolbar d={dr.ui} />
    </div>
  );
}
