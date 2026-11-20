export interface Point {
  x: number; // 0..1 of the board width, so strokes survive resizing
  y: number; // 0..1 of the board height
  p: number; // pressure 0..1
}

export interface Stroke {
  tool: "pencil" | "eraser";
  color: string;
  size: number; // CSS px at the reference width
  points: Point[];
}

export const BOARD_COLORS = ["#24185F", "#D32F2F", "#1E6FD9", "#2E8F63", "#F59E0B", "#7A3FD1"] as const;
export const BOARD_SIZES = [3, 6, 12] as const;
const REFERENCE_WIDTH = 640;

/** Redraws every stroke from stored (normalised) points; safe to call after any resize. */
export function drawStrokes(ctx: CanvasRenderingContext2D, width: number, height: number, strokes: Stroke[]): void {
  ctx.clearRect(0, 0, width, height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue;
    const scale = width / REFERENCE_WIDTH;
    ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    const base = (stroke.tool === "eraser" ? stroke.size * 3 : stroke.size) * scale;
    if (stroke.points.length === 1) {
      const p = stroke.points[0];
      ctx.beginPath();
      ctx.arc(p.x * width, p.y * height, base / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    for (let i = 1; i < stroke.points.length; i++) {
      const a = stroke.points[i - 1];
      const b = stroke.points[i];
      ctx.lineWidth = base * (0.6 + 0.8 * (b.p || 0.5));
      ctx.beginPath();
      ctx.moveTo(a.x * width, a.y * height);
      ctx.lineTo(b.x * width, b.y * height);
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = "source-over";
}

export function loadStrokes(lessonId: string, storage: Pick<Storage, "getItem"> = window.localStorage): Stroke[] {
  try {
    const raw = storage.getItem(`helpo:board:${lessonId}`);
    return raw ? (JSON.parse(raw) as Stroke[]) : [];
  } catch {
    return [];
  }
}

export function saveStrokes(lessonId: string, strokes: Stroke[], storage: Pick<Storage, "setItem"> = window.localStorage): void {
  try {
    storage.setItem(`helpo:board:${lessonId}`, JSON.stringify(strokes.slice(-400)));
  } catch {
    /* storage full or blocked: drawing still works for this session */
  }
}

export function undoStroke(strokes: Stroke[]): Stroke[] {
  return strokes.slice(0, -1);
}
