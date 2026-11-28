"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Star } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { readLastResult, type StoredResult } from "@/lib/student-helpers";
import { ButtonLink } from "@/components/ui/button";
import { Illus } from "@/components/ui/illus";
import { Progress } from "@/components/ui/progress";
import { Confetti, CountUp, Skeleton } from "@/components/ui/motion";
import { EASE, SPRING } from "@/lib/motion";

/** Win choreography: mascot, title, stars, XP and the rest rise one after another (opacity only under reduced motion, nothing in tests). */
function rise(delay: number, reduce: boolean | null) {
  return {
    initial: reduce ? false : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.36, ease: EASE.out, delay },
  } as const;
}

export function WinView() {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const [stored, setStored] = useState<StoredResult | null | undefined>(undefined);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is only readable in the browser
    setStored(readLastResult());
  }, []);

  if (stored === undefined) {
    return (
      <div className="winw" role="status" aria-busy="true">
        <div className="wincard"><Skeleton block={{ h: 96, w: 96, r: 999 }} lines={2} /></div>
        <span className="sr">{t("common.loading")}</span>
      </div>
    );
  }
  if (!stored) {
    return (
      <div className="winw">
        <div className="wincard">
          <h1>{t("win.none")}</h1>
          <ButtonLink href="/play">{t("student.back")}</ButtonLink>
        </div>
      </div>
    );
  }
  const { result, game, lessonId } = stored;
  const before = Math.max(0, result.xpIntoLevel - result.xp);

  return (
    <div className="winw">
      <div className="wincard">
        {result.stars >= 1 && <span className="win-bloom" aria-hidden="true" />}
        {result.stars >= 1 && <Confetti pieces={12 + result.stars * 6} />}
        <Illus name="star-buddy" size={110} className="mascot" />
        <motion.h1 {...rise(0.12, reduce)}>{t("win.title")}</motion.h1>
        <motion.p className="muted" style={{ position: "relative" }} {...rise(0.2, reduce)}>{t(`game.${game}` as "game.MATCH")}</motion.p>
        <div className="stars" role="img" aria-label={t("win.stars", { n: result.stars })}>
          {[1, 2, 3].map((n) => (
            <motion.span
              key={n}
              className={n <= result.stars ? "star-earned" : "star-open"}
              initial={reduce ? false : n <= result.stars ? { scale: 0.4, opacity: 0, rotate: -18 } : { opacity: 0 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={reduce ? { duration: 0.1 } : n <= result.stars ? { ...SPRING.playful, delay: 0.3 + 0.22 * n } : { duration: 0.3, delay: 0.3 + 0.22 * n }}
              style={{ display: "inline-flex" }}
            >
              <Star className="ic fill" aria-hidden="true" style={n <= result.stars ? { color: "#FFC83D", stroke: "#E8A100" } : { color: "#E4DAFF", stroke: "#C3B5F2" }} />
            </motion.span>
          ))}
        </div>
        <motion.p className="xpbig2" {...rise(0.3 + 0.22 * 3 + 0.1, reduce)}><CountUp value={result.xp} duration={0.9} delay={0.3 + 0.22 * 3 + 0.1} format={(n) => `+${Math.round(n)} XP`} /></motion.p>
        {typeof result.points === "number" && <motion.p className="ptsbig" {...rise(1.2, reduce)}>{t("win.points", { points: result.points })}</motion.p>}
        {result.personalBest && <motion.span className="st ready" style={{ position: "relative" }} {...rise(1.3, reduce)}>{t("win.best")}</motion.span>}
        <div className="winbar" hidden>
          <div className="l">
            <span><bdi dir="ltr">XP {before} → {result.xpIntoLevel}</bdi></span>
            <span className="muted">{t("win.level", { level: result.level })}</span>
          </div>
          <Progress value={result.xpIntoLevel} max={500} label={t("student.xpProgress", { level: result.level + 1 })} />
        </div>
      </div>
      <div className="wbtns">
        <Link className="btn big" href={`/play/games/${lessonId}/${game}`}>{t("win.again")}</Link>
        <Link className="btn big sec" href="/play">{t("student.back")}</Link>
      </div>
      <p className="stopline">{t("win.stop")}</p>
    </div>
  );
}
