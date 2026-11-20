-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Band" AS ENUM ('EXPLORER', 'NAVIGATOR', 'STUDIO');

-- CreateEnum
CREATE TYPE "LessonStatus" AS ENUM ('DRAFT', 'UPLOADED', 'EXTRACTING', 'ANALYZING', 'ANALYZED', 'GENERATING', 'READY', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "ResourceKind" AS ENUM ('SLIDES', 'WORKSHEET', 'QUIZ', 'GAME', 'CARDS');

-- CreateEnum
CREATE TYPE "ResourceStatus" AS ENUM ('WAITING', 'WORKING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "CheckKind" AS ENUM ('FACT_CHECK', 'READING_LEVEL', 'ORDER', 'AGE_APPROPRIATE', 'LANGUAGE', 'GROUNDING');

-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('OPEN', 'ACCEPTED', 'EDITED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('LIVE_QUIZ', 'GAME', 'ASSIGNMENT');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('LOBBY', 'LIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "GameKind" AS ENUM ('MATCH', 'SORT', 'EQUATION', 'MEMORY', 'TRUE_FALSE');

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_room" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT,
    "teacherId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "subjectEn" TEXT NOT NULL DEFAULT 'Science',
    "subjectAr" TEXT,
    "band" "Band" NOT NULL,
    "pointsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "teamsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "soundsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "celebrationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "weeklyGoalXp" INTEGER NOT NULL DEFAULT 500,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "streakDays" INTEGER NOT NULL DEFAULT 0,
    "streakSavers" INTEGER NOT NULL DEFAULT 1,
    "lastActiveDay" TEXT,
    "avatarItems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "avatarBackground" TEXT NOT NULL DEFAULT 'lavender',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "titleEn" TEXT,
    "titleAr" TEXT,
    "unitTitleEn" TEXT,
    "unitTitleAr" TEXT,
    "lessonNumber" INTEGER,
    "durationMin" INTEGER NOT NULL DEFAULT 45,
    "language" TEXT NOT NULL DEFAULT 'English',
    "descriptionEn" TEXT,
    "descriptionAr" TEXT,
    "standard" TEXT,
    "objectivesEn" JSONB NOT NULL DEFAULT '[]',
    "objectivesAr" JSONB NOT NULL DEFAULT '[]',
    "contentLocale" TEXT NOT NULL DEFAULT 'en',
    "translationStatus" JSONB NOT NULL DEFAULT '{"en":"ready","ar":"missing"}',
    "sourceText" TEXT,
    "sourceFileName" TEXT,
    "sourceType" TEXT,
    "sourcePages" INTEGER,
    "sourceSha256" TEXT,
    "sourceLocale" TEXT,
    "sourceBlobUrl" TEXT,
    "prompt" TEXT,
    "sourceKey" TEXT,
    "cleanText" TEXT,
    "tokenCount" INTEGER,
    "aiWritten" BOOLEAN NOT NULL DEFAULT false,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "generationOptions" JSONB,
    "errorMessage" TEXT,
    "blueprint" JSONB,
    "approvedAt" TIMESTAMP(3),
    "requestedKinds" "ResourceKind"[],
    "status" "LessonStatus" NOT NULL DEFAULT 'DRAFT',
    "tracedStatements" INTEGER,
    "totalStatements" INTEGER,
    "generationStartedAt" TIMESTAMP(3),
    "generationFinishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "kind" "ResourceKind" NOT NULL,
    "status" "ResourceStatus" NOT NULL DEFAULT 'WAITING',
    "contentEn" JSONB,
    "contentAr" JSONB,
    "error" TEXT,
    "promptVersion" TEXT,
    "model" TEXT,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_version" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "contentEn" JSONB,
    "contentAr" JSONB,
    "source" TEXT NOT NULL DEFAULT 'AI',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_check" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "resource" "ResourceKind" NOT NULL,
    "itemRef" TEXT NOT NULL,
    "kind" "CheckKind" NOT NULL,
    "messageEn" TEXT,
    "messageAr" TEXT,
    "suggestionEn" TEXT,
    "suggestionAr" TEXT,
    "sourcePage" INTEGER,
    "status" "CheckStatus" NOT NULL DEFAULT 'OPEN',
    "editedTextEn" TEXT,
    "editedTextAr" TEXT,
    "originalTextEn" TEXT,
    "originalTextAr" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_session" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "type" "SessionType" NOT NULL,
    "game" "GameKind",
    "status" "SessionStatus" NOT NULL DEFAULT 'LOBBY',
    "joinCode" TEXT NOT NULL,
    "namesHidden" BOOLEAN NOT NULL DEFAULT true,
    "currentQuestion" INTEGER NOT NULL DEFAULT 0,
    "revealed" BOOLEAN NOT NULL DEFAULT false,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "leaderboard" TEXT NOT NULL DEFAULT 'TEAMS',
    "dueAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT,
    "displayName" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationSec" INTEGER,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answer" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "questionIndex" INTEGER NOT NULL,
    "optionIndex" INTEGER,
    "text" TEXT,
    "correct" BOOLEAN NOT NULL,
    "partial" BOOLEAN NOT NULL DEFAULT false,
    "xpAwarded" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_result" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "sessionId" TEXT,
    "game" "GameKind" NOT NULL,
    "stars" INTEGER NOT NULL,
    "xp" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "firstTry" INTEGER NOT NULL,
    "retried" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_badge" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "badge" TEXT NOT NULL,
    "awardedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xp_event" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xp_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "schoolId" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "school_slug_key" ON "school"("slug");

-- CreateIndex
CREATE INDEX "class_room_schoolId_grade_idx" ON "class_room"("schoolId", "grade");

-- CreateIndex
CREATE UNIQUE INDEX "class_room_teacherId_name_key" ON "class_room"("teacherId", "name");

-- CreateIndex
CREATE INDEX "student_classId_idx" ON "student"("classId");

-- CreateIndex
CREATE INDEX "lesson_teacherId_createdAt_idx" ON "lesson"("teacherId", "createdAt");

-- CreateIndex
CREATE INDEX "lesson_classId_idx" ON "lesson"("classId");

-- CreateIndex
CREATE INDEX "lesson_teacherId_sourceSha256_idx" ON "lesson"("teacherId", "sourceSha256");

-- CreateIndex
CREATE UNIQUE INDEX "resource_lessonId_kind_key" ON "resource"("lessonId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "resource_version_resourceId_version_key" ON "resource_version"("resourceId", "version");

-- CreateIndex
CREATE INDEX "ai_check_lessonId_status_idx" ON "ai_check"("lessonId", "status");

-- CreateIndex
CREATE INDEX "activity_session_joinCode_status_idx" ON "activity_session"("joinCode", "status");

-- CreateIndex
CREATE INDEX "activity_session_classId_status_idx" ON "activity_session"("classId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "participant_sessionId_studentId_key" ON "participant"("sessionId", "studentId");

-- CreateIndex
CREATE INDEX "answer_sessionId_questionIndex_idx" ON "answer"("sessionId", "questionIndex");

-- CreateIndex
CREATE UNIQUE INDEX "answer_participantId_questionIndex_key" ON "answer"("participantId", "questionIndex");

-- CreateIndex
CREATE INDEX "game_result_studentId_lessonId_game_idx" ON "game_result"("studentId", "lessonId", "game");

-- CreateIndex
CREATE UNIQUE INDEX "student_badge_studentId_badge_key" ON "student_badge"("studentId", "badge");

-- CreateIndex
CREATE INDEX "xp_event_classId_createdAt_idx" ON "xp_event"("classId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_room" ADD CONSTRAINT "class_room_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "school"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_room" ADD CONSTRAINT "class_room_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student" ADD CONSTRAINT "student_classId_fkey" FOREIGN KEY ("classId") REFERENCES "class_room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_classId_fkey" FOREIGN KEY ("classId") REFERENCES "class_room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource" ADD CONSTRAINT "resource_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_version" ADD CONSTRAINT "resource_version_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_check" ADD CONSTRAINT "ai_check_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_session" ADD CONSTRAINT "activity_session_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_session" ADD CONSTRAINT "activity_session_classId_fkey" FOREIGN KEY ("classId") REFERENCES "class_room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant" ADD CONSTRAINT "participant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "activity_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant" ADD CONSTRAINT "participant_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer" ADD CONSTRAINT "answer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "activity_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer" ADD CONSTRAINT "answer_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_result" ADD CONSTRAINT "game_result_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_result" ADD CONSTRAINT "game_result_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_badge" ADD CONSTRAINT "student_badge_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_event" ADD CONSTRAINT "xp_event_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "school"("id") ON DELETE SET NULL ON UPDATE CASCADE;

