/** WEB_URL (alias WEB_ORIGIN) plus any extra origins in CORS_ORIGINS (comma separated). Used by HTTP CORS and Socket.IO. */
export function allowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const list = [env.WEB_URL, env.WEB_ORIGIN, ...(env.CORS_ORIGINS ?? "").split(",")]
    .map((o) => o?.trim().replace(/\/$/, ""))
    .filter((o): o is string => Boolean(o));
  return [...new Set(list)];
}
