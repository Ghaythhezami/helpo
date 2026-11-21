"use client";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { RESOURCE_KINDS } from "@helpo/shared";
import { RESOURCE_ART, RESOURCE_CARD_CLASS } from "@/lib/checks";
import { useI18n } from "@/lib/i18n";
import { ButtonLink } from "@/components/ui/button";
import { PillHeader } from "@/components/ui/card";
import { Illus } from "@/components/ui/illus";
import { DemoPicker } from "./demo-picker";

export function Landing() {
  const { t } = useI18n();
  return (
    <>
      <div className="hero landing-hero">
        <Illus name="books-pencils" size={200} className="art" />
        <div className="copy">
          <h1>{t("landing.title")}</h1>
          <p className="muted landing-lead">{t("landing.lead")}</p>
          <p className="hint">
            <ShieldCheck className="ic" aria-hidden="true" />
            <span>{t("landing.safe")}</span>
          </p>
        </div>
        <div className="act">
          <ButtonLink size="big" href="/login">
            {t("landing.cta.signin")}
            <ArrowRight className="flip" aria-hidden="true" />
          </ButtonLink>
          <ButtonLink size="big" variant="secondary" href="/join">{t("landing.cta.join")}</ButtonLink>
        </div>
      </div>

      <DemoPicker />

      <section className="panel" aria-labelledby="kit-h" style={{ marginBottom: 24 }}>
        <PillHeader id="kit-h" icon={<Illus name="level-star" size={36} />}>{t("landing.kit.heading")}</PillHeader>
        <ul className="landing-kit">
          {RESOURCE_KINDS.map((k) => (
            <li key={k} className={`rc ${RESOURCE_CARD_CLASS[k]}`}>
              <Illus name={RESOURCE_ART[k]} size={78} />
              <b>{t(`resource.${k}` as "resource.SLIDES")}</b>
              <span className="m">{t(`landing.res.${k}` as "landing.res.SLIDES")}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel recap" aria-labelledby="kids-h">
        <Illus name="star-buddy" size={80} />
        <div>
          <h2 id="kids-h">{t("landing.kids.heading")}</h2>
          <p className="muted">{t("landing.kids.text")}</p>
        </div>
        <ButtonLink size="sm" variant="secondary" href="/signup">{t("landing.kids.cta")}</ButtonLink>
      </section>
    </>
  );
}
