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
| GET | `/api/lessons/:id` | | `LessonDetail` (includes `curriculum`) |
| GET | `/api/lessons/:id/status` | | `{ status, resources: [{ kind, status, progress, error }], translations, updatedAt }`: the light poll target while a kit is generating (ONE query, no resource content, teacher-scoped, 404 for another teacher). Resources come in generation order; `updatedAt` is the latest change of the lesson or any resource. Use it instead of the full `GET /lessons/:id` while GENERATING, then fetch the detail once. |
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
| GET | `/api/play/games` | `?sessionId=` | `{ lessonId, lessonTitle, game, bestStars, assigned, points? }[]`. With `sessionId` (a GAME or ASSIGNMENT session of the student's class, not ended) only that session's lesson and the games the teacher published are listed, each with its `points` share. 404 for any other session. Without it, every playable game of every approved lesson (practice). |
| GET | `/api/play/games/:lessonId/:game` | `?sessionId=` | `StudentGame` plus `pointsWeight` (the game's share of the session's 100 points, or 100 without a session). With a `sessionId`, a game the teacher did not publish is 404. |
| POST | `/api/play/games/result` | `GameResultBody` | `GameResultView` (server scores with `scoreGame`, caps XP, unlocks badges, updates streak). `points` = `gamePoints()` from `total`, `firstTryCorrect`, `retriedCorrect`, `wrongTries` (-1 each) and `hintsUsed` (-5 each), never below 0. The weight is the game's share of the session's 100 points when `sessionId` names a session with published games, else 100 (practice). A game outside the published list is **400**. `wrongTries`, `hintsUsed` and `points` are stored on the GameResult; XP rules are unchanged (they reward effort). |
| GET | `/api/play/practice` | | `StudentPractice`: `open` (LIVE_QUIZ in LOBBY/LIVE, and open, unexpired ASSIGNMENT and GAME sessions, each with `joinCode` and `games`: the published games with their points, `[]` when the teacher restricted nothing) and `lessons` (every READY or PARTIAL, approved lesson of the student's class with `quizQuestions` (0 unless the QUIZ is READY), playable `games` and `bestStars`). Text follows the request locale with fallback. |
| GET | `/api/play/practice/:lessonId/quiz` | | `PracticeQuiz`: questions with no correct flags, no `acceptedAnswers` and no explanations. Multiple-choice options and the matching right-hand column are shuffled, in an order fixed per student and lesson so the server can map `optionIndex` back when grading. 404 for a lesson outside the student's class or without a READY quiz. |
| POST | `/api/play/practice/:lessonId/quiz` | `PracticeSubmitBody` (same as `PlaySubmitBody`) | `PracticeResult { score, correct, total, xp, review[] }`, where each review row is `{ questionId, correct, explanation, correctAnswer }`. Graded on the server with the same rules as the self-paced quiz. Creates **no** Participant or Answer rows, so class results and mastery are untouched. Practice XP is 2 per correct answer and 1 per attempt, capped at 20 per lesson per day (XpEvent reason `practice:<lessonId>`). Limited to 20 per minute per student (keyed on the student cookie, not the IP). |

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
| POST | `/api/lessons` | multipart: optional `file` + `CreateLessonBody` fields (a file, a prompt, or both; `curriculum` is `GENERAL` (default), `AMERICAN`, `BRITISH`, `EGYPTIAN` or `TUNISIAN`) | **201** `{ lessonId }` at once. In the background: extraction (`[[page N]]` markers, repeated headers/footers and page numbers removed, language detected, token count), the single analysis call (map-reduce above 60% of `ANALYSIS_BUDGET_TOKENS`), then generation when `autoGenerate` is true (default). The same file from the same teacher reuses the clean text and blueprint (`reuse=true`). Over 150 PDF pages needs `pageRange` (422 otherwise). Prompt-only lessons are `aiWritten`: the teacher's text is sent to the analysis as the `<topic>` (the provisional title is only a hint), and the provisional title names the topic (metadata clauses such as "Grade 11 Science" or "45 minutes" are skipped: "Grade 11 Science, 45-minute lesson on cyber security measures" becomes "Cyber security measures"). The chosen curriculum is stored on the lesson and added to every prompt as one header line ("Curriculum: American (Common Core / NGSS). Use its terminology, standard codes and examples where they apply."; `GENERAL` means no national curriculum). Limits: 10 uploads/hour/teacher (429), `MONTHLY_LESSON_QUOTA` lessons per month (429 `quota-exceeded`). Failures set `FAILED` with an error message. |
| POST | `/api/lessons/:id/source`, `/plan` | | Thin aliases: attach a file (409 with `existingLessonId` for a duplicate) and run the analysis synchronously. |
| POST | `/api/lessons/:id/generate` | `{ resources?, quizCount?, difficulty? }` | **202** `LessonDetail`. Idempotent: a double click claims the lesson once (no duplicate jobs, key `lessonId:kind`). Options are stored on the lesson. **Sequential by default** (`GENERATION_MODE=sequential`): one analysis call, then SLIDES, WORKSHEET, QUIZ, CARDS and GAME one after another, each WAITING -> WORKING -> READY or FAILED. A failed step does not block the next; the lesson ends READY or PARTIAL (FAILED only if every step failed). One kit is 7 Claude requests: 1 analysis + 5 generators + 1 review (a repair retry adds a request for that resource only; there is no call per slide). `GENERATION_MODE=parallel` starts all five at once. Retrying one resource runs just that one. |
| POST | `/api/lessons/:id/cancel` | | `LessonDetail`. Running generators stop before their next resource, queued jobs are removed. |
| PATCH | `/api/resources/:id` | `{ content }` | New version (version 1 is the AI original). |
| POST | `/api/resources/:id/revert` | `RevertResourceBody { version }` | Restores that version as a NEW version. |
| POST | `/api/resources/:id/share` | `ShareBody` | **201** `SessionTeacherView` with `link` and `qrSvg`. Sharing is the approval: it approves the lesson when no checks are OPEN, or when `approveAnyway` is true; otherwise **409** with problem type `.../problems/checks-open` and `openChecks`. `expiresInHours` (default 24) and `leaderboard` (default TEAMS; INDIVIDUAL is held to TEAMS for Explorer classes). `games` (GAME or ASSIGNMENT share of a game; 1 to 6 of `MATCH, SORT, EQUATION, MEMORY, TRUE_FALSE, ODD_ONE_OUT`) publishes only those games: each must be playable with the lesson's game content and the class band (400 naming the others), they are stored on the session (`ActivitySession.games`) and the 100 points are split among them (`SessionTeacherView.games`, e.g. 2 games = 50 each, 3 games = 34 / 33 / 33). Students see only those games for that session. |
| POST | `/api/sessions/:id/action` | `{ action }` | `start`, `next`, `prev`, `reveal`, `end`, `toggleNames`, and `open` / `close` for the share link. Every action broadcasts `session.state` (see Realtime). |
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
`QUEUE_DRIVER=bullmq` (+ `REDIS_URL`): a BullMQ flow with a parent `finalize` and `generate.{kind}` jobs (a chain in sequential mode: SLIDES runs first and each step starts when the previous one finished or failed; siblings in parallel mode; jobId `lessonId__kind`, 3 attempts, exponential backoff of 4 s, 3 min timeout, global limit of 5), Bull Board at `/admin/queues` for `ADMIN_EMAILS`, and shared rate limits in Redis. `WORKER_ONLY=true` runs workers without an HTTP listener.
`REALTIME=socket`: Socket.IO on the same port; rooms `lesson:{id}` and `session:{id}`; CORS uses `WEB_URL` plus `CORS_ORIGINS`. Polling always stays on as the fallback.

Realtime rooms and events (no event ever carries a correct answer):

| Room | Event | Payload | When |
|---|---|---|---|
| `lesson:{id}` (the teacher who owns it) | `lesson.status` | `{ lessonId, status }` | generation starts (GENERATING) and finishes (READY, PARTIAL or FAILED) |
| | `resource.progress` | `{ lessonId, kind, status: "WORKING", percent }` | each step of the sequential runner starts and each repair attempt |
| | `resource.ready` | `{ lessonId, kind, resourceId }` | a resource finished, in the order SLIDES, WORKSHEET, QUIZ, CARDS, GAME |
| | `resource.failed` | `{ lessonId, kind, resourceId, error }` | a resource failed (the next one still runs) |
| `session:{id}` (the teacher, or a student of the session's class with their realtime token; `join` checks `canJoin`) | `session.state` | `{ sessionId, status, currentQuestion, revealed, isOpen }` | start, next, prev, reveal, end, open, close (and toggleNames) |
| | `session.question` | `{ sessionId, index, timeLimit }` | a live quiz question opens (start, next, prev) |
| | `session.studentJoined` | `{ sessionId, name, count }` | a student joins (`name` is the child-safe display name) |
| | `session.answer` | `{ sessionId, questionIndex, answered }` | a student answers: a count only, never the choice, the student or the correct answer |

### Request cost of the hot polls

- `GET /api/play/sessions/:id` (student quiz poll): was 4 sequential queries plus a full quiz-content load; now 2 parallel queries (the session, scoped to the student's class through the relation, and the student's own answers) and the parsed quiz content comes from an in-memory LRU keyed by resource id + `updatedAt` + locale (`QUIZ_CACHE_TTL_MS`, default 60 s). A teacher edit bumps `updatedAt`, so it is a new key. A cache miss costs one extra query.
- `GET /api/sessions/:id` (teacher view): the quiz content comes from the same cache (a light key lookup replaces the full JSON load) and the QR code is made once per join link.
- `LessonSummary.averageScore` (lessons list, dashboard): reads the latest ended live quiz per lesson as a plain session list plus ONE grouped count of that session's answers, instead of every answer row of every ended session. The dashboard makes ONE `summaries()` call for the recent lessons and the next lesson.

## Demo access, admin and request ids

`Me` now has `role` (`"TEACHER"` or `"ADMIN"`).

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/demo/accounts` | | `DemoAccount[]` (teacher, student, admin) with EN/AR labels and descriptions, the email (null for the student) and `next` (`/app`, `/play` (the practice hub), `/admin`). **404 unless `DEMO_LOGIN=true`.** |
| POST | `/api/demo/login` | `DemoLoginBody { account }` | `DemoLoginResult { account, next }`. Teacher and admin: signs in server-side with `DEMO_PASSWORD` and forwards Better Auth's `Set-Cookie` headers (first-party on the web origin through the rewrite). Student: sets the signed `helpo_student` cookie for "Layla A." as a participant of the seeded self-paced quiz. 503 without `DEMO_PASSWORD` or seed data. Rate limited to 30 per minute per IP; logs the account only. **404 unless `DEMO_LOGIN=true`.** |
| GET | `/api/admin/overview` | | `AdminOverview`: totals, lessons by status, AI tokens with a per-model breakdown, the 10 most recent lessons and sessions, runtime flags. Role `ADMIN` only: another signed-in role gets **404**, nobody signed in gets 401. Bull Board at `/admin/queues` also admits role `ADMIN`. |

Demo accounts (`demo@helpo.test`, `admin@helpo.test`) have a smaller lesson quota: `DEMO_LESSON_QUOTA` (default 30) per month instead of
`MONTHLY_LESSON_QUOTA`. Refine-prompt is limited to 30 per hour per user on top of the per-IP limit.

Seeded always-open activities (6B, photosynthesis lesson; re-running the seed resets them): live quiz lobby code `202020`,
self-paced quiz code `303030`. Both codes are reserved and never generated at random.

### Request ids and limits

- Every response has `x-request-id`. An incoming one is kept only when it is a valid UUID, otherwise a new one is made. Problem
  responses carry the same value as `requestId`. One structured access line is logged per request (method, route pattern, status,
  ms, request id; no IP, body, query string or names); `/api/health` is not logged.
- Public join lookups (`GET /api/join/code/:code`, `/join/schools/:slug/classes`, `/join/classes/:id/students`,
  `GET /api/play/code/:code`) allow 120 per minute per IP, joins 60 per minute. The limits are generous on purpose: a whole class
  often shares one NAT address, while guessing six-digit codes is still throttled.
- Better Auth's own limiter stores its counters in the `rateLimit` table (Redis when `REDIS_URL` is set), so it holds across instances.
  Sign-in and sign-up allow 10 per minute per IP. It is on in production. Uploads are limited to 10 per hour per teacher in the shared store.
- `GET /api/lessons/:id/results` reads the session list as plain rows plus one grouped count, and loads answers only for the selected session.
