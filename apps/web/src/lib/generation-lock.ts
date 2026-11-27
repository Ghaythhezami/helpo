"use client";
import { useSyncExternalStore } from "react";

/**
 * Focus lock while a kit is generated. The id of the generating lesson lives in localStorage (so a refresh or a second
 * tab still lands on the generation view) and is mirrored to React with useSyncExternalStore. The teacher can only
 * leave by cancelling or when the kit is ready (owner decision, 2026-11-27).
 */
export const GEN_LOCK_KEY = "helpo:gen-lock";

/** Statuses during which the lock holds. */
export const LOCKED_STATUSES = ["UPLOADED", "EXTRACTING", "ANALYZING", "ANALYZED", "GENERATING"] as const;
/** A lesson found busy on app load only re-locks within this window, so an abandoned old lesson never traps anyone. */
export const RELOCK_WINDOW_MS = 30 * 60 * 1000;

export const isLockedStatus = (status: string): boolean => (LOCKED_STATUSES as readonly string[]).includes(status);

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function read(): string | null {
  try {
    return window.localStorage.getItem(GEN_LOCK_KEY);
  } catch {
    return null;
  }
}

export function lockGeneration(lessonId: string): void {
  try {
    window.localStorage.setItem(GEN_LOCK_KEY, lessonId);
  } catch {
    /* storage is optional: the in-memory subscribers below still update on the next read */
  }
  emit();
}

export function unlockGeneration(): void {
  try {
    window.localStorage.removeItem(GEN_LOCK_KEY);
  } catch {
    /* ignore */
  }
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === GEN_LOCK_KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The id of the lesson being generated, or null. */
export function useGenerationLock(): string | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

/** Pure: the lesson (from the lessons list) that should re-lock the app after a refresh. */
export function relockCandidate(lessons: { id: string; status: string; createdAt: string }[] | undefined, now = Date.now()): string | null {
  const found = (lessons ?? []).find((l) => isLockedStatus(l.status) && l.status !== "ANALYZED" && now - Date.parse(l.createdAt) < RELOCK_WINDOW_MS);
  return found?.id ?? null;
}
