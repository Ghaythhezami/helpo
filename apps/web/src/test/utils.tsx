import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import type { Locale } from "@helpo/shared";
import { I18nProvider, LocaleScopeProvider, type LocaleScope } from "@/lib/i18n";
import { ToastProvider } from "@/components/ui/toast";

export function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
}

export function Providers({ children, locale = "en", scope = "public", client }: { children: ReactNode; locale?: Locale; scope?: LocaleScope; client?: QueryClient }) {
  const qc = client ?? makeClient();
  return (
    <QueryClientProvider client={qc}>
      <LocaleScopeProvider scope={scope}>
        <I18nProvider locale={locale}>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      </LocaleScopeProvider>
    </QueryClientProvider>
  );
}

export function renderWithProviders(ui: ReactElement, options: { locale?: Locale; scope?: LocaleScope; client?: QueryClient } & Omit<RenderOptions, "wrapper"> = {}) {
  const { locale, scope, client, ...rest } = options;
  return render(ui, { wrapper: ({ children }) => <Providers locale={locale} scope={scope} client={client}>{children}</Providers>, ...rest });
}

/** Minimal fetch mock: routes by "METHOD /path" (path without /api and query). */
export function mockFetch(routes: Record<string, (body: unknown) => { status?: number; body?: unknown }>) {
  const calls: { method: string; path: string; body: unknown; headers: Record<string, string> }[] = [];
  const fn = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const method = init?.method ?? "GET";
    const path = url.pathname.replace(/^\/api/, "");
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
    calls.push({ method, path, body, headers: (init?.headers ?? {}) as Record<string, string> });
    const handler = routes[`${method} ${path}`];
    if (!handler) return new Response(JSON.stringify({ title: "Not found", status: 404 }), { status: 404 });
    const out = handler(body);
    const status = out.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(out.body ?? {}), { status, headers: { "Content-Type": "application/json" } });
  });
  global.fetch = fn as unknown as typeof fetch;
  return { fn, calls };
}
