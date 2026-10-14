"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import ReactMarkdown from "react-markdown";
import type { RitualSession } from "@/lib/api";
import type { Progress } from "@/lib/ritualState";
import {
  gestureIntent,
  nextChapter,
  type GestureStart,
  type Intent,
} from "@/lib/ritualGestures";
import { getGuide } from "@/lib/guides";
import { TarotArtwork } from "./TarotArtwork";
import { Divider, Icon } from "./Ornaments";
export function Prose({ text }: { text?: string | null }) {
  return text ? (
    <div className="reading-prose">
      <ReactMarkdown>{text}</ReactMarkdown>
    </div>
  ) : null;
}
export function RitualReading({
  session,
  progress,
  scroller,
  onSelect,
  onTable,
  onRetry,
  onFollowup,
  onRecoverDiscussion,
  discussionBusy,
  pendingDiscussion,
  error,
}: {
  session: RitualSession;
  progress: Progress;
  scroller: RefObject<HTMLElement | null>;
  onSelect: (index: number) => void;
  onTable: () => void;
  onRetry: () => void;
  onFollowup: (question: string, index: number | null) => void;
  onRecoverDiscussion: () => void;
  discussionBusy: boolean;
  pendingDiscussion: boolean;
  error: string;
}) {
  const { index, revealed } = progress;
  const card = session.cards[index];
  const allOpen = revealed.length === session.cards.length;
  const interp = session.interpretation;
  const [question, setQuestion] = useState("");
  const [scope, setScope] = useState("all");
  const action = useRef<(intent: Intent) => void>(() => {});
  const cooldown = useRef(0);
  useEffect(() => {
    action.current = (intent) => {
      if (Date.now() < cooldown.current) return;
      const next = nextChapter(revealed, index, session.cards.length);
      if (intent === "next" && next !== null) {
        cooldown.current = Date.now() + 900;
        onSelect(next);
      } else if (intent === "previous" && index > 0) {
        cooldown.current = Date.now() + 900;
        onSelect(index - 1);
      } else if (intent === "table") {
        cooldown.current = Date.now() + 500;
        onTable();
      }
    };
  });
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    let pointer: GestureStart | null = null,
      touch: GestureStart | null = null,
      lastWheel = 0,
      burst: GestureStart | null = null,
      accumulated = 0;
    const blocked = (target: EventTarget | null) =>
      target instanceof Element &&
      !!target.closest("button,a,input,textarea,select,[contenteditable=true]");
    const boundary = (x: number, y: number): GestureStart => ({
      x,
      y,
      top: node.scrollTop <= 3,
      bottom: node.scrollTop + node.clientHeight >= node.scrollHeight - 4,
    });
    const selected = () => !!window.getSelection()?.toString();
    const down = (e: PointerEvent) => {
      pointer = null;
      if (e.pointerType !== "mouse" || blocked(e.target) || selected()) return;
      if (e.target instanceof Element && !e.target.closest(".detail-card-area"))
        return;
      pointer = boundary(e.clientX, e.clientY);
    };
    const up = (e: PointerEvent) => {
      if (pointer && !selected()) {
        const intent = gestureIntent(pointer, { x: e.clientX, y: e.clientY });
        if (intent === "table") action.current(intent);
      }
      pointer = null;
    };
    const start = (e: TouchEvent) => {
      touch = null;
      if (e.touches.length === 1 && !blocked(e.target) && !selected())
        touch = boundary(e.touches[0].clientX, e.touches[0].clientY);
    };
    const end = (e: TouchEvent) => {
      if (touch && e.changedTouches.length === 1 && !selected()) {
        action.current(
          gestureIntent(touch, {
            x: e.changedTouches[0].clientX,
            y: e.changedTouches[0].clientY,
          }),
        );
      }
      touch = null;
    };
    const wheel = (e: WheelEvent) => {
      if (
        blocked(e.target) ||
        selected() ||
        Math.abs(e.deltaX) > Math.abs(e.deltaY)
      )
        return;
      const now = Date.now();
      if (now - lastWheel > 240) {
        burst = boundary(0, 0);
        accumulated = 0;
      }
      lastWheel = now;
      if (now < cooldown.current) {
        e.preventDefault();
        burst = null;
        return;
      }
      accumulated +=
        e.deltaY *
        (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? node.clientHeight : 1);
      if (burst && Math.abs(accumulated) > 90) {
        const intent = gestureIntent(burst, { x: 0, y: -accumulated });
        if (intent) {
          e.preventDefault();
          burst = null;
          action.current(intent);
        }
      }
    };
    const key = (e: KeyboardEvent) => {
      if (blocked(e.target) || selected()) return;
      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        action.current("table");
        return;
      }
      const b = boundary(0, 0);
      if ((e.key === "PageDown" || e.key === "ArrowDown") && b.bottom) {
        e.preventDefault();
        action.current("next");
      }
      if ((e.key === "PageUp" || e.key === "ArrowUp") && b.top) {
        e.preventDefault();
        action.current("previous");
      }
    };
    node.addEventListener("pointerdown", down);
    node.addEventListener("pointerup", up);
    node.addEventListener("touchstart", start, { passive: true });
    node.addEventListener("touchend", end, { passive: true });
    node.addEventListener("wheel", wheel, { passive: false });
    node.addEventListener("keydown", key);
    return () => {
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("touchstart", start);
      node.removeEventListener("touchend", end);
      node.removeEventListener("wheel", wheel);
      node.removeEventListener("keydown", key);
    };
  }, [scroller]);
  const position = session.positions[index] || `Позиция ${index + 1}`;
  const meaning =
    interp?.позиции?.[index]?.трактовка ||
    (Array.isArray(interp?.card_meaning)
      ? interp?.card_meaning[index]
      : typeof interp?.card_meaning === "string"
        ? interp.card_meaning
        : "");
  return (
    <article className="reading-surface">
      <section
        className="card-chapter"
        key={`${session.reading_id}:${index}`}
        data-anchor="chapter"
      >
        <div className="detail-card-area">
          <TarotArtwork key={card.id} card={card} large />
        </div>
        <h1 className="position-heading" tabIndex={-1}>
          {position}
        </h1>
        {card.is_reversed && <p className="orientation">Перевёрнутая карта</p>}
        {interp ? (
          <>
            <Prose text={meaning || interp.intro} />
            <div className="guide-whisper">
              <Icon name="star" size={14} />
              <p>
                {getGuide(session.character_id).name}
                <span>{card.is_reversed ? card.reversed : card.upright}</span>
              </p>
            </div>
          </>
        ) : (
          <div className="notice" role="status">
            <p>
              {session.status === "failed"
                ? "Чтение прервалось. Карты и вопрос сохранены."
                : "Проводник соединяет образы. Пока можно рассмотреть карту."}
            </p>
            {session.status === "failed" && (
              <button className="quiet" onClick={onRetry}>
                Повторить чтение с теми же картами
              </button>
            )}
          </div>
        )}
        {nextChapter(revealed, index, session.cards.length) !== null && (
          <button
            className="chapter-end quiet"
            aria-label="Открыть следующую карту"
            onClick={() => action.current("next")}
          >
            Продолжи вниз<span aria-hidden="true">↓</span>
          </button>
        )}
      </section>
      {allOpen && index === session.cards.length - 1 && interp && (
        <>
          <section className="synthesis" data-anchor="summary">
            <Divider />
            <div className="summary-cards" aria-hidden="true">
              {session.cards.map((c, i) => (
                <span key={i}>
                  <TarotArtwork card={c} />
                </span>
              ))}
            </div>
            <p className="eyebrow">
              {session.question || "Что просит внимания сегодня?"}
            </p>
            <h2>
              {session.cards.length === 1
                ? "На что обратить внимание"
                : "Общий смысл"}
            </h2>
            <Prose text={interp.short_answer} />
            {session.cards.length > 1 && (
              <Prose text={interp.связь_карт || interp.intro} />
            )}
            <Prose text={interp.проявление} />
            <Prose text={interp.на_что_смотреть} />
            {interp.траектория &&
              Object.entries(interp.траектория).map(([part, text]) => (
                <div key={part}>
                  <h3>{part}</h3>
                  <Prose text={text} />
                </div>
              ))}
            <div className="guide-advice">
              <p className="eyebrow">{getGuide(session.character_id).name}</p>
              <Prose text={interp.advice} />
            </div>
          </section>
          <section className="discussion" data-anchor="discussion">
            <Divider />
            <h2>Останемся с этим?</h2>
            <p className="subtle">
              Можно задать уточнение этому же проводнику.
            </p>
            {session.followups?.map((entry) => (
              <div className="conversation" key={entry.operation_key}>
                <p className="user-question">{entry.question}</p>
                {entry.status === "completed" ? (
                  <Prose text={entry.answer} />
                ) : (
                  <p className="status" role="status">
                    {entry.status === "processing"
                      ? "Проводник отвечает…"
                      : entry.error || "Ответ прервался."}
                  </p>
                )}
              </div>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (question.trim()) {
                  onFollowup(
                    question.trim(),
                    scope === "all" ? null : Number(scope),
                  );
                  setQuestion("");
                }
              }}
            >
              <label className="discussion-scope">
                О чём поговорим
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                >
                  <option value="all">О раскладе в целом</option>
                  {session.cards.map((c, i) => (
                    <option key={i} value={i}>
                      {session.positions[i] || c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sr-only" htmlFor="followup">
                Твоё уточнение
              </label>
              <textarea
                id="followup"
                value={question}
                maxLength={500}
                disabled={discussionBusy || pendingDiscussion}
                onChange={(e) => setQuestion(e.target.value)}
                rows={3}
                placeholder="Что хочется прояснить?"
              />
              <button
                className="primary"
                type="submit"
                disabled={
                  !question.trim() || discussionBusy || pendingDiscussion
                }
              >
                {discussionBusy ? "Сохраняем вопрос…" : "Спросить проводника"}
                <Icon name="arrow" size={18} />
              </button>
            </form>
            {pendingDiscussion && (
              <button className="quiet" onClick={onRecoverDiscussion}>
                Восстановить отправленный вопрос
              </button>
            )}
          </section>
        </>
      )}
      {error && (
        <p role="alert" className="notice reading-error">
          {error}
        </p>
      )}
    </article>
  );
}
