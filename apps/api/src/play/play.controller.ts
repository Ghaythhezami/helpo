import { Body, Controller, Get, HttpCode, Param, Post, Put, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { AnswerBody, AvatarBody, CodeJoinBody, PlaySubmitBody, GameResultBody, PracticeSubmitBody, UpdateLocaleBody, type Locale } from "@helpo/shared";
import type { z } from "zod";
import { CurrentStudent, StudentGuard, type StudentContext } from "../auth/student.guard";
import { ReqLocale } from "../common/i18n";
import { RateLimit } from "../common/rate-limit";
import { STUDENT_COOKIE, STUDENT_COOKIE_TTL_SECONDS, signStudentToken, studentCookieOptions } from "../common/student-cookie";
import { ZodValidationPipe } from "../common/zod.pipe";
import { JoinService } from "../join/join.service";
import { PlayService } from "./play.service";
import { PracticeService } from "./practice.service";

@Controller("play")
export class PlayController {
  constructor(
    private readonly play: PlayService,
    private readonly join: JoinService,
    private readonly practice: PracticeService,
  ) {}

  /** Share by code: which class and activity a code opens. Public, child-safe. */
  @Get("code/:code")
  @RateLimit("join-lookup", 120)
  byCode(@Param("code") code: string, @ReqLocale() locale: Locale) {
    return this.join.byCode(code, locale);
  }

  /** Share by code: type a name, get a student cookie (matched or created by child-safe name). */
  /** Whole self-paced quiz at once; scored on the server. */
  @Post(":code/submit")
  @UseGuards(StudentGuard)
  @HttpCode(200)
  @RateLimit("answers", 600)
  submit(@CurrentStudent() s: StudentContext, @ReqLocale() locale: Locale, @Param("code") code: string, @Body(new ZodValidationPipe(PlaySubmitBody)) body: z.infer<typeof PlaySubmitBody>) {
    return this.play.submitBatch(s.id, code, body, locale);
  }

  /** Same as POST /play/code/:code/join (the spec path). */
  @Post(":code/join")
  @HttpCode(200)
  @RateLimit("join", 60)
  joinAlias(@Param("code") code: string, @Body(new ZodValidationPipe(CodeJoinBody)) body: z.infer<typeof CodeJoinBody>, @Res({ passthrough: true }) res: Response) {
    return this.joinByCode(code, body, res);
  }

  @Post("code/:code/join")
  @HttpCode(200)
  @RateLimit("join", 60)
  async joinByCode(@Param("code") code: string, @Body(new ZodValidationPipe(CodeJoinBody)) body: z.infer<typeof CodeJoinBody>, @Res({ passthrough: true }) res: Response) {
    const { result, studentId, classId } = await this.join.joinWithName(code, body.name);
    res.cookie(STUDENT_COOKIE, signStudentToken({ studentId, classId, exp: Math.floor(Date.now() / 1000) + STUDENT_COOKIE_TTL_SECONDS }), studentCookieOptions());
    return result;
  }


  @Post("leave")
  @HttpCode(204)
  leave(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(STUDENT_COOKIE, { path: "/" });
  }

  @Get("me")
  @UseGuards(StudentGuard)
  me(@CurrentStudent() s: StudentContext, @ReqLocale() locale: Locale) {
    return this.play.home(s.id, locale);
  }

  @Put("me/avatar")
  @UseGuards(StudentGuard)
  avatar(@CurrentStudent() s: StudentContext, @ReqLocale() locale: Locale, @Body(new ZodValidationPipe(AvatarBody)) body: z.infer<typeof AvatarBody>) {
    return this.play.setAvatar(s.id, body, locale);
  }

  @Put("me/locale")
  @UseGuards(StudentGuard)
  setLocale(@CurrentStudent() s: StudentContext, @Body(new ZodValidationPipe(UpdateLocaleBody)) body: z.infer<typeof UpdateLocaleBody>) {
    return this.play.setLocale(s.id, body.locale);
  }

  @Get("sessions/:id")
  @UseGuards(StudentGuard)
  state(@CurrentStudent() s: StudentContext, @ReqLocale() locale: Locale, @Param("id") id: string) {
    return this.play.quizState(s.id, id, locale);
  }

  @Post("sessions/:id/submit")
  @UseGuards(StudentGuard)
  @HttpCode(200)
  @RateLimit("answers", 600)
  submitBySession(@CurrentStudent() s: StudentContext, @ReqLocale() locale: Locale, @Param("id") id: string, @Body(new ZodValidationPipe(PlaySubmitBody)) body: z.infer<typeof PlaySubmitBody>) {
    return this.play.submitBySession(s.id, id, body, locale);
  }

  @Get("sessions/:id/questions")
  @UseGuards(StudentGuard)
  questions(@CurrentStudent() s: StudentContext, @ReqLocale() locale: Locale, @Param("id") id: string) {
    return this.play.questionsFor(s.id, id, locale);
  }

  @Post("sessions/:id/answers")
  @UseGuards(StudentGuard)
  @RateLimit("answers", 600)
  answer(@CurrentStudent() s: StudentContext, @ReqLocale() locale: Locale, @Param("id") id: string, @Body(new ZodValidationPipe(AnswerBody)) body: z.infer<typeof AnswerBody>) {
    return this.play.submitAnswer(s.id, id, body, locale);
  }

  @Get("games")
  @UseGuards(StudentGuard)
  games(@CurrentStudent() s: StudentContext, @ReqLocale() locale: Locale) {
    return this.play.listGames(s.id, locale);
  }

  @Post("games/result")
  @UseGuards(StudentGuard)
  @RateLimit("answers", 600)
  gameResult(@CurrentStudent() s: StudentContext, @ReqLocale() locale: Locale, @Body(new ZodValidationPipe(GameResultBody)) body: z.infer<typeof GameResultBody>) {
    return this.play.submitGame(s.id, body, locale);
  }

  @Get("games/:lessonId/:game")
  @UseGuards(StudentGuard)
  game(@CurrentStudent() s: StudentContext, @ReqLocale() locale: Locale, @Param("lessonId") lessonId: string, @Param("game") game: string) {
    return this.play.game(s.id, lessonId, game.toUpperCase(), locale);
  }

  /** Practice hub: open activities plus every lesson of the class, playable any time. */
  @Get("practice")
  @UseGuards(StudentGuard)
  practiceList(@CurrentStudent() s: StudentContext, @ReqLocale() locale: Locale) {
    return this.practice.list(s.id, locale);
  }

  @Get("practice/:lessonId/quiz")
  @UseGuards(StudentGuard)
  practiceQuiz(@CurrentStudent() s: StudentContext, @ReqLocale() locale: Locale, @Param("lessonId") lessonId: string) {
    return this.practice.quiz(s.id, lessonId, locale);
  }

  /** Graded on the server; no Participant or Answer rows, so class results are untouched. 20 per minute per student. */
  @Post("practice/:lessonId/quiz")
  @UseGuards(StudentGuard)
  @HttpCode(200)
  @RateLimit("practice", 20, 60_000, "student")
  practiceSubmit(@CurrentStudent() s: StudentContext, @ReqLocale() locale: Locale, @Param("lessonId") lessonId: string, @Body(new ZodValidationPipe(PracticeSubmitBody)) body: z.infer<typeof PracticeSubmitBody>) {
    return this.practice.submit(s.id, lessonId, body, locale);
  }
}
