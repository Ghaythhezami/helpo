# Requests per minute, before and after

Steady state, one tab, after the first load (the first load is one request per query on top).

| Scenario | Before (always polling) | After, socket connected | After, socket down or off (fallback) |
|---|---|---|---|
| (a) Teacher making a kit (lesson generating, ~2 min) | 40/min: full `GET /lessons/:id` every 1.5 s | 0 (progress is patched from `resource.progress`; one refetch on ready/failed/status) | 12/min: light `GET /lessons/:id/status` every 5 s, plus one full refetch when a resource finishes |
| (b) Student in a live quiz | 40/min: `GET /play/sessions/:id` every 1.5 s | 0 (refetch only on `session.*` events) | 12/min: every 5 s, stops at ENDED |
| (c) Teacher on the live board | 52/min: session 40 + results 12 | 0 (each `session.answer`/`session.state`/`studentJoined` event refetches session + results once) | 24/min: session 12 + results 12, both stop at ENDED |

Method: "before" is read from `git show HEAD:apps/web/src/lib/queries.ts` (`POLL_MS` = 1500 gives 60000/1500 = 40 a minute; `useResults` had a 5000 ms interval = 12 a minute).
"After" is measured in `__tests__/requests.test.tsx` and `__tests__/polling.test.tsx`: Jest fake timers advance 60 s and the dev request counter (`getRequestStats()`, also on `window.__nibrasRequests` when `NEXT_PUBLIC_DEBUG_REQUESTS=1`) counts `api()` calls.
Socket-connected cost also depends on event volume: each answer event refetches the teacher session and results once (React Query de-duplicates bursts that land in the same tick).
One socket and one `/realtime/token` request serve the whole tab, where the old code opened one socket and one token request per `useRealtimeRoom` call.
Also removed: `useJoinClasses` 8 s poll (now `staleTime` 30 s), `useAdminOverview` and `useStudentHome` 15 s polls (refetch on focus only).
