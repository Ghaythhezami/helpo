"use client";
import { useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, Lightbulb, X } from "lucide-react";
import { equationReducer, equationResult, initEquation, type EquationPart } from "@/lib/games/equation";
import { initMatch, matchProgress, matchReducer, matchResult, type MatchMessage } from "@/lib/games/match";
import { initMemory, memoryReducer, memoryResult } from "@/lib/games/memory";
import { initOddOneOut, oddReducer, oddResult, type OddMessage } from "@/lib/games/oddoneout";
import { initSort, sortReducer, sortRemaining, sortResult, type Basket } from "@/lib/games/sort";
import { useI18n, type TFunction } from "@/lib/i18n";
import { initTrueFalse, trueFalseReducer, trueFalseResult } from "@/lib/games/truefalse";
import { SPRING } from "@/lib/motion";
import { beep, tileArt } from "@/lib/student-helpers";
import { Button } from "@/components/ui/button";
import { Illus } from "@/components/ui/illus";
import { Progress } from "@/components/ui/progress";
import { ReadAloud } from "./read-aloud";
import { DoneBox, DragGhost, PointChips, ResetIcon, Tile, Tools, XpPop, useBeep, useFlash, usePointerDrag, useTap, type GameProps } from "./game-bits";

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
      return message.again ? t("game.match.reason", { left: message.left, right: message.right }) : t("game.match.nudge", { left: message.left });
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
  const [lastRight, setLastRight] = useState<number | null>(null);
  const left = state.rounds[state.round] ?? [];
  const right = state.rightOrder[state.round] ?? [];
  const progress = matchProgress(state);
  const miss = state.message.kind === "miss" ? state.message : null;
  const good = state.message.kind === "match" || state.message.kind === "round-done" || state.message.kind === "finished" ? state.message : null;
  const shake = useFlash(miss) ? lastRight : null;
  useBeep(sound, miss, 220);
  useBeep(sound, good, 520 + state.combo * 60);
  const result = matchResult(state);

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
        <span className="st neu">{t("game.round.label", { n: state.round + 1, total: state.rounds.length })}</span>
        <PointChips xp={state.xp} result={result} explorer={explorer} />
      </div>
      <div className="board" style={{ position: "relative" }}>
        <XpPop xp={state.message.kind === "match" ? state.message.xp : 0} id={state.matched.length} />
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
                <Tile key={i} neutral label={state.pairs[i].right} explorer={explorer} matched={state.matched.includes(i)} hint={state.hint === i} shake={shake === i} onClick={() => { setLastRight(i); dispatch({ type: "selectRight", index: i }); }} />
              ))}
            </ul>
          </div>
        </div>
        <p className="msg" role="status" aria-live="polite"><span key={String(matchText(state.message, t))} className="msg-in">{matchText(state.message, t)}</span></p>
        <Tools explorer={explorer} onHint={() => dispatch({ type: "hint" })} />
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
        <PointChips result={memoryResult(state)} explorer={explorer} />
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
        <p className="msg" role="status" aria-live="polite"><span key={String(announce)} className="msg-in">{announce}</span></p>
        <Tools explorer={explorer} onHint={() => dispatch({ type: "hint" })} />
        {state.finished && <DoneBox text={t("game.memory.finished")} cta={t("game.results")} busy={busy} onClick={() => onFinish(memoryResult(state))} />}
      </div>
    </>
  );
}

/* ----------------------------------- Sort ----------------------------------- */

export function SortGame({ content, seed, explorer, sound, onFinish, busy }: GameProps) {
  const { t, dir } = useI18n();
  const reduce = useReducedMotion();
  const [state, dispatch] = useReducer(sortReducer, content.sortItems, (items) => initSort(items, seed));
  const bank = sortRemaining(state);
  const baskets = content.sortBaskets;
  const total = state.items.length;
  const done = Object.keys(state.placed).length;

  const place = (basket: Basket, index?: number) => dispatch({ type: "place", basket, index });
  const dnd = usePointerDrag<number>((index, target) => {
    if (target === "yes" || target === "no") place(target, index);
  });

  const miss = state.message.kind === "miss" ? state.message : null;
  const placed = state.message.kind === "placed" ? state.message : null;
  const shake = useFlash(miss)?.index ?? null;
  useBeep(sound, miss, 220);
  useBeep(sound, placed, 560);

  // Keyboard: with an item selected, 1 / 2 or the arrow keys (as drawn on screen) drop it in a basket.
  const onKeyDown = (e: { key: string; preventDefault(): void }) => {
    if (state.selected === null || state.finished) return;
    const rtl = dir === "rtl";
    const key: Record<string, Basket> = { "1": "yes", "2": "no", ArrowLeft: rtl ? "no" : "yes", ArrowRight: rtl ? "yes" : "no" };
    const basket = key[e.key];
    if (!basket) return;
    e.preventDefault();
    place(basket);
  };
  // Delegated keyboard handling: key presses come from the focused item buttons inside the board.
  const boardRef = useRef<HTMLDivElement>(null);
  const keyHandler = useRef(onKeyDown);
  useEffect(() => {
    keyHandler.current = onKeyDown;
  });
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const listener = (e: globalThis.KeyboardEvent) => keyHandler.current(e);
    board.addEventListener("keydown", listener);
    return () => board.removeEventListener("keydown", listener);
  }, []);

  const dragged = dnd.drag ? state.items[dnd.drag.item] : null;

  return (
    <>
      <div className="gstat">
        <div className="progress"><span>{t("game.sort.progress", { done, total })}</span></div>
        <PointChips xp={state.xp} result={sortResult(state)} explorer={explorer} />
      </div>
      <div className="board" ref={boardRef}>
        <p className="muted" style={{ textAlign: "center", marginBottom: 12 }}>{t("game.sort.how")}</p>
        <ul className="bank" aria-label={t("game.sort.bank")}>
          {bank.map((i) => (
            <li key={i} className="tw" onPointerDown={(e) => dnd.begin(e, i)}>
              <button
                type="button"
                className={`tile c-answer ${shake === i ? "shake" : ""} ${dnd.drag?.item === i ? "lifted" : ""} ${state.hint?.index === i ? "hint" : ""}`}
                aria-pressed={state.selected === i}
                style={explorer ? { minHeight: 100 } : undefined}
                onClick={() => !dnd.wasDrag() && dispatch({ type: "select", index: i })}
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
            <motion.div key={b} className="basketw" data-drop={b} animate={{ scale: dnd.over === b && !reduce ? 1.03 : 1 }} transition={SPRING.soft}>
            <button
              type="button"
              aria-keyshortcuts={b === "yes" ? "1" : "2"}
              className={`basket ${b} ${dnd.over === b ? "over" : ""} ${state.hint?.basket === b ? "hint" : ""}`}
              onClick={() => !dnd.wasDrag() && place(b)}
            >
              <Illus name={b === "yes" ? "basket-yes" : "basket-no"} size={110} />
              <b>{baskets[b]}</b>
              <span className="sr">{t("game.sort.basket")}</span>
              {state.hint?.basket === b && <span className="bhint"><Lightbulb className="ic" aria-hidden="true" />{t("game.hint")}</span>}
              <span className="placed">
                {state.items.map((it, i) => (state.placed[i] === b ? <span key={i}><Check className="ic" aria-hidden="true" />{it.label}</span> : null))}
              </span>
            </button>
            </motion.div>
          ))}
        </div>
        <p className="msg" role="status" aria-live="polite"><span key={String(localSort(state.message, baskets, t))} className="msg-in">{localSort(state.message, baskets, t)}</span></p>
        <Tools explorer={explorer} onHint={() => dispatch({ type: "hint" })} />
        {state.finished && <DoneBox text={t("game.sort.all", { n: total })} cta={t("game.results")} busy={busy} onClick={() => onFinish(sortResult(state))} />}
      </div>
      {dnd.drag && dragged && <DragGhost x={dnd.drag.x} y={dnd.drag.y} label={dragged.label} art={tileArt(dragged.label)} />}
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
      // The reason comes from the two basket names: the item belongs in the other one because it does not match this one.
      return t("game.sort.miss", { label: message.label, right: message.basket === "yes" ? baskets.no : baskets.yes, wrong: message.basket === "yes" ? baskets.yes : baskets.no });
    case "hint":
      return t("game.sort.hint", { label: message.label, basket: message.basket === "yes" ? baskets.yes : baskets.no });
    case "finished":
      return t("game.sort.all", { n: message.total });
  }
}

/* ---------------------------------- Equation (Sequence) ---------------------------------- */

type EqDrag = { kind: "term"; term: number } | { kind: "slot"; slot: number };

export function EquationGame({ content, seed, explorer, sound, onFinish, busy }: GameProps) {
  const { t } = useI18n();
  const [state, dispatch] = useReducer(equationReducer, content.equationTiles, (tiles) => initEquation(tiles, seed));
  /** Slot whose tile is picked up (by tap or keyboard) and waits to be dropped or swapped. */
  const [held, setHeld] = useState<number | null>(null);
  const slotRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const model = state.model;
  const wrong = state.message.kind === "wrong" ? state.message : null;
  const right = state.message.kind === "correct" ? state.message : null;
  const shake = useFlash(wrong) !== null;
  useBeep(sound, wrong, 220);
  useBeep(sound, right, 700);

  const dnd = usePointerDrag<EqDrag>((item, target) => {
    if (target === null) return;
    if (target.startsWith("slot:")) {
      const slot = Number(target.slice(5));
      dispatch(item.kind === "term" ? { type: "place", term: item.term, slot } : { type: "swap", a: item.slot, b: slot });
    } else if (target === "bank") {
      dispatch(item.kind === "term" ? { type: "tile", term: item.term } : { type: "slot", slot: item.slot });
    }
    setHeld(null);
  });

  useEffect(() => {
    if (held !== null) slotRefs.current[held]?.focus();
  }, [held]);

  const termAt = (slot: number | null) => (slot === null || state.slots[slot] === null ? null : model.terms[state.slots[slot] as number]);

  const message = useMemo(() => {
    const m = state.message;
    if (m.kind === "start") return t("game.eq.start");
    if (m.kind === "taken") return t("game.eq.taken", { label: m.label });
    if (m.kind === "full") return t("game.eq.full");
    if (m.kind === "incomplete") return t("game.eq.incomplete");
    if (m.kind === "wrong") return t("game.eq.wrong", { slots: m.slots.map((n) => n + 1).join(", ") });
    if (m.kind === "moved") return t("game.eq.moved", { label: m.label, n: m.slot + 1 });
    if (m.kind === "hint") return t("game.eq.hint", { label: m.label, n: m.slot + 1 });
    return t("game.eq.correct") + (m.retry ? ` ${t("game.retryBonus")}` : "");
  }, [state.message, t]);
  const heldLabel = termAt(held);
  const shown = held !== null && heldLabel ? t("game.eq.held", { label: heldLabel, n: held + 1 }) : message;

  const tapSlot = (slot: number) => {
    if (dnd.wasDrag() || state.done) return;
    if (held === null) {
      if (state.slots[slot] !== null) setHeld(slot);
    } else if (held === slot) {
      dispatch({ type: "slot", slot });
      setHeld(null);
    } else {
      dispatch({ type: "swap", a: held, b: slot });
      setHeld(null);
    }
  };

  // Keyboard on a slot: Enter or Space picks up / drops, arrows move the held tile (swapping), Escape lets go.
  const keySlot = (e: KeyboardEvent<HTMLButtonElement>, slot: number) => {
    const last = model.terms.length - 1;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (state.done) return;
      if (held === null) {
        if (state.slots[slot] !== null) setHeld(slot);
      } else {
        if (held !== slot) dispatch({ type: "swap", a: held, b: slot });
        setHeld(null);
      }
    } else if (held !== null && e.key === "Escape") {
      e.preventDefault();
      setHeld(null);
    } else if (held !== null && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      const to = Math.max(0, Math.min(last, held + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1)));
      if (to !== held) dispatch({ type: "swap", a: held, b: to });
      setHeld(to);
    }
  };

  const dragged = dnd.drag ? (dnd.drag.item.kind === "term" ? model.terms[dnd.drag.item.term] : termAt(dnd.drag.item.slot)) : null;

  return (
    <>
      <div className="gstat">
        <PointChips result={equationResult(state)} explorer={explorer} />
      </div>
      <div className="board">
        <p className="muted" style={{ textAlign: "center", marginBottom: 12 }}>{t("game.eq.how")}</p>
        <div className="eq" role="group" aria-label={t("game.eq.group")} dir="ltr">
          {model.parts.map((part: EquationPart, i) => {
            if (part.kind === "op") return <span key={i} className="op" aria-hidden="true">{part.text}</span>;
            const slot = part.slot;
            const verdict = state.verdict[slot];
            return (
              <button
                key={i}
                ref={(el) => {
                  slotRefs.current[slot] = el;
                }}
                type="button"
                data-drop={`slot:${slot}`}
                aria-pressed={held === slot}
                className={`slot ${state.slots[slot] !== null ? "full" : ""} ${verdict === true ? "good" : verdict === false ? "bad" : ""} ${shake && verdict === false ? "shake" : ""} ${held === slot ? "held" : ""} ${state.hint?.slot === slot ? "hint" : ""} ${dnd.over === `slot:${slot}` ? "over" : ""} ${dnd.drag?.item.kind === "slot" && dnd.drag.item.slot === slot ? "lifted" : ""}`}
                onPointerDown={(e) => state.slots[slot] !== null && dnd.begin(e, { kind: "slot", slot })}
                onClick={() => tapSlot(slot)}
                onKeyDown={(e) => keySlot(e, slot)}
              >
                <span className="sn" aria-hidden="true">{slot + 1}</span>
                {state.slots[slot] !== null ? model.terms[state.slots[slot] as number] : t("game.eq.empty")}
                {verdict === true && <Check className="ic vm" aria-hidden="true" />}
                {verdict === false && <X className="ic vm" aria-hidden="true" />}
                <span className="sr"> {t("game.eq.slot", { n: slot + 1, total: model.terms.length })}</span>
              </button>
            );
          })}
        </div>
        <ul className="tbank" aria-label={t("game.eq.tiles")} data-drop="bank">
          {state.bankOrder.map((termIndex) => (
            <Tile
              key={termIndex}
              neutral
              label={model.terms[termIndex]}
              explorer={explorer}
              pressed={state.slots.includes(termIndex)}
              hint={state.hint?.term === termIndex}
              lifted={dnd.drag?.item.kind === "term" && dnd.drag.item.term === termIndex}
              onPointerDown={(e) => dnd.begin(e, { kind: "term", term: termIndex })}
              onClick={() => {
                if (dnd.wasDrag()) return;
                // With a slot picked up, the tapped tile goes into that slot; otherwise it fills the next empty slot.
                if (held !== null) {
                  dispatch({ type: "place", term: termIndex, slot: held });
                  setHeld(null);
                } else dispatch({ type: "tile", term: termIndex });
              }}
            />
          ))}
        </ul>
        <p className="msg" role="status" aria-live="polite"><span key={String(shown)} className="msg-in">{shown}</span></p>
        <div className="toolrow">
          <Button disabled={state.done} onClick={() => { setHeld(null); dispatch({ type: "check" }); }}><Check className="ic" aria-hidden="true" />{t("game.eq.check")}</Button>
          <Button variant="secondary" onClick={() => { setHeld(null); dispatch({ type: "reset" }); }}><ResetIcon />{t("game.eq.reset")}</Button>
        </div>
        <Tools explorer={explorer} onHint={() => dispatch({ type: "hint" })} />
        {state.done && <DoneBox text={t("game.eq.done")} cta={t("game.results")} busy={busy} onClick={() => onFinish(equationResult(state))} />}
      </div>
      {dnd.drag && dragged && <DragGhost x={dnd.drag.x} y={dnd.drag.y} label={dragged} />}
    </>
  );
}

/* ---------------------------------- Odd one out ---------------------------------- */

function oddText(message: OddMessage, label: string, total: number, t: TFunction): string {
  switch (message.kind) {
    case "start":
      return t("game.odd.start");
    case "not-this":
      return t("game.odd.notThis", { label: message.label });
    case "found":
      return t("game.odd.found", { label: message.label });
    case "revealed":
      return t("game.odd.revealed", { label: message.label });
    case "hint":
      return t("game.odd.hint");
    case "finished":
      return label ? `${t("game.odd.found", { label })} ${t("game.odd.all", { n: total })}` : t("game.odd.all", { n: total });
  }
}

export function OddOneOutGame({ content, seed, explorer, sound, onFinish, busy }: GameProps) {
  const { t } = useI18n();
  const tap = useTap();
  const [state, dispatch] = useReducer(oddReducer, content.oddOneOut ?? [], (rounds) => initOddOneOut(rounds, seed));
  const nextRef = useRef<HTMLButtonElement>(null);
  const round = state.rounds[state.round];
  const wrong = state.message.kind === "not-this" || state.message.kind === "revealed" ? state.message : null;
  const right = state.message.kind === "found" || (state.message.kind === "finished" && state.found) ? state.message : null;
  useBeep(sound, wrong, 220);
  useBeep(sound, right, 600);
  useEffect(() => {
    if (state.roundDone && !state.finished) nextRef.current?.focus();
  }, [state.roundDone, state.finished, state.round]);

  if (!round) return <p className="muted" role="status">{t("game.unknown")}</p>;
  const doneCount = state.round + (state.roundDone ? 1 : 0);

  return (
    <>
      <div className="gstat">
        <div className="progress">
          <span>{t("game.round.label", { n: state.round + 1, total: state.rounds.length })}</span>
          <span className="dots" aria-hidden="true">{state.rounds.map((_, i) => <i key={i} className={i < doneCount ? "ok" : ""} />)}</span>
        </div>
        <PointChips xp={state.xp} result={oddResult(state)} explorer={explorer} />
      </div>
      <div className="board odd">
        <p className="muted how">{t("game.odd.how")}</p>
        <ul className="oddgrid" aria-label={t("game.odd.cards")}>
          {round.items.map((label, i) => {
            const isOdd = state.roundDone && i === round.odd;
            const notThis = state.tapped.includes(i);
            const out = state.removed.includes(i);
            return (
              <li key={`${state.round}:${i}`} className="tw">
                <motion.div className="oddw" {...tap}>
                <button
                  type="button"
                  className={`oddcard c-answer ${isOdd ? "odd" : ""} ${notThis ? "not" : ""} ${out ? "out" : ""}`}
                  disabled={state.roundDone || notThis || out}
                  aria-label={isOdd ? `${label}. ${t("game.odd.markOdd")}` : notThis ? `${label}. ${t("game.odd.markNot")}` : out ? `${label}. ${t("game.odd.markHint")}` : label}
                  onClick={() => dispatch({ type: "tap", index: i })}
                >
                  <span className="lab">{label}</span>
                  {isOdd && <span className="mark"><Check className="ic" aria-hidden="true" />{t("game.odd.markOdd")}</span>}
                  {notThis && <span className="mark"><X className="ic" aria-hidden="true" />{t("game.odd.markNot")}</span>}
                  {out && <span className="mark"><Lightbulb className="ic" aria-hidden="true" />{t("game.odd.markHint")}</span>}
                </button>
                </motion.div>
                {explorer && <ReadAloud text={label} compact />}
              </li>
            );
          })}
        </ul>
        <p className="msg" role="status" aria-live="polite"><span key={String(oddText(state.message, round.items[round.odd], state.rounds.length, t))} className="msg-in">{oddText(state.message, round.items[round.odd], state.rounds.length, t)}</span></p>
        {state.roundDone && (
          <div className="oddwhy">
            <b>{t("game.odd.why")}</b>
            <p>{round.explanation}</p>
          </div>
        )}
        {!state.roundDone && <Tools explorer={explorer} onHint={() => dispatch({ type: "hint" })} />}
        {state.roundDone && !state.finished && (
          <div className="toolrow"><Button ref={nextRef} size="big" onClick={() => dispatch({ type: "next" })}>{t("game.odd.next")}</Button></div>
        )}
        {state.finished && <DoneBox text={t("game.odd.all", { n: state.rounds.length })} cta={t("game.results")} busy={busy} onClick={() => onFinish(oddResult(state))} />}
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
        <PointChips result={trueFalseResult(state)} explorer={explorer} />
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
