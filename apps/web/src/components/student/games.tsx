"use client";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Check } from "lucide-react";
import { equationReducer, equationResult, initEquation, type EquationPart } from "@/lib/games/equation";
import { initMatch, matchProgress, matchReducer, matchResult, type MatchMessage } from "@/lib/games/match";
import { initMemory, memoryReducer, memoryResult } from "@/lib/games/memory";
import { initSort, sortReducer, sortRemaining, sortResult, type Basket } from "@/lib/games/sort";
import { useI18n, type TFunction } from "@/lib/i18n";
import { initTrueFalse, trueFalseReducer, trueFalseResult } from "@/lib/games/truefalse";
import { beep, tileArt } from "@/lib/student-helpers";
import { Button } from "@/components/ui/button";
import { Illus } from "@/components/ui/illus";
import { Progress } from "@/components/ui/progress";
import { ReadAloud } from "./read-aloud";
import { DoneBox, ResetIcon, Tile, Tools, XpPop, type GameProps } from "./game-bits";

function matchText(message: MatchMessage, t: TFunction): string {
  switch (message.kind) {
    case "start":
      return t("game.match.start");
    case "picked":
      return t("game.match.picked", { label: message.label });
    case "need-left":
      return t("game.match.needLeft");
    case "match":
      return t("game.match.match", { left: message.left, right: message.right, xp: message.xp }) + (message.retry ? ` ${t("game.retryBonus")}` : "") + (message.combo >= 2 ? ` ${t("game.combo", { n: message.combo })}` : "");
    case "miss":
      return t("game.notYet");
    case "hint":
      return t("game.match.hint", { left: message.left, right: message.right });
    case "round-done":
      return t("game.round.done", { n: message.round });
    case "finished":
      return t("game.match.finished");
  }
}

/* ---------------------------------- Match ---------------------------------- */

export function MatchGame({ content, seed, explorer, sound, onFinish, busy }: GameProps) {
  const { t } = useI18n();
  const [state, dispatch] = useReducer(matchReducer, content.pairs, (p) => initMatch(p, seed));
  const [shake, setShake] = useState<number | null>(null);
  const [pop, setPop] = useState({ xp: 0, id: 0 });
  const lastRight = useRef<number | null>(null);
  const left = state.rounds[state.round] ?? [];
  const right = state.rightOrder[state.round] ?? [];
  const progress = matchProgress(state);

  useEffect(() => {
    if (state.message.kind === "miss") {
       
      setShake(lastRight.current);
      beep(sound, 220);
      const id = setTimeout(() => setShake(null), 450);
      return () => clearTimeout(id);
    }
    if (state.message.kind === "match" || state.message.kind === "round-done" || state.message.kind === "finished") {
      beep(sound, 520 + state.combo * 60);
       
      setPop((p) => ({ xp: state.message.kind === "match" ? state.message.xp : 0, id: p.id + 1 }));
    }
  }, [state.message, state.combo, sound]);

  return (
    <>
      <div className="gstat">
        <div className="combo">
          <span>{state.combo >= 2 ? t("game.combo", { n: state.combo }) : t("game.combo.none")}</span>
          <Progress value={Math.min(state.combo, 4)} max={4} label={t("game.combo.label")} />
        </div>
        <div className="progress">
          <span><bdi dir="ltr">{progress.done} / {progress.total}</bdi> {t("game.pairs")}</span>
          <span className="dots" aria-hidden="true">{state.pairs.map((_, i) => <i key={i} className={i < progress.done ? "ok" : ""} />)}</span>
        </div>
        <span className="st soft">{t("game.roundXp", { xp: state.xp })}</span>
      </div>
      <div className="board" style={{ position: "relative" }}>
        <XpPop xp={pop.xp} id={pop.id} />
        <p className="muted" style={{ textAlign: "center", marginBottom: 12 }}>{t("game.match.how")}</p>
        <div className="cols">
          <div className="col">
            <h2 id="m-left">{t("game.match.left")}</h2>
            <ul aria-labelledby="m-left" style={{ display: "grid", gap: 14 }}>
              {left.map((i) => (
                <Tile key={i} neutral={false} label={state.pairs[i].left} explorer={explorer} pressed={state.selected === i} matched={state.matched.includes(i)} hint={state.hint === i} onClick={() => dispatch({ type: "selectLeft", index: i })} />
              ))}
            </ul>
          </div>
          <div className="col">
            <h2 id="m-right">{t("game.match.right")}</h2>
            <ul aria-labelledby="m-right" style={{ display: "grid", gap: 14 }}>
              {right.map((i) => (
                <Tile key={i} neutral label={state.pairs[i].right} explorer={explorer} matched={state.matched.includes(i)} hint={state.hint === i} shake={shake === i} onClick={() => { lastRight.current = i; dispatch({ type: "selectRight", index: i }); }} />
              ))}
            </ul>
          </div>
        </div>
        <p className="msg" role="status" aria-live="polite">{matchText(state.message, t)}</p>
        <Tools onHint={() => dispatch({ type: "hint" })}><span className="muted small" style={{ alignSelf: "center" }}>{t("game.hint.free")}</span></Tools>
        {state.roundDone && !state.finished && <DoneBox text={t("game.round.complete", { n: state.round + 1 })} cta={t("game.round.next", { n: state.round + 2 })} onClick={() => dispatch({ type: "nextRound" })} />}
        {state.finished && <DoneBox text={t("game.match.all", { n: state.pairs.length })} cta={t("game.results")} busy={busy} onClick={() => onFinish(matchResult(state))} />}
      </div>
    </>
  );
}

/* ---------------------------------- Memory ---------------------------------- */

export function MemoryGame({ content, seed, explorer, sound, onFinish, busy }: GameProps) {
  const { t } = useI18n();
  const [state, dispatch] = useReducer(memoryReducer, content.pairs, (p) => initMemory(p, seed));
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    if (!state.mismatch) return;
    const id = setTimeout(() => dispatch({ type: "resolve" }), 900);
    return () => clearTimeout(id);
  }, [state.mismatch]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- live-region text follows game state
    setAnnounce(state.finished ? t("game.memory.finished") : state.mismatch ? t("game.notYet") : state.matched.length > 0 ? t("game.memory.found", { n: state.matched.length, total: state.pairCount }) : t("game.memory.start"));
    if (state.matched.length > 0) beep(sound, 560);
  }, [state.matched.length, state.mismatch, state.finished, state.pairCount, sound, t]);

  const hintPair = state.hint;
  return (
    <>
      <div className="gstat">
        <div className="progress">
          <span><bdi dir="ltr">{state.matched.length} / {state.pairCount}</bdi> {t("game.pairs")}</span>
          <span className="dots" aria-hidden="true">{Array.from({ length: state.pairCount }, (_, i) => <i key={i} className={i < state.matched.length ? "ok" : ""} />)}</span>
        </div>
        <span className="st soft">{t("game.memory.tries", { n: state.attempts })}</span>
      </div>
      <div className="board">
        <p className="muted" style={{ textAlign: "center", marginBottom: 12 }}>{t("game.memory.how")}</p>
        <ul className="memgrid" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
          {state.cards.map((card) => {
            const open = state.flipped.includes(card.id) || state.matched.includes(card.pair);
            const matched = state.matched.includes(card.pair);
            return (
              <li key={card.id} className="tw">
                <button
                  type="button"
                  className={`tile ${matched ? "matched" : open ? "c-peri" : "c-answer"} ${hintPair === card.pair && !open ? "hint" : ""}`}
                  style={{ minHeight: explorer ? 110 : 90, justifyContent: "center", textAlign: "center", fontSize: explorer ? 20 : 17 }}
                  aria-pressed={open}
                  disabled={matched}
                  aria-label={open ? card.text : t("game.memory.card", { n: card.id + 1 })}
                  onClick={() => dispatch({ type: "flip", id: card.id })}
                >
                  {open ? card.text : <Illus name="level-star" size={40} />}
                  {matched && <Check className="ic ck" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="msg" role="status" aria-live="polite">{announce}</p>
        <Tools onHint={() => dispatch({ type: "hint" })} />
        {state.finished && <DoneBox text={t("game.memory.finished")} cta={t("game.results")} busy={busy} onClick={() => onFinish(memoryResult(state))} />}
      </div>
    </>
  );
}

/* ----------------------------------- Sort ----------------------------------- */

export function SortGame({ content, seed, explorer, sound, onFinish, busy }: GameProps) {
  const { t } = useI18n();
  const [state, dispatch] = useReducer(sortReducer, content.sortItems, (items) => initSort(items, seed));
  const [dragging, setDragging] = useState<{ index: number; x: number; y: number } | null>(null);
  const [over, setOver] = useState<Basket | null>(null);
  const [shake, setShake] = useState<number | null>(null);
  const bank = sortRemaining(state);
  const lastPicked = useRef<number | null>(null);
  const suppress = useRef(false);

  useEffect(() => {
    if (state.message.kind === "miss") {
       
      setShake(lastPicked.current);
      beep(sound, 220);
      const id = setTimeout(() => setShake(null), 450);
      return () => clearTimeout(id);
    }
    if (state.message.kind === "placed") beep(sound, 560);
  }, [state.message, sound]);

  const place = (basket: Basket, index?: number) => {
    lastPicked.current = index ?? state.selected;
    dispatch({ type: "place", basket, index });
  };

  // Drag with pointer events; tap-to-place stays available for touch and keyboard.
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      setDragging((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-basket]");
      setOver((el?.dataset.basket as Basket | undefined) ?? null);
    };
    const up = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-basket]");
      suppress.current = true;
      setTimeout(() => (suppress.current = false), 0);
      if (el && dragging) place(el.dataset.basket as Basket, dragging.index);
      setDragging(null);
      setOver(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- place only reads current state through dispatch
  }, [dragging?.index]);

  const baskets = content.sortBaskets;
  const total = state.items.length;
  const done = Object.keys(state.placed).length;

  return (
    <>
      <div className="gstat">
        <div className="progress"><span>{t("game.sort.progress", { done, total })}</span></div>
        <span className="st soft">{t("game.roundXp", { xp: state.xp })}</span>
      </div>
      <div className="board">
        <p className="muted" style={{ textAlign: "center", marginBottom: 12 }}>{t("game.sort.how")}</p>
        <ul className="bank" aria-label={t("game.sort.bank")}>
          {bank.map((i) => (
            <li key={i} className="tw" onPointerDown={(e) => e.button === 0 && !explorer && setDragging({ index: i, x: e.clientX, y: e.clientY })}>
              <button
                type="button"
                className={`tile c-answer ${shake === i ? "shake" : ""} ${dragging?.index === i ? "drag" : ""}`}
                aria-pressed={state.selected === i}
                style={dragging?.index === i ? { transform: "translate(0,0)" } : explorer ? { minHeight: 100 } : undefined}
                onClick={() => !suppress.current && dispatch({ type: "select", index: i })}
              >
                {tileArt(state.items[i].label) && <Illus name={tileArt(state.items[i].label) as string} size={60} />}
                <span>{state.items[i].label}</span>
              </button>
              {explorer && <ReadAloud text={state.items[i].label} compact />}
            </li>
          ))}
        </ul>
        <div className="baskets">
          {(["yes", "no"] as const).map((b) => (
            <button key={b} type="button" data-basket={b} className={`basket ${b} ${over === b ? "over" : ""}`} onClick={() => !suppress.current && place(b)}>
              <Illus name={b === "yes" ? "basket-yes" : "basket-no"} size={110} />
              <b>{baskets[b]}</b>
              <span className="sr">{t("game.sort.basket")}</span>
              <span className="placed">
                {state.items.map((it, i) => (state.placed[i] === b ? <span key={i}><Check className="ic" aria-hidden="true" />{it.label}</span> : null))}
              </span>
            </button>
          ))}
        </div>
        <p className="msg" role="status" aria-live="polite">{localSort(state.message, baskets, t)}</p>
        {state.finished && <DoneBox text={t("game.sort.all", { n: total })} cta={t("game.results")} busy={busy} onClick={() => onFinish(sortResult(state))} />}
      </div>
    </>
  );
}

function localSort(message: ReturnType<typeof initSort>["message"], baskets: { yes: string; no: string }, t: TFunction): string {
  switch (message.kind) {
    case "start":
      return t("game.sort.start");
    case "picked":
      return t("game.sort.picked", { label: message.label });
    case "need-item":
      return t("game.sort.needItem");
    case "placed":
      return t("game.sort.placed", { label: message.label, basket: message.basket === "yes" ? baskets.yes : baskets.no, xp: message.xp }) + (message.retry ? ` ${t("game.retryBonus")}` : "");
    case "miss":
      return t("game.notYet");
    case "finished":
      return t("game.sort.all", { n: message.total });
  }
}


/* ---------------------------------- Equation ---------------------------------- */

export function EquationGame({ content, seed, explorer, sound, onFinish, busy }: GameProps) {
  const { t } = useI18n();
  const [state, dispatch] = useReducer(equationReducer, content.equationTiles, (tiles) => initEquation(tiles, seed));
  const [shake, setShake] = useState(false);
  const model = state.model;

  useEffect(() => {
    if (state.message.kind === "wrong") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- shake wrong slots once
      setShake(true);
      beep(sound, 220);
      const id = setTimeout(() => setShake(false), 450);
      return () => clearTimeout(id);
    }
    if (state.message.kind === "correct") beep(sound, 700);
  }, [state.message, sound]);

  const message = useMemo(() => {
    const m = state.message;
    if (m.kind === "start") return t("game.eq.start");
    if (m.kind === "taken") return t("game.eq.taken", { label: m.label });
    if (m.kind === "full") return t("game.eq.full");
    if (m.kind === "incomplete") return t("game.eq.incomplete");
    if (m.kind === "wrong") return t("game.eq.wrong");
    return t("game.eq.correct") + (m.retry ? ` ${t("game.retryBonus")}` : "");
  }, [state.message, t]);

  return (
    <>
      <div className="board">
        <p className="muted" style={{ textAlign: "center", marginBottom: 12 }}>{t("game.eq.how")}</p>
        <div className="eq" role="group" aria-label={t("game.eq.group")} dir="ltr">
          {model.parts.map((part: EquationPart, i) =>
            part.kind === "op" ? (
              <span key={i} className="op" aria-hidden="true">{part.text}</span>
            ) : (
              <button
                key={i}
                type="button"
                className={`slot ${state.slots[part.slot] !== null ? "full" : ""} ${state.verdict[part.slot] === true ? "good" : state.verdict[part.slot] === false ? "bad" : ""} ${shake && state.verdict[part.slot] === false ? "shake" : ""}`}
                onClick={() => dispatch({ type: "slot", slot: part.slot })}
              >
                {state.slots[part.slot] !== null ? model.terms[state.slots[part.slot] as number] : t("game.eq.empty")}
                <span className="sr"> {t("game.eq.slot", { n: part.slot + 1, total: model.terms.length })}</span>
              </button>
            ),
          )}
        </div>
        <ul className="tbank" aria-label={t("game.eq.tiles")}>
          {state.bankOrder.map((termIndex) => (
            <Tile key={termIndex} neutral label={model.terms[termIndex]} explorer={explorer} pressed={state.slots.includes(termIndex)} onClick={() => dispatch({ type: "tile", term: termIndex })} />
          ))}
        </ul>
        <p className="msg" role="status" aria-live="polite">{message}</p>
        <div className="toolrow">
          <Button disabled={state.done} onClick={() => dispatch({ type: "check" })}><Check className="ic" aria-hidden="true" />{t("game.eq.check")}</Button>
          <Button variant="secondary" onClick={() => dispatch({ type: "reset" })}><ResetIcon />{t("game.eq.reset")}</Button>
        </div>
        {state.done && <DoneBox text={t("game.eq.done")} cta={t("game.results")} busy={busy} onClick={() => onFinish(equationResult(state))} />}
      </div>
    </>
  );
}

/* -------------------------------- True or false rush -------------------------------- */

export function TrueFalseGame({ content, explorer, sound, onFinish, busy, timed }: GameProps & { timed?: boolean }) {
  const { t } = useI18n();
  const [state, dispatch] = useReducer(trueFalseReducer, content.statements, initTrueFalse);
  const limit = content.timeLimitSec && timed && !explorer ? content.timeLimitSec : null;
  const [left, setLeft] = useState(limit ?? 0);

  useEffect(() => {
    if (!limit || state.finished) return;
    const id = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [limit, state.finished]);
  useEffect(() => {
    if (limit && left <= 0 && !state.finished) dispatch({ type: "timeUp" });
  }, [limit, left, state.finished]);
  useEffect(() => {
    if (state.answered !== null) beep(sound, state.statements[state.index].isTrue === state.answered ? 560 : 220);
  }, [state.answered, state.index, state.statements, sound]);

  const current = state.statements[state.index];
  const right = state.answered !== null && current && current.isTrue === state.answered;

  return (
    <>
      <div className="gstat">
        <div className="progress"><span><bdi dir="ltr">{Math.min(state.index + 1, state.statements.length)} / {state.statements.length}</bdi></span></div>
        {limit !== null && <span className="st neu"><bdi dir="ltr">{Math.max(0, left)}s</bdi></span>}
      </div>
      <div className="board">
        {!state.finished && current ? (
          <>
            <p className="qtext" id="tf-text" style={{ textAlign: "center", margin: "12px 0" }}>{current.text}</p>
            {explorer && <div style={{ textAlign: "center" }}><ReadAloud text={current.text} /></div>}
            <div className="qtf" role="group" aria-labelledby="tf-text" style={{ marginTop: 16 }}>
              {[true, false].map((v) => (
                <div className="tw" key={String(v)}>
                  <button type="button" className="ans c-answer" aria-pressed={state.answered === v} disabled={state.answered !== null} onClick={() => dispatch({ type: "answer", value: v })}>
                    {v ? t("game.tf.true") : t("game.tf.false")}
                  </button>
                </div>
              ))}
            </div>
            <p className="msg" role="status" aria-live="polite">
              {state.answered === null ? t("game.tf.start") : `${right ? t("game.tf.right") : t("game.notYet")} ${current.explanation}`}
            </p>
            {state.answered !== null && (
              <div className="toolrow"><Button size="big" onClick={() => dispatch({ type: "next" })}>{t("game.tf.next")}</Button></div>
            )}
          </>
        ) : (
          <DoneBox text={t("game.tf.done", { n: state.correct, total: state.statements.length })} cta={t("game.results")} busy={busy} onClick={() => onFinish(trueFalseResult(state))} />
        )}
      </div>
    </>
  );
}
