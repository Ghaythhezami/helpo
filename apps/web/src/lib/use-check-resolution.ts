"use client";
import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CheckStatus, CheckView, LessonDetail } from "@helpo/shared";
import { api, errorMessage } from "./api";
import { useI18n } from "./i18n";
import { qk } from "./queries";
import { useToast } from "@/components/ui/toast";

export function patchCheckInLesson(lesson: LessonDetail, id: string, patch: Partial<CheckView>): LessonDetail {
  return { ...lesson, checks: lesson.checks.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
}

/**
 * Accept, edit or dismiss an AI check. The list updates at once; a toast offers Undo, which sets the
 * check back to OPEN (PATCH /checks/:id { status: "OPEN" }).
 */
export function useCheckResolution(lessonId: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();

  const mutation = useMutation({
    mutationFn: (vars: { id: string; status: CheckStatus; editedText?: string }) =>
      api<CheckView>(`/checks/${vars.id}`, { method: "PATCH", body: { status: vars.status, ...(vars.editedText !== undefined ? { editedText: vars.editedText } : {}) } }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: qk.lesson(lessonId) });
      const previous = queryClient.getQueryData<LessonDetail>(qk.lesson(lessonId));
      if (previous) queryClient.setQueryData(qk.lesson(lessonId), patchCheckInLesson(previous, vars.id, { status: vars.status }));
      return { previous };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(qk.lesson(lessonId), ctx.previous);
      toast.show(errorMessage(error));
    },
    // Accept and Edit change the resource text on the server, so refresh the whole lesson.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: qk.lesson(lessonId) }),
  });

  const resolve = useCallback(
    (check: CheckView, status: Exclude<CheckStatus, "OPEN">, editedText?: string) => {
      mutation.mutate({ id: check.id, status, editedText });
      const label = `${check.itemRef}`;
      const message = status === "ACCEPTED" ? t("check.toast.accepted", { item: label }) : status === "EDITED" ? t("check.toast.edited", { item: label }) : t("check.toast.dismissed", { item: label });
      toast.show(message, { undo: () => mutation.mutate({ id: check.id, status: "OPEN" }), undoLabel: t("common.undo") });
    },
    [mutation, toast, t],
  );

  const reopen = useCallback((check: CheckView) => mutation.mutate({ id: check.id, status: "OPEN" }), [mutation]);

  return { resolve, reopen, pending: mutation.isPending };
}
