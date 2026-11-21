-- CreateIndex
CREATE INDEX "game_result_lessonId_idx" ON "game_result"("lessonId");

-- CreateIndex
CREATE INDEX "participant_studentId_idx" ON "participant"("studentId");

-- CreateIndex
CREATE INDEX "xp_event_studentId_createdAt_idx" ON "xp_event"("studentId", "createdAt");
