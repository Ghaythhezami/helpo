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

export function WinView() {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const [stored, setStored] = useState<StoredResult | null | undefined>(undefined);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is only readable in the browser
    setStored(readLastResult());
  }, []);

  if (stored === undefined) return <p className="muted" role="status">{t("common.loading")}</p>;
  if (!stored) {
    return (
      <div className="winw">
        <div className="wincard">
          <h1>{t("win.none")}</h1>
          <ButtonLink href="/join">{t("student.back")}</ButtonLink>
        </div>
      </div>
    );
  }
  const { result, game, lessonId } = stored;
  const before = Math.max(0, result.xpIntoLevel - result.xp);

  return (
    <div className="winw">
      <div className="wincard">
        <Illus name="confetti" size={240} className="confetti" />
        <Illus name="star-buddy" size={110} className="mascot" />
        <h1>{t("win.title")}</h1>
        <p className="muted" style={{ position: "relative" }}>{t(`game.${game}` as "game.MATCH")}</p>
        <div className="stars" role="img" aria-label={t("win.stars", { n: result.stars })}>
          {[1, 2, 3].map((n) => (
            <motion.span key={n} initial={reduce ? false : { scale: 0.6, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: reduce ? 0 : 0.3 * n, duration: reduce ? 0.1 : 0.5, ease: [0.16, 1, 0.3, 1] }} style={{ display: "inline-flex" }}>
              <Star className="ic fill" aria-hidden="true" style={n <= result.stars ? { color: "#FFC83D", stroke: "#E8A100" } : { color: "#E4DAFF", stroke: "#C3B5F2" }} />
            </motion.span>
          ))}
        </div>
        <p className="xpbig2">+{result.xp} XP</p>
        {result.personalBest && <span className="st ready" style={{ position: "relative" }}>{t("win.best")}</span>}
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
        <Link className="btn big sec" href="/join">{t("student.back")}</Link>
      </div>
      <p className="stopline">{t("win.stop")}</p>
    </div>
  );
}
