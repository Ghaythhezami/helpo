"use client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  ClassDetail,
  ClassSummary,
  DashboardView,
  JoinOption,
  LessonDetail,
  LessonSummary,
  Me,
  ResultsView,
  SessionTeacherView,
  StudentGame,
  StudentHome,
  StudentQuizState,
  GameKind,
} from "@helpo/shared";
import { ApiError, api } from "./api";
import { useRealtimeRoom } from "./realtime";

export const POLL_MS = 1500;

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
  session: (id: string) => ["session", id] as const,
  results: (lessonId: string, sessionId?: string) => ["results", lessonId, sessionId ?? "latest"] as const,
  joinClasses: (slug: string, grade: number | null) => ["join", "classes", slug, grade] as const,
  joinStudents: (classId: string) => ["join", "students", classId] as const,
  joinCode: (code: string) => ["join", "code", code] as const,
  playMe: ["play", "me"] as const,
  playGames: ["play", "games"] as const,
  playGame: (lessonId: string, game: string) => ["play", "game", lessonId, game] as const,
  playQuiz: (sessionId: string) => ["play", "quiz", sessionId] as const,
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

/** `poll` keeps refreshing every 1.5 s while the lesson is still generating. */
export function useLesson(id: string, options: { poll?: boolean } = {}) {
  return useQuery({
    queryKey: qk.lesson(id),
    queryFn: () => api<LessonDetail>(`/lessons/${id}`),
    enabled: Boolean(id),
    retry,
    refetchInterval: (query) => {
      if (!options.poll) return false;
      const data = query.state.data;
      if (data && Object.values(data.translations ?? {}).includes("working")) return POLL_MS;
      if (!options.poll) return false;
      return !data || isBusyStatus(data.status) ? POLL_MS : false;
    },
  });
}

/**
 * Live status of a lesson while it is processed. With NEXT_PUBLIC_REALTIME=socket, Socket.IO events from the API
 * refresh it instantly; the 1.5 s polling stays on as the fallback.
 */
export function useLessonEvents(id: string) {
  useRealtimeRoom(id ? `lesson:${id}` : null);
  return useLesson(id, { poll: true });
}

export function useTeacherSession(id: string | null) {
  useRealtimeRoom(id ? `session:${id}` : null);
  return useQuery({
    queryKey: qk.session(id ?? "none"),
    queryFn: () => api<SessionTeacherView>(`/sessions/${id}`),
    enabled: Boolean(id),
    retry,
    refetchInterval: (query) => (query.state.data?.status === "ENDED" ? false : POLL_MS),
  });
}

export const useResults = (lessonId: string, sessionId?: string) =>
  useQuery({
    queryKey: qk.results(lessonId, sessionId),
    queryFn: () => api<ResultsView>(`/lessons/${lessonId}/results`, { query: { sessionId } }),
    retry,
    staleTime: 0,
    refetchInterval: 5000,
  });

/* ------------------------------ student side ------------------------------ */

export const useJoinClasses = (slug: string, grade: number | null) =>
  useQuery({
    queryKey: qk.joinClasses(slug, grade),
    queryFn: () => api<JoinOption[]>(`/join/schools/${encodeURIComponent(slug)}/classes`, { query: { grade: grade ?? undefined } }),
    enabled: grade !== null,
    placeholderData: keepPreviousData,
    retry,
    refetchInterval: 8000,
  });

export const useJoinStudents = (classId: string | null) =>
  useQuery({
    queryKey: qk.joinStudents(classId ?? "none"),
    queryFn: () => api<{ id: string; displayName: string }[]>(`/join/classes/${classId}/students`),
    enabled: Boolean(classId),
    retry,
  });

export const useStudentHome = () =>
  useQuery({ queryKey: qk.playMe, queryFn: () => api<StudentHome>("/play/me"), retry, refetchInterval: 15000 });

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

export const useStudentQuiz = (sessionId: string) =>
  useQuery({
    queryKey: qk.playQuiz(sessionId),
    queryFn: () => api<StudentQuizState>(`/play/sessions/${sessionId}`),
    retry,
    refetchInterval: (query) => (query.state.data?.status === "ENDED" ? false : POLL_MS),
  });
