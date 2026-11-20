# Helpo API contract (v1)

All paths are under `/api`. JSON in and out. Types are in `packages/shared/src/api-types.ts`, request bodies in
`packages/shared/src/schemas.ts`. Errors: `application/problem+json` (`Problem`). Teacher routes need a Better Auth
session cookie (401 otherwise). Student routes need the `helpo_student` cookie (401 otherwise). Every teacher
resource is owned by the signed-in teacher; another teacher's id returns **404** (not 403) to avoid leaking existence.

## Auth (Better Auth)

| Method | Path | Notes |
|---|---|---|
| * | `/api/auth/*` | Better Auth handler: `sign-up/email`, `sign-in/email`, `sign-out`, `get-session` |
| GET | `/api/me` | `Me`. |
| PUT | `/api/me/school` | `{ name }` → creates or joins school by slug; returns `Me` |

## Teacher

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/dashboard` | | `DashboardView` |
| GET | `/api/classes` | | `ClassSummary[]` |
| POST | `/api/classes` | `CreateClassBody` | `ClassSummary` (band derived from grade) |
| GET | `/api/classes/:id` | | `ClassDetail` |
| PATCH | `/api/classes/:id/settings` | `UpdateClassSettingsBody` | `ClassSettings` |
| POST | `/api/classes/:id/students` | `AddStudentsBody` | `StudentSummary[]` (displayName = first name + initial) |
| DELETE | `/api/classes/:id/students/:studentId` | | 204 |
| POST | `/api/students/:id/badges` | `AwardBadgeBody` | 201 `{ badge }` (teacher-awardable badges only) |
| DELETE | `/api/students/:id/badges/:badge` | | 204 (undo) |
| GET | `/api/lessons` | `?classId=` | `LessonSummary[]` |
| POST | `/api/lessons` | `CreateLessonBody` | `LessonDetail` (status DRAFT) |
| POST | `/api/lessons/:id/source` | multipart `file` (.pdf, .docx, .txt, .md ≤ 10 MB) | `LessonDetail` (sourceText extracted: pdfjs-dist / mammoth) |
| POST | `/api/lessons/:id/plan` | | `LessonDetail` with AI-extracted `objectives` + `standard` (Claude) |
| PATCH | `/api/lessons/:id` | `UpdateLessonBody` | `LessonDetail` |
| DELETE | `/api/lessons/:id` | | 204 |
| POST | `/api/lessons/:id/generate` | | **202** `LessonDetail` (status GENERATING; resources WAITING→WORKING→READY/FAILED in background) |
| POST | `/api/lessons/:id/resources/:kind/retry` | | 202 (regenerate one failed/any resource) |
| GET | `/api/lessons/:id` | | `LessonDetail` (poll while GENERATING) |
| PATCH | `/api/resources/:id` | `UpdateResourceBody` | `ResourceView` (content re-validated with the kind's schema) |
| POST | `/api/resources/:id/rewrite` | `RewriteBody` | `{ text }` (Claude: simpler / add example / translate / regenerate a passage) |
| POST | `/api/resources/:id/change` | `ChangeRequestBody` | `{ summary, resource: ResourceView }` ("Ask for a change") |
| PATCH | `/api/checks/:id` | `ResolveCheckBody` | `CheckView`; ACCEPTED applies `suggestion`, EDITED applies `editedText` to the referenced item; OPEN = undo |
| POST | `/api/sessions` | `CreateSessionBody` | `SessionTeacherView` (6-digit join code unique among non-ended sessions) |
| GET | `/api/sessions/:id` | | `SessionTeacherView` (poll) |
| POST | `/api/sessions/:id/action` | `SessionActionBody` | `SessionTeacherView` |
| GET | `/api/lessons/:id/results` | `?sessionId=` (default latest) | `ResultsView` |
| POST | `/api/lessons/:id/reteach` | | `ReteachPlan` (Claude, based on the weakest objective / misconception) |

## Student (public, child-safe)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/join/schools/:slug/classes` | `?grade=` | `JoinOption[]` (classes of that school + what is live) |
| GET | `/api/join/classes/:classId/students` | | `{ id, displayName }[]` (first name + initial only) |
| GET | `/api/join/code/:code` | | `JoinOption` for the class running that code |
| POST | `/api/join` | `JoinBody` | `JoinResult`; sets `helpo_student` cookie |
| POST | `/api/play/leave` | | 204, clears cookie |
| GET | `/api/play/me` | | `StudentHome` |
| PUT | `/api/play/me/avatar` | `AvatarBody` | `StudentHome` (only unlocked items) |
| GET | `/api/play/sessions/:id` | | `StudentQuizState` (poll; never includes answers before reveal) |
| POST | `/api/play/sessions/:id/answers` | `AnswerBody` | `StudentQuizState`; server grades, awards XP (+10 / +5 retry / +2 attempt), idempotent per question |
| GET | `/api/play/games` | | `{ lessonId, lessonTitle, game, bestStars, assigned }[]` |
| GET | `/api/play/games/:lessonId/:game` | | `StudentGame` |
| POST | `/api/play/games/result` | `GameResultBody` | `GameResultView` (server scores with `scoreGame`, caps XP, unlocks badges, updates streak) |

## Operational

| GET | `/api/health` | `{ status: "ok", db: "ok" }` |

## Languages: English and Arabic (dynamic translation)

- **Two DB fields per translatable text**, suffixed `En` and `Ar`:
  - lesson `titleEn/titleAr`, `unitTitleEn/unitTitleAr`, `descriptionEn/descriptionAr`, `objectivesEn/objectivesAr` (Json)
  - resource `contentEn/contentAr` (Json)
  - check `messageEn/messageAr`, `suggestionEn/suggestionAr`, `editedTextEn/editedTextAr`
  - class `subjectEn/subjectAr`
  Proper names (people, classes such as "6B", the school) stay single-valued. `User.locale` and `Student.locale` store each person's preferred UI language.
- **Locale of a request:** the `x-helpo-locale` header (the web app always sends it), else the `helpo_locale` cookie, else `en`.
  Responses return each text in that locale with a fallback to the other language, plus `contentLocale` and `translations`
  (`{ en: "ready", ar: "missing" | "working" | "ready" }`) so the UI can offer or start a translation.
- **Generation** writes the `contentLocale` columns first (`CreateLessonBody.contentLocale`, default `en`).
- **Dynamic translation:**
  - `POST /api/lessons/:id/translate` with `TranslateLessonBody { to }` returns 202 and fills the other language's columns in the background (Claude, same schemas, faithful translation, child-appropriate reading level). Poll `GET /api/lessons/:id` for progress.
  - The web app calls it automatically the first time someone views a lesson in a language whose `translations[locale]` is `missing`.
- **Edits** (`PATCH /resources/:id`, `PATCH /checks/:id`, `PATCH /lessons/:id`) write the request locale's column. They mark the other language "missing" again only if the teacher chooses "Update the translation".
- `PUT /api/me/locale` with `UpdateLocaleBody { locale }` returns `Me`. Students switch with the same body on `PUT /api/play/me/locale`.
- In demo mode (no `ANTHROPIC_API_KEY`), the demo provider returns hand-written Arabic for the photosynthesis demo content, and otherwise a marked placeholder translation.

## Lesson pipeline additions (Nibras)

Statuses: `DRAFT → UPLOADED → EXTRACTING → ANALYZED → GENERATING → READY | PARTIAL | FAILED`. `PARTIAL` means 1 to 4 of the
requested resources failed after one automatic retry; the others stay usable and `POST /api/lessons/:id/resources/:kind/retry`
regenerates only the failed ones (the lesson returns to `READY` when everything is ready).

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/lessons/:id/source` | multipart `file` (.pdf, .docx, .pptx, .txt, .md, up to 20 MB) | `LessonDetail` with `source` metadata. The type is decided by magic bytes (`%PDF`, ZIP with `word/` or `ppt/`, else text); a renamed file is refused (400). The same file already uploaded by the same teacher returns **409** `application/problem+json` with `existingLessonId`. Scanned PDFs (under about 200 characters of text) are read by Claude as a base64 `document` block (not in demo mode). The original is kept in Vercel Blob only when `BLOB_READ_WRITE_TOKEN` is set. |
| POST | `/api/lessons/:id/plan` | | The **analysis** step: ONE call returns the `LessonBlueprint`, stored on the lesson (`blueprint`) and returned in `LessonDetail` (status `ANALYZED`). `generate` runs it automatically when it has not been done. |
| POST | `/api/lessons/:id/approve` | `{ force?: boolean }` | `LessonDetail`. Requires a `READY` or `PARTIAL` kit and **no OPEN checks** unless `force` is true (409 `Checks still open`, with `openChecks`, otherwise). Regenerating clears the approval. |
| POST | `/api/sessions` | `CreateSessionBody` | **409** `Approve this kit before teaching or sharing it.` until the lesson is approved. |
| GET | `/api/resources/:id/export?format=pptx\|docx\|pdf` | | Binary download in the request's language (`Content-Disposition: attachment`). Slides: `pptx`, `pdf`. Worksheet, quiz, cards, game: `docx`, `pdf`. Another combination returns 400. **Arabic PDF returns 422** (pdf-lib cannot shape Arabic); Arabic DOCX and PPTX are right-to-left. Files carry the Nibras name in headers and metadata. |

### Share by code (student, public)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/play/code/:code` | | `JoinOption` for the class running that code (same as `GET /api/join/code/:code`) |
| POST | `/api/play/code/:code/join` | `CodeJoinBody { name }` | `JoinResult`; sets the `helpo_student` cookie. The student is matched in that class by child-safe name (first name + initial) or created. |

This sits alongside the grade → class → name picker (`POST /api/join`). Games shown to a student (`GET /api/play/games`) are
only the templates the lesson's game content can feed and that suit the class band (`playableTemplates`: Match, Memory, Sort, Sequence).

### Safety

Uploaded text is sent inside `<untrusted_source>` delimiters and declared untrusted data. No student names are ever sent to the AI.
The review pass also flags age-appropriateness and language-consistency problems (reported as `READING_LEVEL` checks).
Only approved lessons appear to students.

## AI Integration Spec: one-click flow (Nibras)

Status flow: `UPLOADED -> EXTRACTING -> ANALYZING -> ANALYZED -> GENERATING -> READY | PARTIAL | FAILED`.

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/lessons/refine-prompt` | `RefinePromptBody { prompt, classId?, locale? }` | `RefinedPrompt { prompt, suggestions[] }`. "Refine with AI": the cheap model rewrites a rough prompt into a brief (grade, subject, duration from the class). The prompt is sent as delimited data. Rate limited, creates no lesson and does not count toward the quota. |
| POST | `/api/lessons` | multipart: optional `file` + `CreateLessonBody` fields (a file, a prompt, or both) | **201** `{ lessonId }` at once. In the background: extraction (`[[page N]]` markers, repeated headers/footers and page numbers removed, language detected, token count), the single analysis call (map-reduce above 60% of `ANALYSIS_BUDGET_TOKENS`), then generation when `autoGenerate` is true (default). The same file from the same teacher reuses the clean text and blueprint (`reuse=true`). Over 150 PDF pages needs `pageRange` (422 otherwise). Prompt-only lessons are `aiWritten`. Limits: 10 uploads/hour/teacher (429), `MONTHLY_LESSON_QUOTA` lessons per month (429 `quota-exceeded`). Failures set `FAILED` with an error message. |
| POST | `/api/lessons/:id/source`, `/plan` | | Thin aliases: attach a file (409 with `existingLessonId` for a duplicate) and run the analysis synchronously. |
| POST | `/api/lessons/:id/generate` | `{ resources?, quizCount?, difficulty? }` | **202** `LessonDetail`. Idempotent: a double click claims the lesson once (no duplicate jobs, key `lessonId:kind`). Options are stored on the lesson. |
| POST | `/api/lessons/:id/cancel` | | `LessonDetail`. Running generators stop before their next resource, queued jobs are removed. |
| PATCH | `/api/resources/:id` | `{ content }` | New version (version 1 is the AI original). |
| POST | `/api/resources/:id/revert` | `RevertResourceBody { version }` | Restores that version as a NEW version. |
| POST | `/api/resources/:id/share` | `ShareBody` | **201** `SessionTeacherView` with `link` and `qrSvg`. Sharing is the approval: it approves the lesson when no checks are OPEN, or when `approveAnyway` is true; otherwise **409** with problem type `.../problems/checks-open` and `openChecks`. `expiresInHours` (default 24) and `leaderboard` (default TEAMS; INDIVIDUAL is held to TEAMS for Explorer classes). |
| POST | `/api/sessions/:id/action` | `{ action }` | `start`, `next`, `prev`, `reveal`, `end`, `toggleNames`, and `open` / `close` for the share link. |
| GET | `/api/resources/:id/export?format=pptx\|docx\|pdf&key=true\|false` | | Slides: PPTX and PDF; worksheet and quiz: DOCX and PDF (`key=false` leaves out the answer key); cards: DOCX and a printable PDF grid; game: DOCX and PDF. Arabic PDF is **422**; Arabic DOCX and PPTX are right to left. |
| GET | `/api/lessons/:id/results` | | Adds `averageTimeSec` and `ranking` (teacher only, never sent to students). |
| GET | `/api/realtime/token` | | `{ token, url }`: a 5-minute HMAC token for the Socket.IO handshake (`auth: { token }`), for a teacher session or the student cookie. |

Students:

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/play/:code/join` and `/api/play/code/:code/join` | `{ name }` | `JoinResult`; sets the cookie; the student is matched or created by first name + initial |
| GET | `/api/play/sessions/:id/questions` | | Assignment questions with no correct flags and no accepted answers (matching columns shuffled) |
| POST | `/api/play/:code/submit` | `PlaySubmitBody { answers[], durationSec }` | `{ score, correct, total, xp, durationSec, review[], alreadySubmitted }`. Graded on the server (short answers are normalized and matched against `acceptedAnswers`); idempotent per student; 409 when the link is closed or expired. |

### Drivers

`QUEUE_DRIVER=inline` + `REALTIME=poll` (default, Vercel): the same processors run with `waitUntil`, with the same idempotency, retries (3 attempts) and progress persisted in Postgres; clients poll every 1.5 s.
`QUEUE_DRIVER=bullmq` (+ `REDIS_URL`): a BullMQ flow with a parent `finalize` and children `generate.{kind}` (jobId `lessonId:kind`, 3 attempts, exponential backoff of 4 s, 3 min timeout, global limit of 5), Bull Board at `/admin/queues` for `ADMIN_EMAILS`, and shared rate limits in Redis. `WORKER_ONLY=true` runs workers without an HTTP listener.
`REALTIME=socket`: Socket.IO on the same port; rooms `lesson:{id}` and `session:{id}`; events `lesson.status`, `resource.progress|ready|failed`, `session.studentJoined|question|answer`. CORS uses `WEB_URL` plus `CORS_ORIGINS`.
