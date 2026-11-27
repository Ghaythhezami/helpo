"use client";
import { useReducer, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { CardsContent, ResourceView } from "@helpo/shared";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, RotateCcw, Shuffle } from "lucide-react";
import { currentCard, deckReducer, initDeck, remainingCards } from "@/lib/cards-deck";
import { useI18n } from "@/lib/i18n";
import { Button, buttonClass } from "@/components/ui/button";
import { Chip } from "@/components/ui/pill";
import { Progress } from "@/components/ui/progress";
import { exportHref } from "@/components/teacher/lesson-actions";

type Card = CardsContent["cards"][number];
type CardView = "deck" | "grid";

const SWIPE_PX = 48;
const SPRING = { type: "spring", stiffness: 220, damping: 24 } as const;

/** One big flip card with prev/next, shuffle, a progress bar and a "got it / review again" loop. */
export function CardsDeck({ cards, seed = "cards", className = "" }: { cards: Card[]; seed?: string; className?: string }) {
  const { t, dir } = useI18n();
  const reduced = useReducedMotion();
  const [state, dispatch] = useReducer(deckReducer, undefined, () => initDeck(cards.length, seed));
  const start = useRef<number | null>(null);
  const swiped = useRef(false);
  const rtl = dir === "rtl";
  const index = currentCard(state);
  const card = index === null ? null : cards[index];
  const nextKey = rtl ? "ArrowLeft" : "ArrowRight";
  const prevKey = rtl ? "ArrowRight" : "ArrowLeft";

  if (cards.length === 0) return <p className="muted">{t("cards.empty")}</p>;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === nextKey) {
      e.preventDefault();
      dispatch({ type: "next" });
    } else if (e.key === prevKey) {
      e.preventDefault();
      dispatch({ type: "prev" });
    }
  };
  const onDown = (e: PointerEvent<HTMLButtonElement>) => {
    start.current = e.clientX;
    swiped.current = false;
  };
  const onUp = (e: PointerEvent<HTMLButtonElement>) => {
    if (start.current === null) return;
    const dx = e.clientX - start.current;
    start.current = null;
    if (Math.abs(dx) < SWIPE_PX) return;
    swiped.current = true;
    // Dragging toward the start edge moves forward in either direction.
    dispatch({ type: dx < 0 !== rtl ? "next" : "prev" });
  };
  const onClick = () => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    dispatch({ type: "flip" });
  };

  const gotN = state.got.length;
  const reviewN = state.review.length;
  const remaining = remainingCards(state).length;
  const progressValue = state.done ? state.order.length : state.pos + 1;
  const face = state.flipped ? "back" : "front";
  const label = card ? t("cards.live", { n: state.pos + 1, total: state.order.length, face: t(`cards.face.${face}` as "cards.face.front"), text: state.flipped ? card.back : card.front }) : "";
  const rotation = reduced ? 0 : state.flipped ? 180 : 0;

  return (
    <div className={`cdk ${className}`.trim()} role="group" aria-label={t("cards.deck")} onKeyDown={onKeyDown}>
      <div className="cdk-top">
        <Progress value={progressValue} max={state.order.length} label={t("cards.progress")} className="cdk-bar" />
        <bdi dir="ltr" className="cdk-count">{progressValue} / {state.order.length}</bdi>
        {state.round > 0 && <Chip>{t("cards.round", { n: state.round })}</Chip>}
      </div>

      {state.done || !card ? (
        <div className="cdk-finish" role="status">
          <h4>{t("cards.finish.title")}</h4>
          <p>{remaining === 0 ? t("cards.finish.allDone") : t("cards.finish.counts", { got: gotN, review: remaining })}</p>
          <div className="cdk-actions">
            {remaining > 0 && (
              <Button onClick={() => dispatch({ type: "restartReview" })}>
                <RotateCcw className="ic" aria-hidden="true" /> {t("cards.finish.again", { n: remaining })}
              </Button>
            )}
            <Button variant="secondary" onClick={() => dispatch({ type: "reset" })}>{t("cards.startOver")}</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="cdk-stage">
            <button
              type="button"
              className="cdk-card"
              data-flipped={state.flipped ? "true" : "false"}
              aria-pressed={state.flipped}
              aria-label={label}
              onClick={onClick}
              onPointerDown={onDown}
              onPointerUp={onUp}
              onPointerCancel={() => { start.current = null; }}
            >
              <motion.span className="cdk-flip" animate={{ rotateY: rotation }} transition={reduced ? { duration: 0 } : SPRING}>
                <motion.span className="cdk-face front" aria-hidden={state.flipped} animate={{ opacity: reduced && state.flipped ? 0 : 1 }} transition={{ duration: 0.18 }}>
                  <Chip>{t(`tag.${card.tag}` as "tag.concept")}</Chip>
                  {card.emoji ? <span className="cdk-emoji" aria-hidden="true">{card.emoji}</span> : null}
                  <b>{card.front}</b>
                </motion.span>
                <motion.span className="cdk-face back" aria-hidden={!state.flipped} animate={{ opacity: reduced && !state.flipped ? 0 : 1 }} transition={{ duration: 0.18 }}>
                  <Chip>{t(`tag.${card.tag}` as "tag.concept")}</Chip>
                  <b>{card.back}</b>
                </motion.span>
              </motion.span>
            </button>
          </div>
          <p className="cdk-hint muted" role="status" aria-live="polite">{state.flipped ? t("cards.hintSort") : t("cards.hint")}</p>

          <div className="cdk-sort">
            <Button variant="secondary" className="cdk-review" disabled={!state.flipped} onClick={() => dispatch({ type: "mark", as: "review" })}>
              <RotateCcw className="ic" aria-hidden="true" /> {t("cards.review")}
            </Button>
            <Button className="cdk-got" disabled={!state.flipped} onClick={() => dispatch({ type: "mark", as: "got" })}>
              <Check className="ic" aria-hidden="true" /> {t("cards.got")}
            </Button>
          </div>
        </>
      )}

      <div className="cdk-nav">
        <Button variant="secondary" size="sm" className="cdk-icon" aria-label={t("cards.prev")} disabled={state.done || state.pos === 0} onClick={() => dispatch({ type: "prev" })}>
          <ArrowLeft className="flip ic" aria-hidden="true" />
        </Button>
        <ul className="cdk-piles" aria-label={t("cards.piles")}>
          <li>{t("cards.pileGot", { n: gotN })}</li>
          <li>{t("cards.pileReview", { n: reviewN })}</li>
        </ul>
        <Button variant="secondary" size="sm" onClick={() => dispatch({ type: "shuffle" })}>
          <Shuffle className="ic" aria-hidden="true" /> {t("cards.shuffle")}
        </Button>
        <Button variant="secondary" size="sm" className="cdk-icon" aria-label={t("cards.next")} disabled={state.done || state.pos >= state.order.length - 1} onClick={() => dispatch({ type: "next" })}>
          <ArrowRight className="flip ic" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

/** Compact read-only grid of every card (front on top, back below). */
export function CardsGrid({ cards }: { cards: Card[] }) {
  const { t } = useI18n();
  return (
    <ul className="cdk-grid" aria-label={t("cards.grid")}>
      {cards.map((c, i) => (
        <li key={i} id={`item-cards-${i}`} className="cdk-mini">
          <Chip>{t(`tag.${c.tag}` as "tag.concept")}</Chip>
          <b>{c.emoji ? <span aria-hidden="true">{c.emoji} </span> : null}{c.front}</b>
          <span>{c.back}</span>
        </li>
      ))}
    </ul>
  );
}

/** Teacher tab: deck by default, a Deck | Grid toggle and the print/PDF export. */
export function CardsPreview({ resource }: { resource: ResourceView }) {
  const { t } = useI18n();
  const content = resource.content as CardsContent;
  const [view, setView] = useState<CardView>("deck");
  return (
    <div className="doc cdk-doc" data-resource-id={resource.id}>
      <div className="cdk-head">
        <h3>{t("resource.CARDS")}</h3>
        <div className="cdk-seg" role="radiogroup" aria-label={t("cards.view")}>
          {(["deck", "grid"] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)}>
              {t(`cards.view.${v}` as "cards.view.deck")}
            </button>
          ))}
        </div>
        <a className={buttonClass("secondary", "sm")} href={exportHref(resource.id, "pdf")} download>{t("cards.export")}</a>
      </div>
      <div className="dm"><span>{t("preview.cards.meta", { n: content.cards.length })}</span></div>
      {view === "deck" ? <CardsDeck cards={content.cards} seed={resource.id} /> : <CardsGrid cards={content.cards} />}
    </div>
  );
}
