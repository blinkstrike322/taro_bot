'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ApiError, askFollowup, getAllReadings, getCharacter, setCharacter, spreadBegin, spreadPoll, spreadSession, type ReadingEntry } from '@/lib/api';
import { getGuide } from '@/lib/guides';
import { SPREADS } from '@/lib/spreads';
import {
  EMPTY_DRAFT, PREMIUM_GUIDES, PREMIUM_SPREADS, SPREAD_ORDER, cardMetadata, formatPremiumDate,
  hasTelegramAuth, loadPremiumState, makeOperationKey, positionMeaning, premiumStorageKey, previewSession,
  readingPosition, savePremiumState, sessionFromBegin, sessionFromHistory,
  type PremiumDraft, type PremiumScreen, type PremiumSession,
} from '@/lib/premium';
import { Astrolabe, Divider, Icon, type IconName } from './Ornaments';
import { TarotArtwork } from './TarotArtwork';

const NAV: { id: PremiumScreen; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Главная', icon: 'star' },
  { id: 'spreads', label: 'Расклады', icon: 'cards' },
  { id: 'journal', label: 'Журнал', icon: 'journal' },
  { id: 'guides', label: 'Проводники', icon: 'guide' },
];

function Prose({ children, className = '' }: { children: string; className?: string }) {
  return <div className={`p-prose ${className}`}><ReactMarkdown>{children}</ReactMarkdown></div>;
}

function readableError(error: unknown): string {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403) && !error.needsSubscription) return 'Открой ARCANUM через Telegram: так мы сможем безопасно сохранить твой сеанс.';
  if (error instanceof TypeError) return 'Не удалось связаться с сервером. Проверь соединение и попробуй ещё раз: сохранённый запрос будет повторён с тем же номером сеанса.';
  return error instanceof Error ? error.message : 'Что-то прервало соединение. Попробуй ещё раз.';
}

export default function PremiumApp() {
  const [screen, setScreen] = useState<PremiumScreen>('home');
  const [preview, setPreview] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [guideId, setGuideId] = useState('shadow_walker');
  const [draft, setDraft] = useState<PremiumDraft>({ ...EMPTY_DRAFT });
  const [session, setSession] = useState<PremiumSession | null>(null);
  const [viewedSession, setViewedSession] = useState<PremiumSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsAccess, setNeedsAccess] = useState(false);
  const [pollError, setPollError] = useState('');
  const [pollRevision, setPollRevision] = useState(0);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState('');
  const [restorePending, setRestorePending] = useState(false);
  const [restoreRevision, setRestoreRevision] = useState(0);
  const [cardIndex, setCardIndex] = useState(0);
  const [rows, setRows] = useState<ReadingEntry[]>([]);
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalError, setJournalError] = useState('');
  const [journalRevision, setJournalRevision] = useState(0);
  const [followupQuestion, setFollowupQuestion] = useState('');
  const [followupError, setFollowupError] = useState('');
  const [followupBusy, setFollowupBusy] = useState(false);
  const [followupCardIndex, setFollowupCardIndex] = useState(0);
  const busyRef = useRef(false);
  const mainRef = useRef<HTMLElement>(null);
  const persistKey = useRef('');
  const restoreToken = useRef<string | null>(null);
  const active = viewedSession || session;
  const guide = getGuide(active && ['ritual', 'reading'].includes(screen) ? active.guideId : guideId);
  const guideDesign = PREMIUM_GUIDES[guide.id] || PREMIUM_GUIDES.shadow_walker;
  const creatingUncertain = Boolean(draft.operationKey);

  useEffect(() => {
    const key = premiumStorageKey();
    persistKey.current = key;
    const saved = loadPremiumState(key);
    let canceled = false;
    // Client-only storage hydration is scheduled after the server's first paint.
    queueMicrotask(() => {
      if (canceled) return;
      if (saved) {
        setGuideId(saved.guideId); setDraft(saved.draft);
        if (hasTelegramAuth() && saved.session && !saved.session.preview) {
          setSession(saved.session); restoreToken.current = saved.session.token; setRestoring(true); setRestorePending(true);
        }
      }
      setAuthenticated(hasTelegramAuth()); setInitialized(true);
    });
    if (hasTelegramAuth()) getCharacter().then((id) => { if (!canceled && id && PREMIUM_GUIDES[id] && !saved?.draft.operationKey) setGuideId(id); });
    return () => { canceled = true; };
  }, []);

  useEffect(() => {
    const token = restoreToken.current;
    if (!initialized || !authenticated || !token || preview) return;
    let canceled = false;
    queueMicrotask(() => { if (!canceled) { setRestoring(true); setRestoreError(''); } });
    spreadSession(token).then((result) => {
      if (canceled) return;
      // The authenticated server supplies canonical identity, question, cards and text.
      setSession((current) => current?.token === token ? {
        ...current, question: result.question, guideId: result.character_id,
        cards: result.cards, positions: result.positions || [],
        spreadId: result.spread_id || current.spreadId,
        spreadName: PREMIUM_SPREADS[result.spread_id || current.spreadId]?.title || result.spread_name || current.spreadName,
        interpretation: result.interpretation || undefined,
        revealed: current.revealed.filter((index) => index >= 0 && index < result.cards.length),
      } : current);
      if (result.error) setPollError(result.error);
      restoreToken.current = null;
      setRestorePending(false);
    }).catch((failure) => {
      if (canceled) return;
      if (failure instanceof ApiError && [401, 403, 404].includes(failure.status || 0)) {
        setSession(null); restoreToken.current = null;
        setRestorePending(false);
        setRestoreError('Сохранённый сеанс недоступен для этого входа. Открой приложение через свой Telegram-аккаунт.');
      } else setRestoreError('Не удалось проверить сохранённый сеанс. Восстановим его после возвращения связи.');
    }).finally(() => { if (!canceled) setRestoring(false); });
    return () => { canceled = true; };
  }, [initialized, authenticated, preview, restoreRevision]);

  useEffect(() => {
    if (!initialized || !persistKey.current) return;
    savePremiumState(persistKey.current, { version: 1, guideId, draft, session });
  }, [initialized, guideId, draft, session]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [screen]);

  useEffect(() => {
    if (!initialized || !session || session.preview || session.interpretation || session.historical || !authenticated || restoring || restoreToken.current) return;
    let canceled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const token = session.token;
    async function poll() {
      try {
        const result = await spreadPoll(token);
        if (canceled) return;
        if (result.ready) {
          if (result.error || !result.interpretation) setPollError(result.error || 'Чтение пока недоступно. Карты и вопрос сохранены.');
          else setSession((current) => current?.token === token ? { ...current, interpretation: result.interpretation } : current);
          return;
        }
        if (Date.now() - started > 180_000) { setPollError('Чтение ещё не готово. Можно вернуться позже и продолжить этот сеанс.'); return; }
        timer = setTimeout(poll, 1800);
      } catch (pollFailure) {
        if (!canceled) setPollError(readableError(pollFailure));
      }
    }
    queueMicrotask(() => { if (!canceled) { setPollError(''); void poll(); } });
    return () => { canceled = true; if (timer) clearTimeout(timer); };
  }, [initialized, authenticated, session?.token, session?.interpretation, session?.historical, session?.preview, pollRevision, restoring]);

  useEffect(() => {
    if (screen !== 'journal') return;
    if (preview || !authenticated) return;
    let canceled = false;
    queueMicrotask(() => { if (!canceled) { setJournalLoading(true); setJournalError(''); } });
    getAllReadings().then((entries) => { if (!canceled) setRows(entries); }).catch((failure) => { if (!canceled) setJournalError(readableError(failure)); }).finally(() => { if (!canceled) setJournalLoading(false); });
    return () => { canceled = true; };
  }, [screen, preview, authenticated, journalRevision]);

  function navigate(next: PremiumScreen) {
    if (busyRef.current) return;
    if (!['reading', 'ritual'].includes(next)) setViewedSession(null);
    changeScreen(next);
  }

  function changeScreen(next: PremiumScreen) {
    setError(''); setNeedsAccess(false); setFollowupError('');
    if (next !== 'reading') setFollowupQuestion('');
    setScreen(next);
  }

  function switchPreview(enabled: boolean) {
    if (busyRef.current || followupBusy) return;
    // Persist each mode separately before replacing its visible state.
    if (initialized) savePremiumState(persistKey.current, { version: 1, guideId, draft, session });
    const key = premiumStorageKey(enabled);
    const saved = loadPremiumState(key);
    persistKey.current = key;
    setPreview(enabled); setGuideId(saved?.guideId || 'shadow_walker'); setDraft(saved?.draft || { ...EMPTY_DRAFT });
    const restored = enabled ? saved?.session || null : authenticated && saved?.session && !saved.session.preview ? saved.session : null;
    setSession(restored); setViewedSession(null); setCardIndex(0); changeScreen('home'); setPollError(''); setRestoreError('');
    restoreToken.current = !enabled && restored ? restored.token : null;
    setRestoring(Boolean(restoreToken.current)); setRestorePending(Boolean(restoreToken.current)); setRestoreRevision((revision) => revision + 1);
    setJournalLoading(false); setJournalError(''); setRows([]);
  }

  function startQuestion(spreadId = 'three') {
    if (creatingUncertain) { changeScreen('setup'); return; }
    setDraft((current) => ({ question: current.question, spreadId }));
    changeScreen(spreadId === 'daily' ? 'setup' : 'question');
  }

  const updateActive = useCallback((update: (current: PremiumSession) => PremiumSession) => {
    if (viewedSession) setViewedSession((current) => current ? update(current) : current);
    else setSession((current) => current ? update(current) : current);
  }, [viewedSession]);

  async function chooseGuide(id: string) {
    if (creatingUncertain || busyRef.current) return;
    if (preview || !authenticated) { setGuideId(id); return; }
    busyRef.current = true; setBusy(true); setError('');
    try { const savedId = await setCharacter(id); setGuideId(savedId); }
    catch (failure) { setError(readableError(failure)); }
    finally { busyRef.current = false; setBusy(false); }
  }

  async function begin() {
    if (busyRef.current || followupBusy) return;
    if (preview) {
      if (draft.spreadId !== 'three') { setError('Для просмотра подготовлен расклад «Три карты». Выбери его, чтобы пройти весь ритуал.'); return; }
      setSession(previewSession(draft, guideId)); setViewedSession(null); setCardIndex(0); changeScreen('ritual'); return;
    }
    if (!hasTelegramAuth()) { setError('Для личного расклада открой приложение из бота в Telegram. Здесь можно отдельно посмотреть демонстрацию интерфейса.'); return; }
    const operation = { ...draft, operationKey: draft.operationKey || makeOperationKey(), operationGuide: draft.operationGuide || guideId };
    // Save the operation before sending it: a lost response can be retried safely after a reload.
    setDraft(operation);
    savePremiumState(persistKey.current, { version: 1, guideId, draft: operation, session });
    busyRef.current = true; setBusy(true); setError(''); setNeedsAccess(false);
    try {
      await setCharacter(operation.operationGuide!);
      const result = await spreadBegin(operation.spreadId, operation.spreadId === 'daily' ? null : operation.question.trim() || null, operation.operationGuide, new Date().getHours(), operation.operationKey);
      if (!result.token || !Array.isArray(result.cards) || result.cards.length === 0) throw new Error('Сервер не вернул карты. Повтори запрос, чтобы проверить этот же сеанс.');
      const next = sessionFromBegin(result, operation, operation.operationGuide!);
      setSession(next); setViewedSession(null); setCardIndex(0); setPollError(''); setDraft({ question: '', spreadId: operation.spreadId });
      savePremiumState(persistKey.current, { version: 1, guideId, draft: { question: '', spreadId: operation.spreadId }, session: next });
      changeScreen('ritual');
    } catch (failure) {
      setError(readableError(failure));
      if (failure instanceof ApiError) {
        setNeedsAccess(Boolean(failure.needsSubscription));
        // These responses explicitly rejected creation. A transport error keeps the operation locked for a safe retry.
        if (failure.status && failure.status < 500 && failure.status !== 409) setDraft((current) => ({ question: current.question, spreadId: current.spreadId }));
      }
    } finally { busyRef.current = false; setBusy(false); }
  }

  function reveal(index: number) {
    if (!active) return;
    const alreadyOpen = active.revealed.includes(index);
    if (alreadyOpen) { setCardIndex(index); changeScreen('reading'); return; }
    updateActive((current) => ({ ...current, revealed: [...current.revealed, index] }));
    try { (window as unknown as { Telegram?: { WebApp?: { HapticFeedback?: { impactOccurred?: (style: string) => void } } } }).Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('light'); } catch { /* Optional haptic. */ }
  }

  async function submitFollowup(event: React.FormEvent) {
    event.preventDefault();
    if (!active?.interpretation || !active.cards[followupCardIndex] || followupBusy || !followupQuestion.trim()) return;
    const submitted = followupQuestion.trim();
    setFollowupBusy(true); setFollowupError('');
    try {
      const card = active.cards[followupCardIndex];
      const result = preview ? {
        answer: 'Это пример продолжения беседы. Можно начать с небольшого действия, которое даст тебе новый опыт: назначить разговор, попробовать задачу или выделить вечер для своего замысла. Затем прислушайся к впечатлениям — что стало яснее и хочется ли двигаться дальше?',
      } : await askFollowup({
        question: submitted, card: { name: card.name, id: card.id, is_reversed: card.is_reversed, orientation: card.orientation, position: readingPosition(active, followupCardIndex) },
        spread_name: active.spreadName, spread_question: active.question,
        reading_summary: [`${card.name}: ${positionMeaning(active, followupCardIndex)}`, active.interpretation.short_answer, active.interpretation.связь_карт, active.interpretation.intro].filter(Boolean).join('\n').slice(0, 1000),
        character_id: active.guideId,
      });
      updateActive((current) => current.token === active.token ? ({ ...current, followups: [...(current.followups || []), { question: submitted, answer: result.answer, fallback: 'fallback' in result ? result.fallback : false, cardIndex: followupCardIndex }] }) : current);
      setFollowupQuestion('');
    } catch (failure) { setFollowupError(readableError(failure)); }
    finally { setFollowupBusy(false); }
  }

  function renderGuideChoice(compact = false) {
    return <div className={`p-guide-options ${compact ? 'is-compact' : ''}`}>
      {Object.entries(PREMIUM_GUIDES).map(([id, design]) => <button key={id} className={`p-guide-option ${guideId === id ? 'is-selected' : ''}`} type="button" aria-pressed={guideId === id} disabled={busy || creatingUncertain} onClick={() => void chooseGuide(id)}>
        <span className="p-guide-seal" style={{ color: design.accent }}><Icon name={design.symbol} size={compact ? 30 : 42} /></span>
        <span className="p-guide-copy"><span className="p-guide-name">{getGuide(id).name}</span><span className="p-guide-lead">{design.lead}</span>{!compact && <><span className="p-guide-description">{design.description}</span><span className="p-guide-quote">{design.quote}</span></>}</span>
        <span className="p-choice-check" aria-hidden="true">{guideId === id ? <Icon name="check" size={18} /> : <span />}</span>
      </button>)}
    </div>;
  }

  function renderHome() {
    return <section className="p-home p-enter">
      <div className="p-home-heading"><Divider /><h1>АРКАНУМ</h1><p className="p-eyebrow">Тихое пространство для важного вопроса</p></div>
      <div className="p-hero"><Astrolabe /><img src="/premium/home-hero.webp" alt="Лунный свет над тёмной водой" loading="eager" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} /><div className="p-hero-shade" /></div>
      <div className="p-home-actions">
        <p className="p-home-quote">«Иногда ответ приходит<br />не в словах, а в образах»</p>
        <button className="p-button p-button-primary" onClick={() => startQuestion()}><Icon name="star" size={20} /><span>Задать вопрос</span><Icon name="arrow" size={20} /></button>
        <button className="p-home-daily" onClick={() => startQuestion('daily')}><Icon name="moon" size={18} />Карта дня<span>Одна карта. Твой фокус.</span></button>
      </div>
      {(session || creatingUncertain) && <button className="p-resume" disabled={restoring || restorePending} onClick={() => { setViewedSession(null); changeScreen(creatingUncertain ? 'setup' : 'ritual'); }}><Icon name="cards" size={24} /><span><strong>{restoring ? 'Восстанавливаем сеанс…' : creatingUncertain ? 'Продолжить создание сеанса' : 'Вернуться к раскладу'}</strong><small>{creatingUncertain ? 'Вопрос сохранён. Повтор безопасен.' : restoring || restorePending ? 'Проверяем сохранённое чтение' : session?.question || session?.spreadName}</small></span><Icon name="arrow" size={18} /></button>}
      {restoreError && <div className="p-notice is-error"><p>{restoreError}</p>{restorePending && <button className="p-text-button" onClick={() => setRestoreRevision((revision) => revision + 1)}>Восстановить сеанс<Icon name="refresh" size={16} /></button>}</div>}
      {!preview && initialized && !authenticated && <div className="p-browser-note"><p>Личные расклады доступны при входе через Telegram.</p><button onClick={() => switchPreview(true)} className="p-text-button">Посмотреть демонстрацию<Icon name="arrow" size={16} /></button><small>Пример с заранее подготовленными картами и текстом.</small></div>}
      <div className="p-home-guide"><Icon name={guideDesign.symbol} size={18} /><span>{guide.name}</span><button onClick={() => navigate('guides')}>Выбрать</button></div>
    </section>;
  }

  function renderQuestion() {
    return <section className="p-content p-enter">
      <ScreenHeading eyebrow="ТВОЙ РИТУАЛ · 01" title="Что тебя волнует?" text="Расскажи о ситуации своими словами. Вопрос поможет картам стать ближе к твоему опыту." />
      <form className="p-question-form" onSubmit={(event) => { event.preventDefault(); if (draft.question.trim().length >= 3) changeScreen('setup'); }}>
        <label htmlFor="arcanum-question" className="p-label">Твой вопрос</label>
        <textarea id="arcanum-question" className="p-textarea" maxLength={500} rows={6} value={draft.question} disabled={creatingUncertain} placeholder="Например: что поможет мне решиться на перемены в работе?" onChange={(event) => setDraft({ ...draft, question: event.target.value, operationKey: undefined, operationGuide: undefined })} />
        <div className="p-field-footer"><span>Сфокусируйся на том, что важно для тебя.</span>{draft.question.length > 400 && <span>{draft.question.length}/500</span>}</div>
        <div className="p-question-suggestion"><Icon name="star" size={22} /><p>Хорошее начало — «Что я могу понять…», «На что обратить внимание…», «Какой шаг мне поможет…»</p></div>
        <button className="p-button p-button-primary" disabled={draft.question.trim().length < 3} type="submit"><span>Выбрать расклад</span><Icon name="arrow" size={20} /></button>
      </form>
    </section>;
  }

  function renderSetup() {
    const selected = PREMIUM_SPREADS[draft.spreadId];
    return <section className="p-content p-enter">
      <ScreenHeading eyebrow="ТВОЙ РИТУАЛ · 02" title="Выбери свой путь" text="Расклад задаёт глубину. Проводник — голос, с которым ты услышишь карты." />
      <div className="p-question-summary"><span className="p-eyebrow">{draft.spreadId === 'daily' ? 'ЕЖЕДНЕВНЫЙ РИТУАЛ' : 'ТВОЙ ВОПРОС'}</span><p>{draft.spreadId === 'daily' ? 'На что обратить внимание сегодня?' : draft.question || 'Что мне важно увидеть сейчас?'}</p>{!creatingUncertain && draft.spreadId !== 'daily' && <button className="p-text-button" onClick={() => changeScreen('question')}>Изменить</button>}</div>
      <div className="p-section-label"><h2>Расклад</h2><span>{SPREADS[draft.spreadId].count} {cardCountWord(SPREADS[draft.spreadId].count)}</span></div>
      <div className="p-setup-spreads">{SPREAD_ORDER.map((id) => <button key={id} className={`p-spread-chip ${draft.spreadId === id ? 'is-selected' : ''}`} disabled={creatingUncertain || busy} aria-pressed={draft.spreadId === id} onClick={() => setDraft((current) => ({ ...current, spreadId: id }))}>{PREMIUM_SPREADS[id].title}</button>)}</div>
      <p className="p-muted p-selected-description">{selected.about}</p>
      <div className="p-section-label"><h2>Проводник</h2><span>Твой собеседник</span></div>
      {renderGuideChoice(true)}
      <p className="p-session-note">{preview ? 'Демонстрация: готовый пример чтения, без обращения к моделям.' : 'Карты и вопрос сохранятся в твоём журнале. Если связь прервётся, этот сеанс можно продолжить.'}</p>
      {creatingUncertain && <div className="p-notice"><p>Запрос уже сохранён. Повтори подключение, чтобы получить тот же сеанс.</p></div>}
      {error && <ErrorNotice text={error} needsAccess={needsAccess} />}
      <button className="p-button p-button-primary" disabled={busy || (SPREADS[draft.spreadId].needsQuestion && draft.question.trim().length < 3)} onClick={() => void begin()}><Icon name={busy ? 'refresh' : 'star'} size={20} className={busy ? 'p-spin' : ''} /><span>{busy ? 'Готовим твой сеанс…' : creatingUncertain ? 'Повторить подключение' : 'Начать ритуал'}</span>{!busy && <Icon name="arrow" size={20} />}</button>
      {!preview && !authenticated && <button className="p-text-button p-centered" onClick={() => switchPreview(true)}>Перейти к демонстрации</button>}
    </section>;
  }

  function renderSpreads() {
    return <section className="p-content p-enter">
      <ScreenHeading eyebrow="ВОСЕМЬ СПОСОБОВ УСЛЫШАТЬ СЕБЯ" title="Расклады" text="От короткой паузы до внимательного исследования. Выбери глубину, которая подходит сейчас." />
      <div className="p-catalog">{SPREAD_ORDER.map((id, index) => <button className={`p-catalog-card ${id === 'three' ? 'is-featured' : ''}`} key={id} onClick={() => startQuestion(id)}><span className="p-catalog-visual" aria-hidden="true"><SpreadGlyph count={SPREADS[id].count} /><small>{String(index + 1).padStart(2, '0')}</small></span><span className="p-catalog-copy"><span className="p-eyebrow">{PREMIUM_SPREADS[id].tag}</span><strong>{PREMIUM_SPREADS[id].title}</strong><span>{PREMIUM_SPREADS[id].about}</span><small>{SPREADS[id].count} {cardCountWord(SPREADS[id].count)}</small></span><Icon name="arrow" size={18} /></button>)}</div>
    </section>;
  }

  function renderGuides() {
    return <section className="p-content p-enter">
      <ScreenHeading eyebrow="ОДНИ КАРТЫ · ТРИ ГОЛОСА" title="Кто будет рядом?" text="Каждый проводник смотрит на образы по-своему. Выбери интонацию, в которой тебе сейчас легче услышать себя." />
      {renderGuideChoice()}
      {error && <ErrorNotice text={error} />}
      <p className="p-session-note">Проводник влияет на подачу чтения. В уже начатом сеансе его голос сохраняется.</p>
      <button className="p-button" onClick={() => startQuestion()} disabled={busy}><span>Задать вопрос</span><Icon name="arrow" size={20} /></button>
    </section>;
  }

  function renderRitual() {
    if (!active) return renderHome();
    const allOpen = active.revealed.length >= active.cards.length;
    return <section className="p-content p-ritual p-enter">
      <ScreenHeading eyebrow="ТВОЙ РАСКЛАД" title={active.spreadName} text={allOpen ? 'Карты открыты. Теперь можно услышать их историю.' : 'Сделай вдох. Открой карты одну за другой, когда будешь готова.'} />
      <div className={`p-card-table ${active.cards.length === 1 ? 'is-single' : active.cards.length > 3 ? 'is-many' : ''}`}><Astrolabe />
        <div className="p-table-cards">{active.cards.map((card, index) => <button key={`${card.id}-${index}`} type="button" className={`p-reveal-card ${active.revealed.includes(index) ? 'is-revealed' : ''}`} onClick={() => reveal(index)} aria-label={active.revealed.includes(index) ? `Читать карту ${card.name}, ${readingPosition(active, index)}` : `Открыть карту ${index + 1}, ${readingPosition(active, index)}`}>
          <div className="p-card-flip"><div className="p-flip-back" aria-hidden={active.revealed.includes(index)}><TarotArtwork back /></div><div className="p-flip-front" aria-hidden={!active.revealed.includes(index)}><TarotArtwork card={card} /></div></div>
          <span className="p-card-position">{readingPosition(active, index)}</span><span className="p-card-order">{active.revealed.includes(index) ? card.is_reversed ? 'Перевёрнутая' : 'Открыта' : `${String(index + 1).padStart(2, '0')} · открыть`}</span>
        </button>)}</div>
      </div>
      <Divider />
      <div className="p-ritual-question"><span className="p-eyebrow">{active.spreadId === 'daily' ? 'ФОКУС ДНЯ' : 'ТВОЙ ВОПРОС'}</span><p>{active.question || 'Что мне важно увидеть сейчас?'}</p></div>
      <div className="p-reading-status" role="status"><Icon name={guideDesign.symbol} size={22} /><span>{active.interpretation ? `${guide.name} · чтение готово` : pollError ? 'Карты сохранены. Чтение требует внимания.' : `${guide.name} соединяет образы…`}</span>{!active.interpretation && !pollError && <span className="p-wait-dots" aria-hidden="true">···</span>}</div>
      {pollError && <div className="p-notice is-error"><p>{pollError}</p><button className="p-text-button" onClick={() => setPollRevision((value) => value + 1)}>Проверить чтение<Icon name="refresh" size={16} /></button></div>}
      <button className="p-button p-button-primary" disabled={!allOpen} onClick={() => { setCardIndex(0); changeScreen('reading'); }}><span>{allOpen ? 'Перейти к чтению' : `Открыто ${active.revealed.length} из ${active.cards.length}`}</span><Icon name="arrow" size={20} /></button>
      <p className="p-session-note">Открытие карты сохраняет прогресс. Ты можешь вернуться к этому раскладу позже.</p>
    </section>;
  }

  function renderReading() {
    if (!active) return renderHome();
    const card = active.cards[cardIndex] || active.cards[0];
    const interp = active.interpretation;
    const metadata = card ? cardMetadata(card.id) : null;
    return <article className="p-content p-reading p-enter">
      <div className="p-reading-heading"><span className="p-eyebrow">{active.spreadName} · {formatPremiumDate(active.createdAt)}</span><span>{String(cardIndex + 1).padStart(2, '0')} / {String(active.cards.length).padStart(2, '0')}</span></div>
      {card && <><div className="p-large-card"><TarotArtwork key={card.id} card={card} large /><div className="p-card-pagination" aria-label="Карты расклада">{active.cards.map((item, index) => <button key={`${item.id}-${index}`} aria-label={`Карта ${index + 1}: ${item.name}`} aria-current={cardIndex === index ? 'true' : undefined} onClick={() => setCardIndex(index)}><span /></button>)}</div></div>
        <div className="p-card-detail-title"><span className="p-eyebrow">{readingPosition(active, cardIndex)}</span><h1>{card.name}</h1><div className="p-card-detail-meta"><span>{metadata?.numeral && `${metadata.numeral} · `}{metadata?.family}</span><span>{card.is_reversed ? 'Перевёрнутая' : 'Прямая'}</span></div></div>
        <p className="p-card-keywords">{card.is_reversed ? card.reversed : card.upright}</p>
        {positionMeaning(active, cardIndex) && <div className="p-position-reading"><span className="p-eyebrow">В ТВОЁМ ВОПРОСЕ</span><Prose>{positionMeaning(active, cardIndex)}</Prose></div>}
        <div className="p-card-next-prev"><button className="p-text-button" disabled={cardIndex === 0} onClick={() => setCardIndex((index) => index - 1)}><Icon name="back" size={17} />Предыдущая</button><button className="p-text-button" disabled={cardIndex >= active.cards.length - 1} onClick={() => setCardIndex((index) => index + 1)}>Следующая<Icon name="arrow" size={17} /></button></div></>}
      <Divider />
      {active.question && <div className="p-question-summary p-reading-question"><span className="p-eyebrow">ТВОЙ ВОПРОС</span><p>{active.question}</p></div>}
      {!interp && <div className="p-notice"><p>{pollError || 'Проводник готовит персональное чтение. Пока ты можешь рассмотреть карты и их базовые значения.'}</p>{pollError && <button className="p-text-button" onClick={() => setPollRevision((value) => value + 1)}>Проверить чтение<Icon name="refresh" size={16} /></button>}</div>}
      {interp && <div className="p-synthesis"><div className="p-section-label"><h2>История твоего расклада</h2><Icon name="star" size={22} /></div>{interp.intro && <Prose className="p-reading-intro">{interp.intro}</Prose>}{interp.short_answer && <div className="p-key-answer"><span className="p-eyebrow">ГЛАВНАЯ МЫСЛЬ</span><Prose>{interp.short_answer}</Prose></div>}{interp.связь_карт && <><h3>Как связаны карты</h3><Prose>{interp.связь_карт}</Prose></>}{interp.проявление && <><h3>Как это может проявиться</h3><Prose>{interp.проявление}</Prose></>}{interp.на_что_смотреть && <><h3>На что обратить внимание</h3><Prose>{interp.на_что_смотреть}</Prose></>}{interp.траектория && <div className="p-day-trajectory">{(['утро', 'день', 'вечер'] as const).map((part) => interp.траектория?.[part] && <div key={part}><h3>{part}</h3><Prose>{interp.траектория[part]!}</Prose></div>)}</div>}{interp.advice && <div className="p-guide-advice"><Icon name={guideDesign.symbol} size={24} /><div><span className="p-eyebrow">СОВЕТ · {guide.name}</span><Prose>{interp.advice}</Prose></div></div>}
        <section className="p-followup"><Divider /><h2>Останемся в разговоре</h2><p className="p-muted">Можно уточнить смысл одной из карт. Проводник опирается на этот расклад.</p>
          {(active.followups || []).map((reply, index) => <div className="p-conversation" key={`${index}-${reply.question}`}><p className="p-conversation-question">{reply.question}</p><span className="p-eyebrow">{guide.name} · {active.cards[reply.cardIndex]?.name || 'Карта'}</span><Prose>{reply.answer}</Prose>{reply.fallback && <small className="p-muted">Базовый ответ: персональная модель сейчас недоступна.</small>}</div>)}
          <form onSubmit={(event) => void submitFollowup(event)}><label className="p-label" htmlFor="followup-card">О какой карте поговорим?</label><select id="followup-card" className="p-select" value={followupCardIndex} onChange={(event) => setFollowupCardIndex(Number(event.target.value))}>{active.cards.map((item, index) => <option key={`${item.id}-${index}`} value={index}>{item.name} · {readingPosition(active, index)}</option>)}</select><label className="p-label" htmlFor="followup-question">Уточняющий вопрос</label><textarea id="followup-question" className="p-textarea" rows={3} maxLength={500} placeholder="Какой первый шаг я могу сделать?" value={followupQuestion} onChange={(event) => setFollowupQuestion(event.target.value)} disabled={followupBusy} />{followupError && <ErrorNotice text={followupError} />}<button className="p-button" type="submit" disabled={followupBusy || followupQuestion.trim().length < 3 || (!preview && !authenticated)}><span>{followupBusy ? 'Проводник отвечает…' : 'Спросить проводника'}</span><Icon name={followupBusy ? 'refresh' : 'arrow'} size={18} className={followupBusy ? 'p-spin' : ''} /></button></form>
        </section></div>}
      <div className="p-reading-end"><Divider /><p>Возьми с собой то, что откликается.</p><span className="p-session-note">Образы карт помогают размышлять о возможностях. Выбор остаётся за тобой.</span><button className="p-button p-button-primary" onClick={() => navigate('journal')}><Icon name="journal" size={20} /><span>Открыть журнал</span><Icon name="arrow" size={20} /></button><button className="p-text-button p-centered" onClick={() => startQuestion()}>Новый вопрос</button></div>
    </article>;
  }

  function renderJournal() {
    const demo = preview && session?.interpretation ? [session] : [];
    const entries = preview ? demo : rows.map(sessionFromHistory);
    return <section className="p-content p-enter"><ScreenHeading eyebrow="ТВОИ ВОПРОСЫ И ОТКРЫТИЯ" title="Журнал" text="К некоторым словам хочется возвращаться. Здесь хранятся твои расклады и их исходные чтения." />
      {journalLoading && <div className="p-empty" role="status"><Icon name="refresh" size={30} className="p-spin" /><p>Открываем страницы…</p></div>}
      {journalError && <div className="p-notice is-error"><p>{journalError}</p><button className="p-text-button" onClick={() => setJournalRevision((value) => value + 1)}>Попробовать снова<Icon name="refresh" size={16} /></button></div>}
      {!journalLoading && !journalError && entries.length === 0 && <div className="p-empty"><span className="p-empty-symbol"><Icon name="journal" size={44} /></span><h2>{!preview && !authenticated ? 'Твой журнал — в Telegram' : 'Первая страница ждёт'}</h2><p>{!preview && !authenticated ? 'Открой приложение через бота, чтобы увидеть личные записи. В демонстрации появится отдельный пример.' : 'После первого расклада здесь появятся вопрос, карты и слова проводника.'}</p><button className="p-button" onClick={() => startQuestion()}><span>Задать вопрос</span><Icon name="arrow" size={18} /></button></div>}
      <div className="p-journal-list">{entries.map((entry) => <button className="p-journal-entry" key={entry.token} onClick={() => { setViewedSession(entry); setCardIndex(0); setFollowupCardIndex(0); changeScreen('reading'); }}><div className="p-journal-entry-heading"><span className="p-eyebrow">{formatPremiumDate(entry.createdAt)}</span><span>{entry.spreadName}</span></div><h2>{entry.question || 'На что обратить внимание сегодня?'}</h2><div className="p-journal-entry-bottom"><div className="p-journal-cards">{entry.cards.slice(0, 3).map((card, index) => <div key={`${card.id}-${index}`}><TarotArtwork card={card} /></div>)}</div><span>{getGuide(entry.guideId).name}</span><Icon name="arrow" size={20} /></div></button>)}</div>
      {preview && entries.length > 0 && <p className="p-session-note">Пример журнала. Записи демонстрации хранятся отдельно от личных сеансов.</p>}
    </section>;
  }

  const isDetail = ['question', 'setup', 'ritual', 'reading'].includes(screen);
  const activeNav = isDetail ? 'spreads' : screen;
  const content = screen === 'home' ? renderHome() : screen === 'question' ? renderQuestion() : screen === 'setup' ? renderSetup() : screen === 'spreads' ? renderSpreads() : screen === 'guides' ? renderGuides() : screen === 'ritual' ? renderRitual() : screen === 'reading' ? renderReading() : renderJournal();

  return <div className="premium-app" style={{ '--p-guide': guideDesign.accent } as React.CSSProperties}>
    <div className="p-shell">
      <header className="p-header"><button className="p-brand" aria-label="ARCANUM — главная" onClick={() => navigate('home')}><Icon name="star" size={15} /><span>ARCANUM</span></button><span className="p-header-tag">{preview ? 'ДЕМОНСТРАЦИЯ' : 'ЛИЧНЫЙ РИТУАЛ'}</span><button className="p-header-guide" onClick={() => navigate('guides')} aria-label={`Проводник: ${guide.name}`}><Icon name={guideDesign.symbol} size={23} /></button></header>
      {preview && <div className="p-preview-banner"><span>Пример · карты и тексты подготовлены заранее</span><button onClick={() => switchPreview(false)}>Выйти<Icon name="close" size={14} /></button></div>}
      <main className="p-main" ref={mainRef} id="arcanum-content">
        {isDetail && <div className="p-back-row"><button className="p-back" aria-label="Назад" disabled={busy} onClick={() => { if (screen === 'setup') changeScreen(draft.spreadId === 'daily' ? 'home' : 'question'); else if (screen === 'reading') changeScreen(viewedSession ? 'journal' : 'ritual'); else navigate('home'); }}><Icon name="back" size={22} /><span>{screen === 'reading' && viewedSession ? 'Журнал' : screen === 'reading' ? 'Расклад' : 'Назад'}</span></button>{['ritual', 'reading'].includes(screen) && <span className="p-back-context">{guide.name}</span>}</div>}
        {content}
      </main>
      <nav className="p-nav" aria-label="Основная навигация">{NAV.map((item) => <button type="button" key={item.id} className={activeNav === item.id ? 'is-active' : ''} aria-current={activeNav === item.id ? 'page' : undefined} disabled={busy} onClick={() => navigate(item.id)}><Icon name={item.icon} size={24} /><span>{item.label}</span></button>)}</nav>
    </div>
  </div>;
}

function ScreenHeading({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return <div className="p-screen-heading"><span className="p-eyebrow">{eyebrow}</span><h1>{title}</h1>{text && <p>{text}</p>}<Divider /></div>;
}

function ErrorNotice({ text, needsAccess = false }: { text: string; needsAccess?: boolean }) {
  return <div className="p-notice is-error" role="alert"><p>{text}</p>{needsAccess && <p>Условия доступа и оплату можно посмотреть в боте: открой чат и отправь /subscribe. Твой вопрос остаётся здесь.</p>}</div>;
}

function cardCountWord(count: number) { return count === 1 ? 'карта' : count < 5 ? 'карты' : 'карт'; }

function SpreadGlyph({ count }: { count: number }) {
  return <svg width="56" height="62" viewBox="0 0 56 62" fill="none" stroke="currentColor" strokeWidth=".8" aria-hidden="true">{Array.from({ length: Math.min(count, 3) }, (_, index) => <g key={index} transform={`translate(${count === 1 ? 16 : 6 + index * 12},${count === 1 ? 10 : 15 - index * 4}) rotate(${count === 1 ? 0 : index * 8 - 8} 12 20)`}><rect width="24" height="40" rx="2" /><path d="m12 12 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" /></g>)}</svg>;
}
