import "@testing-library/jest-dom";

/** jsdom has no fetch Response; api.ts only needs ok, status, statusText and text(). */
class TestResponse {
  readonly status: number;
  readonly statusText: string;
  readonly ok: boolean;
  readonly headers: { get: (name: string) => string | null };
  private readonly payload: string | null;
  constructor(body?: string | null, init: { status?: number; statusText?: string; headers?: Record<string, string> } = {}) {
    this.payload = body ?? null;
    this.status = init.status ?? 200;
    this.statusText = init.statusText ?? "";
    this.ok = this.status >= 200 && this.status < 300;
    const lower = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    this.headers = { get: (name) => lower[name.toLowerCase()] ?? null };
  }
  async text() {
    return this.payload ?? "";
  }
  async json() {
    return JSON.parse(this.payload ?? "null");
  }
}
(globalThis as unknown as { Response: unknown }).Response = TestResponse;

/** jsdom has no canvas: a stub context is enough for drawing code (the maths is tested separately). */
const ctxStub = new Proxy({}, { get: () => () => undefined, set: () => true });
HTMLCanvasElement.prototype.getContext = (() => ctxStub) as unknown as HTMLCanvasElement["getContext"];
HTMLCanvasElement.prototype.setPointerCapture = (() => undefined) as never;
if (!globalThis.structuredClone) (globalThis as unknown as { structuredClone: (v: unknown) => unknown }).structuredClone = (v) => JSON.parse(JSON.stringify(v));
Element.prototype.scrollIntoView = () => undefined;

window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
