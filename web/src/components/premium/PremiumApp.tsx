"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ApiError,
  getCharacter,
  setCharacter,
  spreadBegin,
  getReadingSession,
  getReadingFollowups,
  submitReadingFollowup,
  retryReading,
  type RitualSession,
} from "@/lib/api";
import { initializeRuntime, type Runtime } from "@/lib/runtime";
import {
  emptyState,
  loadState,
  saveState,
  storageKey,
  sanitizeProgress,
  anchorScrollTop,
  type RitualState,
  type RitualScreen,
  type Anchor,
} from "@/lib/ritualState";
import {
  PREMIUM_GUIDES,
  PREMIUM_SPREADS,
  SPREAD_ORDER,
  makeOperationKey,
} from "@/lib/premium";
import { SPREADS } from "@/lib/spreads";
import { getGuide } from "@/lib/guides";
import { Icon, Divider, type IconName } from "./Ornaments";
import { TarotArtwork } from "./TarotArtwork";
import { RitualScene } from "./RitualScene";
import { RitualReading } from "./RitualReading";
import { Journal } from "./Journal";
import { GuideGallery } from "./GuideGallery";
import { Settings } from "./Settings";
const NAV: { id: RitualScreen; label: string; icon: IconName }[] = [
  { id: "home", label: "Главная", icon: "star" },
  { id: "spreads", label: "Расклады", icon: "cards" },
  { id: "journal", label: "Журнал", icon: "journal" },
  { id: "guides", label: "Проводники", icon: "guide" },
];
const errorText = (error: unknown) =>
  error instanceof TypeError
    ? "Связь прервалась. Твой вопрос сохранён — повторим то же подключение."
    : error instanceof Error
      ? error.message
      : "Не удалось связаться с сервером.";
export default function PremiumApp() {
  const [state, setState] = useState<RitualState>(emptyState),
    stateRef = useRef(state),
    keyRef = useRef("");
  const [runtime, setRuntime] = useState<Runtime | null>(null),
    [session, setSession] = useState<RitualSession | null>(null),
    [ready, setReady] = useState(false),
    [intro, setIntro] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [connectionError, setConnectionError] = useState(""),
    [sheet, setSheet] = useState(false),
    [discussionBusy, setDiscussionBusy] = useState(false);
  const sessionRef = useRef<RitualSession | null>(null),
    busyRef = useRef(false),
    mainRef = useRef<HTMLElement>(null),
    dialogRef = useRef<HTMLDialogElement>(null),
    appRef = useRef<HTMLDivElement>(null),
    activeFetch = useRef(0),
    lastPlace = useRef("");
  const screen = state.screen,
    activeId = state.activeId;
  const progress = sanitizeProgress(
    state.progress[String(activeId)],
    session?.cards.length || 0,
  );
  const isRitual = screen === "table" || screen === "reading";
  const guideId = isRitual && session ? session.character_id : state.guideId;
  const design = PREMIUM_GUIDES[guideId] || PREMIUM_GUIDES.shadow_walker;
  const update = useCallback((fn: (s: RitualState) => RitualState) => {
    const next = fn(stateRef.current);
    stateRef.current = next;
    setState(next);
    if (keyRef.current) saveState(keyRef.current, next);
  }, []);
  const acceptSession = useCallback((next: RitualSession | null) => {
    sessionRef.current = next;
    setSession(next);
  }, []);
  const capture = useCallback(() => {
    const s = stateRef.current,
      r = sessionRef.current,
      node = mainRef.current;
    if (s.screen !== "reading" || !r || !node) return;
    const p = sanitizeProgress(
      s.progress[String(r.reading_id)],
      r.cards.length,
    );
    let anchor: Anchor | null = null;
    for (const section of node.querySelectorAll<HTMLElement>("[data-anchor]")) {
      const offset =
        section.getBoundingClientRect().top - node.getBoundingClientRect().top;
      if (!anchor || offset <= 80)
        anchor = { id: section.dataset.anchor!, offset: -offset };
    }
    if (!anchor) return;
    const next = {
      ...s,
      progress: {
        ...s.progress,
        [r.reading_id]: { ...p, anchors: { ...p.anchors, [p.index]: anchor } },
      },
    };
    stateRef.current = next;
    if (keyRef.current) saveState(keyRef.current, next);
  }, []);
  async function initialize() {
    const request = ++activeFetch.current;
    try {
      const r = await initializeRuntime();
      if (request !== activeFetch.current) return;
      setRuntime(r);
      keyRef.current = storageKey(r.namespace, r.user_id);
      const saved = loadState(keyRef.current);
      stateRef.current = saved;
      setState(saved);
      if (saved.activeId) {
        const restored = await getReadingSession(saved.activeId);
        if (request !== activeFetch.current) return;
        acceptSession(restored);
        update((s) => ({
          ...s,
          progress: {
            ...s.progress,
            [restored.reading_id]: sanitizeProgress(
              s.progress[String(restored.reading_id)],
              restored.cards.length,
            ),
          },
        }));
      }
      const chosen = await getCharacter();
      if (request !== activeFetch.current) return;
      if (chosen && PREMIUM_GUIDES[chosen])
        update((s) => ({ ...s, guideId: chosen }));
      setReady(true);
    } catch (e) {
      if (request === activeFetch.current) setConnectionError(errorText(e));
    }
  }
  useEffect(() => {
    // Bootstrap awaits authenticated runtime before hydrating server-owned state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void initialize();
    const timer = setTimeout(() => setIntro(false), 1000);
    return () => {
      activeFetch.current++;
      clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    if (sheet) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [sheet]);
  useEffect(() => {
    const node = mainRef.current;
    if (!node || !ready) return;
    const place = `${screen}:${activeId}:${progress.index}`;
    if (place === lastPlace.current) return;
    lastPlace.current = place;
    const frame = requestAnimationFrame(() => {
      const anchor =
        screen === "reading"
          ? stateRef.current.progress[String(activeId)]?.anchors[
              String(progress.index)
            ]
          : undefined;
      const element = anchor
        ? Array.from(node.querySelectorAll<HTMLElement>("[data-anchor]")).find(
            (el) => el.dataset.anchor === anchor.id,
          )
        : null;
      node.scrollTop =
        element && anchor
          ? anchorScrollTop(
              node.scrollTop,
              element.getBoundingClientRect().top,
              node.getBoundingClientRect().top,
              anchor.offset,
            )
          : 0;
      if (screen === "reading")
        node
          .querySelector<HTMLElement>(".position-heading")
          ?.focus({ preventScroll: true });
      if (screen === "table")
        node
          .querySelector<HTMLElement>(`[data-card-index="${progress.index}"]`)
          ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [screen, activeId, progress.index, ready, session?.interpretation]);
  // Each poll is tied to its reading, never to whichever page happens to be open.
  useEffect(() => {
    if (!ready || !session) return;
    const id = session.reading_id;
    let canceled = false,
      timer: ReturnType<typeof setTimeout>;
    const unsettled =
      ["reserved", "processing"].includes(session.status) ||
      session.followups.some((f) => f.status === "processing");
    if (!unsettled) return;
    async function poll() {
      try {
        const next = await getReadingSession(id);
        if (canceled) return;
        if (stateRef.current.activeId === id) acceptSession(next);
        if (
          ["reserved", "processing"].includes(next.status) ||
          next.followups.some((f) => f.status === "processing")
        )
          timer = setTimeout(poll, 1500);
      } catch (e) {
        if (!canceled) setError(errorText(e));
      }
    }
    timer = setTimeout(poll, 700);
    return () => {
      canceled = true;
      clearTimeout(timer);
    };
  }, [
    ready,
    session?.reading_id,
    session?.status,
    session?.followups.some((f) => f.status === "processing"),
    acceptSession,
  ]);
  useEffect(() => {
    const onHide = () => {
      capture();
      if (appRef.current)
        appRef.current.dataset.inactive = String(document.hidden);
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", capture);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", capture);
    };
  }, [capture]);
  const backRef = useRef(() => {});
  useEffect(() => {
    backRef.current = () => {
      if (sheet) setSheet(false);
      else if (screen === "reading") navigate("table");
      else navigate("home");
    };
  });
  useEffect(() => {
    if (runtime?.mode !== "telegram") return;
    const tg = (
      window as unknown as {
        Telegram?: {
          WebApp?: {
            BackButton?: {
              show: () => void;
              hide: () => void;
              onClick: (fn: () => void) => void;
              offClick: (fn: () => void) => void;
            };
          };
        };
      }
    ).Telegram?.WebApp?.BackButton;
    const back = () => backRef.current();
    if (screen !== "home" || sheet) tg?.show();
    else tg?.hide();
    tg?.onClick(back);
    return () => tg?.offClick(back);
  }, [screen, sheet, runtime?.mode]);
  useEffect(() => {
    if (runtime?.mode !== "telegram" || screen !== "reading") return;
    const tg = (
      window as unknown as {
        Telegram?: {
          WebApp?: {
            isVersionAtLeast?: (version: string) => boolean;
            disableVerticalSwipes?: () => void;
            enableVerticalSwipes?: () => void;
          };
        };
      }
    ).Telegram?.WebApp;
    if (!tg?.isVersionAtLeast?.("7.7")) return;
    tg.disableVerticalSwipes?.();
    return () => tg.enableVerticalSwipes?.();
  }, [screen, runtime?.mode]);
  function navigate(next: RitualScreen) {
    capture();
    setError("");
    update((s) => ({ ...s, screen: next }));
  }
  function start(spread = "three") {
    if (busyRef.current) return;
    if (stateRef.current.draft.operationKey) {
      navigate("question");
      return;
    }
    update((s) => ({
      ...s,
      draft: { question: s.draft.question, spreadId: spread },
      screen: "question",
    }));
    setError("");
    if (spread === "daily") void begin();
  }
  async function begin() {
    if (busyRef.current) return;
    const draft = stateRef.current.draft;
    const spread = SPREADS[draft.spreadId];
    if (!spread) {
      setError("Выбери расклад.");
      return;
    }
    if (spread.needsQuestion && !draft.question.trim()) {
      setError("Запиши вопрос для этого расклада.");
      return;
    }
    const operation = {
      ...draft,
      operationKey: draft.operationKey || makeOperationKey(),
    };
    update((s) => ({ ...s, draft: operation }));
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await spreadBegin(
        operation.spreadId,
        operation.spreadId === "daily"
          ? null
          : operation.question.trim() || null,
        undefined,
        new Date().getHours(),
        operation.operationKey,
      );
      const full = await getReadingSession(result.token);
      acceptSession(full);
      update((s) => ({
        ...s,
        activeId: full.reading_id,
        screen: "table",
        draft: { question: "", spreadId: operation.spreadId },
        progress: {
          ...s.progress,
          [full.reading_id]: sanitizeProgress(
            s.progress[String(full.reading_id)],
            full.cards.length,
          ),
        },
      }));
    } catch (e) {
      setError(errorText(e));
      if (
        e instanceof ApiError &&
        [400, 401, 403, 422, 429].includes(e.status || 0)
      )
        update((s) => ({
          ...s,
          draft: { question: operation.question, spreadId: operation.spreadId },
        }));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function selectCard(index: number) {
    const r = sessionRef.current;
    if (!r || index < 0 || index >= r.cards.length) return;
    capture();
    update((s) => {
      const p = sanitizeProgress(
        s.progress[String(r.reading_id)],
        r.cards.length,
      );
      return {
        ...s,
        screen: "reading",
        progress: {
          ...s.progress,
          [r.reading_id]: {
            ...p,
            index,
            revealed: [...new Set([...p.revealed, index])],
          },
        },
      };
    });
    setError("");
  }
  async function openHistory(id: number) {
    capture();
    const request = ++activeFetch.current;
    setReady(false);
    setConnectionError("");
    update((s) => ({ ...s, activeId: id, screen: "reading" }));
    try {
      const r = await getReadingSession(id);
      if (request !== activeFetch.current) return;
      acceptSession(r);
      update((s) => {
        const p = s.progress[String(id)]
          ? sanitizeProgress(s.progress[String(id)], r.cards.length)
          : { index: 0, revealed: r.cards.map((_, i) => i), anchors: {} };
        return {
          ...s,
          progress: {
            ...s.progress,
            [id]: {
              ...p,
              revealed: [...new Set([...p.revealed, p.index])],
            },
          },
        };
      });
      setReady(true);
    } catch (e) {
      if (request === activeFetch.current) setConnectionError(errorText(e));
    }
  }
  async function chooseGuide(id: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const chosen = await setCharacter(id);
      update((s) => ({ ...s, guideId: chosen }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function retry() {
    const r = sessionRef.current;
    if (!r || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    const key =
      stateRef.current.retryKeys[String(r.reading_id)] || makeOperationKey();
    update((s) => ({
      ...s,
      retryKeys: { ...s.retryKeys, [r.reading_id]: key },
    }));
    try {
      await retryReading(r.token, key);
      const next = await getReadingSession(r.reading_id);
      if (stateRef.current.activeId === r.reading_id) acceptSession(next);
      update((s) => {
        const keys = { ...s.retryKeys };
        delete keys[String(r.reading_id)];
        return { ...s, retryKeys: keys };
      });
    } catch (e) {
      setError(errorText(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function followup(question: string, index: number | null) {
    const r = sessionRef.current;
    if (!r || discussionBusy) return;
    const id = r.reading_id;
    const pending = stateRef.current.pendingFollowups[String(id)] || {
      operation_key: makeOperationKey(),
      question,
      card_index: index,
    };
    update((s) => ({
      ...s,
      pendingFollowups: { ...s.pendingFollowups, [id]: pending },
    }));
    setDiscussionBusy(true);
    setError("");
    try {
      await submitReadingFollowup(id, pending);
      const { followups } = await getReadingFollowups(id);
      if (
        stateRef.current.activeId === id &&
        sessionRef.current?.reading_id === id
      )
        acceptSession({ ...sessionRef.current, followups });
      update((s) => {
        const p = { ...s.pendingFollowups };
        delete p[String(id)];
        return { ...s, pendingFollowups: p };
      });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setDiscussionBusy(false);
    }
  }
  async function reconnect() {
    if (!sessionRef.current) {
      void initialize();
      return;
    }
    setError("");
    try {
      const id = sessionRef.current.reading_id;
      const r = await getReadingSession(id);
      if (stateRef.current.activeId === id) acceptSession(r);
    } catch (e) {
      setError(errorText(e));
    }
  }
  const pending = session && state.pendingFollowups[String(session.reading_id)];
  function moveScene(e: React.PointerEvent) {
    if (
      !state.effects ||
      screen === "reading" ||
      e.pointerType !== "mouse" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const box = e.currentTarget.getBoundingClientRect(),
      scene = appRef.current?.querySelector<HTMLElement>(".scene");
    scene?.style.setProperty(
      "--px",
      String(((e.clientX - box.left) / box.width) * 2 - 1),
    );
    scene?.style.setProperty(
      "--py",
      String(((e.clientY - box.top) / box.height) * 2 - 1),
    );
  }
  return (
    <div className="arcanum-stage">
      {runtime && runtime.mode !== "telegram" && (
        <aside className="studio-strip">
          <span>
            СТУДИЯ ·{" "}
            {runtime.mode === "fixture"
              ? "подготовленные тексты"
              : "OpenRouter · лимит включён"}
          </span>
          {runtime.mode === "fixture" && (
            <details>
              <summary>Проверка сбоев</summary>
              <button
                onClick={() =>
                  void fetch("/__studio/control", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ failure_next: true }),
                  })
                }
              >
                Прервать следующий ответ
              </button>
              <button
                onClick={() =>
                  void fetch("/__studio/control", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ delay_next: 8 }),
                  })
                }
              >
                Задержать следующий ответ
              </button>
            </details>
          )}
        </aside>
      )}
      <div
        className={`ritual-app ${!state.effects ? "effects-off" : ""}`}
        data-screen={screen}
        ref={appRef}
        style={{ "--guide": design.accent } as CSSProperties}
        onPointerMove={moveScene}
      >
        <RitualScene />
        <main
          className="ritual-scroll"
          ref={mainRef}
          onScroll={capture}
          inert={intro || sheet ? true : undefined}
          tabIndex={-1}
        >
          {!ready ? (
            <section className="restore-page">
              <Icon name="star" size={30} />
              <h1>
                {connectionError
                  ? "Вернёмся к твоему месту"
                  : "Открываем пространство"}
              </h1>
              <p role="status">
                {connectionError || "Восстанавливаем сохранённый сеанс…"}
              </p>
              {connectionError && (
                <>
                  <button
                    className="primary"
                    onClick={() => {
                      setReady(false);
                      setConnectionError("");
                      void initialize();
                    }}
                  >
                    Повторить соединение
                  </button>
                  {runtime && (
                    <button
                      className="quiet"
                      onClick={() => {
                        acceptSession(null);
                        update((s) => ({
                          ...s,
                          screen: "home",
                          activeId: null,
                        }));
                        setReady(true);
                        setConnectionError("");
                      }}
                    >
                      На главную
                    </button>
                  )}
                </>
              )}
            </section>
          ) : (
            <>
              {screen === "home" ? (
                <section className="home-content">
                  <div className="home-tools">
                    <button
                      className="quiet"
                      aria-label="Открыть настройки"
                      onClick={() => navigate("settings")}
                    >
                      Настройки
                    </button>
                  </div>
                  <h1 className="wordmark">АРКАНУМ</h1>
                  <div className="home-actions">
                    <p className="home-caption">
                      Иногда ответ приходит
                      <br />
                      не в словах, а в образах.
                    </p>
                    <button className="primary" onClick={() => start()}>
                      <Icon name="star" size={18} />
                      Задать вопрос
                      <Icon name="arrow" size={18} />
                    </button>
                    <button className="quiet" onClick={() => start("daily")}>
                      Карта дня
                    </button>
                    {(activeId || state.draft.operationKey) && (
                      <button
                        className="resume-link quiet"
                        onClick={() =>
                          state.draft.operationKey
                            ? navigate("question")
                            : navigate("table")
                        }
                      >
                        Продолжить свой расклад
                      </button>
                    )}
                  </div>
                </section>
              ) : (
                <>
                  <header className="ritual-topbar">
                    <button
                      aria-label={
                        screen === "reading"
                          ? "Вернуться к картам расклада"
                          : "На главную"
                      }
                      onClick={() => backRef.current()}
                    >
                      <Icon name="back" size={18} />
                    </button>
                    <span>АРКАНУМ</span>
                    <button
                      aria-label="Закрыть и вернуться на главную"
                      onClick={() => navigate("home")}
                    >
                      <Icon name="close" size={18} />
                    </button>
                  </header>
                  {screen === "question" && (
                    <section className="question-page content-page">
                      <h1>
                        {state.draft.spreadId === "daily"
                          ? "Карта этого дня"
                          : "Что тебя занимает?"}
                      </h1>
                      <p className="subtle">
                        Оставь здесь то, к чему хочется прислушаться.
                      </p>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void begin();
                        }}
                      >
                        {state.draft.spreadId !== "daily" && (
                          <>
                            <label
                              htmlFor="ritual-question"
                              className="sr-only"
                            >
                              Твой вопрос
                            </label>
                            <textarea
                              id="ritual-question"
                              autoFocus
                              maxLength={2000}
                              rows={5}
                              disabled={!!state.draft.operationKey || busy}
                              value={state.draft.question}
                              onChange={(e) =>
                                update((s) => ({
                                  ...s,
                                  draft: {
                                    ...s.draft,
                                    question: e.target.value,
                                  },
                                }))
                              }
                              placeholder="О чём ты думаешь сейчас?"
                            />
                          </>
                        )}
                        <div className="question-spread">
                          <span>
                            {PREMIUM_SPREADS[state.draft.spreadId]?.title}
                            <small>
                              {SPREADS[state.draft.spreadId]?.count} карт ·{" "}
                              {getGuide(state.guideId).name}
                            </small>
                          </span>
                          <button
                            className="quiet"
                            type="button"
                            disabled={!!state.draft.operationKey || busy}
                            onClick={() => setSheet(true)}
                          >
                            Изменить
                          </button>
                        </div>
                        {state.draft.operationKey && !busy && (
                          <p className="footnote">
                            Вопрос отправлен. Повторим подключение к тому же
                            раскладу.
                          </p>
                        )}
                        <button
                          className="primary"
                          disabled={busy}
                          type="submit"
                        >
                          <Icon name="star" size={18} />
                          {busy
                            ? "Карты собираются…"
                            : state.draft.operationKey
                              ? "Повторить соединение"
                              : "Разложить карты"}
                        </button>
                      </form>
                    </section>
                  )}
                  {screen === "spreads" && (
                    <section className="content-page catalog-page">
                      <h1>Расклады</h1>
                      <p className="subtle">Выбери глубину своего вопроса.</p>
                      <div className="spread-catalog">
                        {SPREAD_ORDER.map((id) => (
                          <button
                            className="spread-option"
                            key={id}
                            onClick={() => start(id)}
                          >
                            <SpreadGlyph count={SPREADS[id].count} />
                            <span>
                              <strong>{PREMIUM_SPREADS[id].title}</strong>
                              <small>{PREMIUM_SPREADS[id].about}</small>
                            </span>
                            <Icon name="arrow" size={16} />
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                  {screen === "table" && session && (
                    <section className="table-page">
                      <div className="table-title">
                        <h1>
                          {PREMIUM_SPREADS[session.spread_id || ""]?.title ||
                            session.spread_name}
                        </h1>
                        <p className="subtle">
                          Открой карту, которая зовёт первой.
                        </p>
                      </div>
                      <div
                        className={`spread-table layout-${session.spread_id}`}
                        aria-label="Карты расклада"
                      >
                        {session.cards.map((card, index) => (
                          <button
                            className={`table-card ${progress.revealed.includes(index) ? "opened" : ""}`}
                            data-card-index={index}
                            key={index}
                            onClick={() => selectCard(index)}
                            aria-label={`${progress.revealed.includes(index) ? `Читать ${card.name}` : `Открыть карту ${index + 1}`}: ${session.positions[index] || ""}`}
                          >
                            <TarotArtwork
                              card={
                                progress.revealed.includes(index)
                                  ? card
                                  : undefined
                              }
                              back={!progress.revealed.includes(index)}
                            />
                            <span>{session.positions[index]}</span>
                          </button>
                        ))}
                      </div>
                      <div className="table-question">
                        <Divider />
                        <p>
                          {session.question || "Что просит внимания сегодня?"}
                        </p>
                        <p className="footnote">
                          {getGuide(session.character_id).name}
                        </p>
                        {progress.revealed.length > 0 && (
                          <button
                            className="quiet"
                            onClick={() => selectCard(progress.index)}
                          >
                            Продолжить чтение
                          </button>
                        )}
                      </div>
                    </section>
                  )}
                  {screen === "reading" && session && (
                    <RitualReading
                      key={session.reading_id}
                      session={session}
                      progress={progress}
                      scroller={mainRef}
                      onSelect={selectCard}
                      onTable={() => navigate("table")}
                      onRetry={() => void retry()}
                      onFollowup={(q, i) => void followup(q, i)}
                      onRecoverDiscussion={() =>
                        pending &&
                        void followup(pending.question, pending.card_index)
                      }
                      discussionBusy={discussionBusy}
                      pendingDiscussion={!!pending}
                      error={error}
                    />
                  )}
                  {screen === "journal" && (
                    <Journal onOpen={(id) => void openHistory(id)} />
                  )}
                  {screen === "guides" && (
                    <GuideGallery
                      chosen={state.guideId}
                      onChoose={(id) => void chooseGuide(id)}
                      busy={busy}
                    />
                  )}
                  {screen === "settings" && (
                    <Settings
                      effects={state.effects}
                      onEffects={(effects) =>
                        update((s) => ({ ...s, effects }))
                      }
                    />
                  )}
                </>
              )}
              {error && screen !== "reading" && (
                <div className="notice global-error" role="alert">
                  <p>{error}</p>
                  {session && (
                    <button className="quiet" onClick={() => void reconnect()}>
                      Повторить соединение
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </main>
        {ready && screen === "reading" && session && (
          <nav
            className="card-dots"
            aria-label="Карты расклада"
            inert={intro ? true : undefined}
          >
            {session.cards.map((card, i) => (
              <button
                className={`card-dot ${progress.revealed.includes(i) ? "opened" : ""}`}
                key={i}
                aria-current={progress.index === i ? "step" : undefined}
                aria-label={`${i + 1}. ${session.positions[i] || "Позиция"}${progress.revealed.includes(i) ? `, ${card.name}` : ", закрытая карта"}`}
                onClick={() => selectCard(i)}
              >
                <span />
              </button>
            ))}
          </nav>
        )}
        {ready &&
          !isRitual &&
          screen !== "question" &&
          screen !== "settings" && (
            <nav
              className="ritual-nav"
              aria-label="Основная навигация"
              inert={intro || sheet ? true : undefined}
            >
              {NAV.map((item) => (
                <button
                  key={item.id}
                  aria-current={screen === item.id ? "page" : undefined}
                  onClick={() => navigate(item.id)}
                >
                  <Icon name={item.icon} size={22} />
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          )}
        <dialog
          ref={dialogRef}
          className="spread-sheet"
          onClose={() => setSheet(false)}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSheet(false);
          }}
        >
          <div>
            <header>
              <h2>Выбери расклад</h2>
              <button
                aria-label="Закрыть выбор расклада"
                onClick={() => setSheet(false)}
              >
                <Icon name="close" size={18} />
              </button>
            </header>
            {SPREAD_ORDER.map((id) => (
              <button
                className="spread-option"
                key={id}
                onClick={() => {
                  update((s) => ({
                    ...s,
                    draft: { ...s.draft, spreadId: id },
                  }));
                  setSheet(false);
                }}
              >
                <SpreadGlyph count={SPREADS[id].count} />
                <span>
                  <strong>{PREMIUM_SPREADS[id].title}</strong>
                  <small>{PREMIUM_SPREADS[id].about}</small>
                </span>
              </button>
            ))}
          </div>
        </dialog>
        {intro && (
          <div className="ritual-intro" aria-hidden="true">
            <div>
              <Icon name="star" size={30} />
              <span>АРКАНУМ</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
function SpreadGlyph({ count }: { count: number }) {
  return (
    <span className={`spread-glyph count-${count}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}
