import { NextResponse, type NextRequest } from "next/server";

/** Better Auth cookie names (the prefix is added on HTTPS). */
const SESSION_COOKIES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

export function hasSessionCookie(request: Pick<NextRequest, "cookies">): boolean {
  return SESSION_COOKIES.some((name) => Boolean(request.cookies.get(name)?.value));
}

/**
 * Optimistic gate: send visitors without a session cookie to /login. This only saves a round trip,
 * the API stays authoritative and answers 401 for a stale or forged cookie.
 */
export function proxy(request: NextRequest) {
  if (hasSessionCookie(request)) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/app/:path*", "/admin/:path*"] };
