"use client";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminOverview,
  ClassDetail,
  ClassSummary,
  DashboardView,
  JoinOption,
  LessonDetail,
  LessonSummary,
  Me,
  ResultsView,
  SessionTeacherView,
  PracticeQuiz,
  StudentGame,
  StudentHome,
  StudentPractice,
  StudentQuizState,
  GameKind,
  ResourceKind,
  ResourceStatus,
} from "@helpo/shared";
import { ApiError, api } from "./api";
import { isRealtimeConnected, useRealtimeConnected, useRealtimeRoom } from "./realtime";

/** @deprecated The old always-on poll interval. Kept for compatibility; nothing polls this fast any more. */
export const POLL_MS = 1500;
/** Poll interval used only while the socket is disconnected (or realtime is off). */
export const FALLBACK_POLL_MS = 5000;

/** Pipeline statuses where the kit is still being made. */
export function isBusyStatus(status: string): boolean {
  return status === "UPLOADED" || status === "EXTRACTING" || status === "ANALYZING" || status === "GENERATING";
}

export const qk = {
  me: ["me"] as const,
  dashboard: ["dashboard"] as const,
  classes: ["classes"] as const,
  class: (id: string) => ["classes", id] as const,
  lessons: (classId?: string) => ["lessons", classId ?? "all"] as const,
  lesson: (id: string) => ["lesson", id] as const,
  lessonStatus: (id: string) => ["lesson", id, "status"] as const,
  session: (id: string) => ["session", id] as const,
  results: (lessonId: string, sessionId?: string) => ["results", lessonId, sessionId ?? "latest"] as const,
  joinClasses: (slug: string, grade: number | null) => ["join", "classes", slug, grade] as const,
  joinStudents: (classId: string) => ["join", "students", classId] as const,
  joinCode: (code: string) => ["join", "code", code] as const,
  playMe: ["play", "me"] as const,
  playGames: ["play", "games"] as const,
  playGame: (lessonId: string, game: string) => ["play", "game", lessonId, game] as const,
  playQuiz: (sessionId: string) => ["play", "quiz", sessionId] as const,
  playPractice: ["play", "practice"] as const,
  playPracticeQuiz: (lessonId: string) => ["play", "practice-quiz", lessonId] as const,
};

/** Don't retry auth and not-found errors; retry flaky network or 5xx once. */
function retry(count: number, error: unknown) {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return count < 1;
}

export const useMe = () => useQuery({ queryKey: qk.me, queryFn: () => api<Me>("/me"), retry });

export const useDashboard = () => useQuery({ queryKey: qk.dashboard, queryFn: () => api<DashboardView>("/dashboard"), retry });

export const useClasses = () => useQuery({ queryKey: qk.classes, queryFn: () => api<ClassSummary[]>("/classes"), retry });

export const useClassDetail = (id: string) =>
  useQuery({ queryKey: qk.class(id), queryFn: () => api<ClassDetail>(`/classes/${id}`), retry });

export const useLessons = (classId?: string) =>
  useQuery({ queryKey: qk.lessons(classId), queryFn: () => api<LessonSummary[]>("/lessons", { query: { classId } }), retry });

/** Light lesson status (GET /lessons/:id/status): what the fallback poll reads while a kit is generating. */
export interface LessonStatusView {
  status: LessonDetail["status"];
  resources: { kind: ResourceKind; status: ResourceStatus; progress: number; error: string | null }[];
  translations: LessonDetail["translations"];
  updatedAt: string;
}

/** True when the light status shows something the cached full lesson does not (a resource finished, status moved). */
export function lessonStatusDiffers(lesson: LessonDetail | undefined, status: LessonStatusView): boolean {
  if (!lesson) return false;
  if (lesson.status !== status.status) return true;
  for (const r of status.resources) {
    const cached = lesson.resources.find((c) => c.kind === r.kind);
    if (!cached || cached.status !== r.status) return true;
  }
  const a = (lesson.translations ?? {}) as Record<string, unknown>;
  const b = (status.translations ?? {}) as Record<string, unknown>;
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].some((k) => a[k] !== b[k]);
}

/** Polling interval for a query: none while the socket is connected, the slow fallback otherwise. */
function fallbackInterval(stop = false): number | false {
  return stop || isRealtimeConnected() ? false : FALLBACK_POLL_MS;
}

/**
 * Fallback poll of the light status endpoint. Runs only while `enabled` and the socket is down. When it shows a
 * resource finished or a status change, the full lesson is refetched once (the full lesson is never polled).
 */
export function useLessonStatus(id: string, enabled: boolean) {
  const client = useQueryClient();
  const connected = useRealtimeConnected();
  return useQuery({
    queryKey: qk.lessonStatus(id),
    queryFn: async () => {
      const status = await api<LessonStatusView>(`/lessons/${id}/status`);
      if (lessonStatusDiffers(client.getQueryData<LessonDetail>(qk.lesson(id)), status)) {
        void client.invalidateQueries({ queryKey: qk.lesson(id), exact: true });
      }
      return status;
    },
    enabled: Boolean(id) && enabled && !connected,
    retry,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: () => fallbackInterval(),
  });
}

function isGenerating(data: LessonDetail | undefined, awaitGeneration = false): boolean {
  if (!data) return false;
  // ANALYZED is a rest state in the workspace (the teacher picks options) but a waiting state in the generation view,
  // where generation starts on its own a moment later.
  return isBusyStatus(data.status) || (awaitGeneration && data.status === "ANALYZED") || Object.values(data.translations ?? {}).includes("working");
}

/** `poll` follows a generating lesson: socket events while connected, the light status endpoint (5 s) otherwise. */
export function useLesson(id: string, options: { poll?: boolean; awaitGeneration?: boolean } = {}) {
  const query = useQuery({
    queryKey: qk.lesson(id),
    queryFn: () => api<LessonDetail>(`/lessons/${id}`),
    enabled: Boolean(id),
    retry,
    staleTime: 5_000,
  });
  useLessonStatus(id, Boolean(options.poll) && isGenerating(query.data, options.awaitGeneration));
  return query;
}

/**
 * Live status of a lesson while it is processed. With NEXT_PUBLIC_REALTIME=socket, Socket.IO events from the API
 * patch or refresh it instantly and nothing is polled; without a socket the light status is polled every 5 s.
 */
export function useLessonEvents(id: string, options: { awaitGeneration?: boolean } = {}) {
  useRealtimeRoom(id ? `lesson:${id}` : null);
  return useLesson(id, { poll: true, awaitGeneration: options.awaitGeneration });
}

export function useTeacherSession(id: string | null) {
  useRealtimeRoom(id ? `session:${id}` : null);
  useRealtimeConnected();
  return useQuery({
    queryKey: qk.session(id ?? "none"),
    queryFn: () => api<SessionTeacherView>(`/sessions/${id}`),
    enabled: Boolean(id),
    retry,
    staleTime: 2_000,
    refetchInterval: (query) => fallbackInterval(query.state.data?.status === "ENDED"),
  });
}

/**
 * Results of a lesson. Refetched by session.answer / session.state events; polls every 5 s only while the socket is
 * down and the session is not ENDED. `ended` is an optional hint; the cached session status is read too.
 */
export function useResults(lessonId: string, sessionId?: string, options: { ended?: boolean } = {}) {
  const client = useQueryClient();
  useRealtimeConnected();
  const query = useQuery({
    queryKey: qk.results(lessonId, sessionId),
    queryFn: () => api<ResultsView>(`/lessons/${lessonId}/results`, { query: { sessionId } }),
    retry,
    staleTime: 2_000,
    refetchInterval: (q) => {
      const sid = sessionId ?? q.state.data?.sessionId ?? null;
      const ended = options.ended || (sid !== null && client.getQueryData<SessionTeacherView>(qk.session(sid))?.status === "ENDED");
      return fallbackInterval(ended);
    },
  });
  const sid = sessionId ?? query.data?.sessionId ?? null;
  useRealtimeRoom(sid ? `session:${sid}` : null);
  return query;
}

/* ------------------------------ student side ------------------------------ */

export const useJoinClasses = (slug: string, grade: number | null) =>
  useQuery({
    queryKey: qk.joinClasses(slug, grade),
    queryFn: () => api<JoinOption[]>(`/join/schools/${encodeURIComponent(slug)}/classes`, { query: { grade: grade ?? undefined } }),
    enabled: grade !== null,
    placeholderData: keepPreviousData,
    retry,
    staleTime: 30_000,
  });

export const useJoinStudents = (classId: string | null) =>
  useQuery({
    queryKey: qk.joinStudents(classId ?? "none"),
    queryFn: () => api<{ id: string; displayName: string }[]>(`/join/classes/${classId}/students`),
    enabled: Boolean(classId),
    retry,
  });

export const useStudentHome = () =>
  useQuery({ queryKey: qk.playMe, queryFn: () => api<StudentHome>("/play/me"), retry });

export const useStudentGames = () =>
  useQuery({
    queryKey: qk.playGames,
    queryFn: () => api<{ lessonId: string; lessonTitle: string; game: GameKind; bestStars: number; assigned: boolean }[]>("/play/games"),
    retry,
  });

export const useStudentGame = (lessonId: string, game: GameKind) =>
  useQuery({
    queryKey: qk.playGame(lessonId, game),
    queryFn: () => api<StudentGame>(`/play/games/${lessonId}/${game}`),
    retry,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

export function useStudentQuiz(sessionId: string) {
  useRealtimeRoom(sessionId ? `session:${sessionId}` : null);
  useRealtimeConnected();
  return useQuery({
    queryKey: qk.playQuiz(sessionId),
    queryFn: () => api<StudentQuizState>(`/play/sessions/${sessionId}`),
    retry,
    staleTime: 2_000,
    refetchInterval: (query) => fallbackInterval(query.state.data?.status === "ENDED"),
  });
}

/** Practice hub: open sessions plus every ready lesson the student can practise at any time. */
export const usePractice = () => useQuery({ queryKey: qk.playPractice, queryFn: () => api<StudentPractice>("/play/practice"), retry });

export const usePracticeQuiz = (lessonId: string) =>
  useQuery({
    queryKey: qk.playPracticeQuiz(lessonId),
    queryFn: () => api<PracticeQuiz>(`/play/practice/${lessonId}/quiz`),
    retry,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

export const useAdminOverview = (enabled = true) =>
  useQuery({ queryKey: ["admin", "overview"], queryFn: () => api<AdminOverview>("/admin/overview"), enabled, retry, staleTime: 15_000, refetchOnWindowFocus: true });
