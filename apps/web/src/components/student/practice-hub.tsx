"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { GAME_KINDS, GAME_TEMPLATES, type GameKind, type StudentPractice } from "@helpo/shared";
import { ArrowDownUp, CircleCheck, LayoutGrid, ListOrdered, NotebookPen, Radio, ScanSearch, Shuffle, Star, type LucideIcon } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useI18n, type TFunction } from "@/lib/i18n";
import { usePractice, useStudentHome } from "@/lib/queries";
import { ButtonLink } from "@/components/ui/button";
import { Illus } from "@/components/ui/illus";
import { Async, EmptyState } from "@/components/ui/states";

/** One icon per game template (the templates carry the names; the pictures live here). */
export const GAME_ICONS: Record<GameKind, LucideIcon> = { MATCH: Shuffle, MEMORY: LayoutGrid, SORT: ArrowDownUp, EQUATION: ListOrdered, TRUE_FALSE: CircleCheck, ODD_ONE_OUT: ScanSearch };

/** Thinking games first (GAME_KINDS order), whatever order the API lists them in. */
export function orderGames(games: readonly GameKind[]): GameKind[] {
  return [...games].sort((a, b) => GAME_KINDS.indexOf(a) - GAME_KINDS.indexOf(b));
}

export function gameName(kind: GameKind, locale: string, t: TFunction): string {
  return locale === "ar" ? GAME_TEMPLATES[kind].nameAr : t(`game.${kind}` as "game.MATCH");
}

type Open = StudentPractice["open"][number];

/** Where an open session is entered: the live quiz, the homework (self-paced) or the lesson's first game. */
export function openHref(o: Open, lessons: StudentPractice["lessons"]): string | null {
  if (o.type === "LIVE_QUIZ") return `/play/quiz/${o.sessionId}`;
  if (o.type === "ASSIGNMENT") return `/play/self/${o.sessionId}?code=${o.joinCode}`;
  const lesson = lessons.find((l) => l.title === o.lessonTitle && l.games.length > 0);
  return lesson ? `/play/games/${lesson.lessonId}/${orderGames(lesson.games)[0]}` : null;
}

function Stars({ n }: { n: number }) {
  const { t } = useI18n();
  const count = Math.max(0, Math.min(3, Math.round(n)));
  return (
    <span className="lstars" role="img" aria-label={count > 0 ? t("practice.stars", { n: count }) : t("practice.stars.none")}>
      {[1, 2, 3].map((i) => (
        <Star key={i} className={`ic ${i <= count ? "on" : ""}`} aria-hidden="true" />
      ))}
    </span>
  );
}

/** The student's one home: what is live now, and every lesson they can practise whenever they like. */
export function PracticeHub() {
  const { t } = useI18n();
  const router = useRouter();
  const practice = usePractice();
  const unauthorized = practice.error instanceof ApiError && practice.error.isUnauthorized;
  useEffect(() => {
    if (unauthorized) router.replace("/join");
  }, [unauthorized, router]);
  return (
    <Async query={practice} label={t("practice.loading")} signInHref="/join" signInLabel={t("student.signin")}>
      {(data) => <Hub data={data} />}
    </Async>
  );
}

function Hub({ data }: { data: StudentPractice }) {
  const { t, locale } = useI18n();
  const home = useStudentHome();
  const open = data.open
    .map((o) => ({ o, href: openHref(o, data.lessons) }))
    .filter((x): x is { o: Open; href: string } => x.href !== null);
  const label = (type: Open["type"]) => (type === "LIVE_QUIZ" ? t("practice.live.quiz") : type === "ASSIGNMENT" ? t("practice.live.homework") : t("practice.live.game"));
  const action = (type: Open["type"]) => (type === "LIVE_QUIZ" ? t("practice.open.quiz") : type === "ASSIGNMENT" ? t("practice.open.homework") : t("practice.open.game"));

  return (
    <div className="hubw">
      <header className="hubh">
        <Illus name="star-buddy" size={56} className="mascot" />
        <div>
          <h1>{t("practice.title")}</h1>
          <p className="muted">{home.data ? t("practice.hi", { name: home.data.displayName }) : t("practice.class", { class: data.className })}</p>
        </div>
      </header>

      <section className="hubs" aria-labelledby="hub-live">
        <h2 id="hub-live"><Radio className="ic" aria-hidden="true" />{t("practice.live")}</h2>
        {open.length === 0 ? (
          <p className="muted livenone">{t("practice.live.none")}</p>
        ) : (
          <ul className="livec">
            {open.map(({ o, href }) => (
              <li key={o.sessionId} className="livecard">
                <span className="st ready">{label(o.type)}</span>
                <b>{o.lessonTitle}</b>
                <ButtonLink size="big" href={href}>{action(o.type)}</ButtonLink>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="hubs grow" aria-labelledby="hub-any">
        <h2 id="hub-any"><NotebookPen className="ic" aria-hidden="true" />{t("practice.anytime")}</h2>
        {data.lessons.length === 0 ? (
          <EmptyState art="books-pencils" title={t("practice.none")}>{t("practice.none.text")}</EmptyState>
        ) : (
          <ul className="lessl" aria-label={t("practice.lessons")}>
            {data.lessons.map((l) => (
              <li key={l.lessonId} className="lescard">
                <div className="lhead">
                  <h3>{l.number !== null ? `${l.number}. ` : ""}{l.title}</h3>
                  <Stars n={l.bestStars} />
                </div>
                <div className="lacts">
                  {l.quizQuestions > 0 && <ButtonLink href={`/play/practice/${l.lessonId}`}>{t("practice.quiz", { n: l.quizQuestions })}</ButtonLink>}
                  {orderGames(l.games).map((g) => {
                    const Icon = GAME_ICONS[g];
                    return (
                      <ButtonLink key={g} variant="secondary" href={`/play/games/${l.lessonId}/${g}`}>
                        <Icon className="ic" aria-hidden="true" />{gameName(g, locale, t)}
                      </ButtonLink>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="hubf">
        <ButtonLink variant="secondary" href="/join">{t("practice.done")}</ButtonLink>
        <ButtonLink variant="ghost" href="/join">{t("practice.switch")}</ButtonLink>
      </footer>
    </div>
  );
}
