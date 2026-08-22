'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Layout from '@/components/Layout';
import WelcomeAnimation from '@/components/WelcomeAnimation';
import Spread1Card from '@/components/Spread1Card';
import Spread3Cards from '@/components/Spread3Cards';
import SpreadDaily from '@/components/SpreadDaily';
import CatalogModal from '@/components/CatalogModal';
import SettingsModal from '@/components/SettingsModal';
import CalendarModal from '@/components/CalendarModal';
import PixelFlower from '@/components/PixelFlower';
import ErrorModal from '@/components/ErrorModal';
import * as API from '@/lib/api';
import { getGuide, GuideMeta } from '@/lib/guides';

type SpreadType = 'daily' | '1' | '3';
type Screen = 'welcome' | 'spread' | 'daily';

// ── Слой пастельных частиц проводницы (процедурные, без картинок) ──
function GuideParticles({ guide }: { guide: GuideMeta }) {
  const particles = useMemo(() => {
    const PHI = 1.618033988749;
    const seeded = (s: number) => Math.abs((Math.sin(s * 12.9898 + 78.233) * 43758.5453) % 1);
    // 12 частиц — атмосфера без лишнего рендера
    return Array.from({ length: 12 }, (_, i) => {
      const s = i * PHI + 7;
      return {
        symbol: guide.ambientSymbols[Math.floor(seeded(s) * guide.ambientSymbols.length)],
        x: seeded(s * 3) * 100,
        y: 60 + seeded(s * 5) * 40,
        size: 8 + Math.floor(seeded(s * 7) * 9),
        op: 0.14 + seeded(s * 11) * 0.18,
        delay: seeded(s * 13) * 16,
        dur: 15 + seeded(s * 17) * 11,
        xShift: (seeded(s * 19) - 0.5) * 22,
        rot: (seeded(s * 23) - 0.5) * 12,
      };
    });
  }, [guide.id]);

  return (
    <div className="guide-particles" aria-hidden="true">
      {particles.map((p, i) => (
        <span
          key={i}
          className="guide-particle"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            fontSize: `${p.size}px`,
            color: guide.accent,
            textShadow: `0 0 6px ${guide.accentDim}`,
            '--gp-op': p.op,
            '--gp-delay': `${p.delay}s`,
            '--gp-dur': `${p.dur}s`,
            '--gp-x': `${p.xShift}px`,
            '--gp-rot': `${p.rot}deg`,
          } as React.CSSProperties}
        >
          {p.symbol}
        </span>
      ))}
    </div>
  );
}

export default function Home() {
  const [spreadType, setSpreadType] = useState<SpreadType | null>(null);
  const [screen, setScreen] = useState<Screen>('welcome');
  const [characterId, setCharacterId] = useState('shadow_walker');

  const [catalogOpen, setCatalogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [errorVisible, setErrorVisible] = useState(false);

  const [dailyKey, setDailyKey] = useState(0);
  const [spreadKey, setSpreadKey] = useState(0);

  const guide = useMemo(() => getGuide(characterId), [characterId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = (params.get('type') as SpreadType) || 'daily';
    setSpreadType(type);

    // Мгновенно — из localStorage
    try {
      const stored = localStorage.getItem('taro_character');
      if (stored) setCharacterId(stored);
    } catch {}

    // Затем синхронизация с бэкендом
    API.getCharacter().then((serverId) => {
      if (serverId) {
        setCharacterId(serverId);
        try { localStorage.setItem('taro_character', serverId); } catch {}
      }
    });
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
  }, []);

  const showError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setErrorVisible(true);
  }, []);

  const hideError = useCallback(() => {
    setErrorVisible(false);
  }, []);

  const handleWelcomeComplete = useCallback(() => {
    setScreen(spreadType === 'daily' ? 'daily' : 'spread');
  }, [spreadType]);

  const handleCatalogSelect = useCallback((type: SpreadType) => {
    setSpreadType(type);
    const url = new URL(window.location.href);
    url.searchParams.set('type', type);
    window.history.replaceState({}, '', url.toString());

    if (type === 'daily') {
      setDailyKey((k) => k + 1);
      setScreen('daily');
      showToast('три карты ждут тебя');
    } else {
      setScreen('spread');
      setSpreadKey((k) => k + 1);
    }
  }, [showToast]);

  const handleCharacterChange = useCallback((id: string) => {
    setCharacterId(id);
    try {
      localStorage.setItem('taro_character', id);
    } catch {}
    showToast('проводница рядом');
  }, [showToast]);

  const handleNewSpread = useCallback(() => {
    if (spreadType === 'daily') {
      setDailyKey((k) => k + 1);
      setScreen('daily');
    } else {
      setScreen('spread');
      setSpreadKey((k) => k + 1);
    }
  }, [spreadType]);

  const arcanaCount = spreadType === '1' ? 1 : 3;

  // Общий API-вызов с маппингом карт и reading_id
  const makeApiCall = useCallback(
    (type: 1 | 3) => (question: string | null) =>
      API.spread(type, question, characterId).then((res) => ({
        readingId: res.reading_id,
        cards: res.cards.map((c) => ({
          ...c,
          image_url: `/cards/${c.id}.webp`,
        })),
        interpretation: res.interpretation,
      })),
    [characterId],
  );

  const makeDailyApiCall = useCallback(
    () =>
      API.spread('daily', null, characterId).then((res) => ({
        readingId: res.reading_id,
        cards: res.cards.map((c) => ({
          ...c,
          image_url: `/cards/${c.id}.webp`,
        })),
        interpretation: res.interpretation,
      })),
    [characterId],
  );

  return (
    <Layout
      spreadType={spreadType ?? '—'}
      arcanaCount={arcanaCount}
      characterId={characterId}
      onOpenCatalog={() => setCatalogOpen(true)}
      onOpenSettings={() => setSettingsOpen(true)}
      onOpenCalendar={() => setCalendarOpen(true)}
      onNewSpread={handleNewSpread}
      toastMessage={toastMsg}
      toastVisible={toastVisible}
      onToastHide={() => setToastVisible(false)}
    >
      {screen === 'welcome' && spreadType && (
        <WelcomeAnimation
          spreadType={spreadType}
          onComplete={handleWelcomeComplete}
          characterId={characterId}
        />
      )}

      {/* ─── РАСКЛАД ДНЯ ─── */}
      {screen === 'daily' && (
        <div
          className="relative flex flex-col items-center w-full min-h-full"
          style={{
            '--guide-accent': guide.accent,
            '--guide-accent-deep': guide.accentDeep,
            '--guide-accent-dim': guide.accentDim,
          } as React.CSSProperties}
        >
          <div
            className="guide-ambient"
            style={{ background: guide.ambientPattern }}
            aria-hidden="true"
          />
          <GuideParticles guide={guide} />
          <div className="relative z-10 w-full">
            <SpreadDaily
              key={dailyKey}
              characterId={characterId}
              onError={showError}
              apiCall={makeDailyApiCall}
            />
          </div>
        </div>
      )}

      {/* ─── РАСКЛАДЫ 1 / 3 С ВОПРОСОМ ─── */}
      {screen === 'spread' && (spreadType === '1' || spreadType === '3') && (
        <div
          className="relative flex flex-col items-center w-full min-h-full"
          style={{
            '--guide-accent': guide.accent,
            '--guide-accent-deep': guide.accentDeep,
            '--guide-accent-dim': guide.accentDim,
          } as React.CSSProperties}
        >
          <div
            className="guide-ambient"
            style={{ background: guide.ambientPattern }}
            aria-hidden="true"
          />
          <GuideParticles guide={guide} />
          {/* большой ирис-схема — как на карте дня: сливается с фоном */}
          <div
            className="absolute pointer-events-none z-0"
            style={{ bottom: '-24%', left: '-16%', width: '64vmin' }}
            aria-hidden="true"
          >
            <PixelFlower
              seed={17}
              size={560}
              variant="iris"
              color={guide.accent}
              bgColor="var(--paper)"
              opacity={0.24}
            />
          </div>
          <div className="flex-1 w-full relative z-10 flex flex-col">
            {spreadType === '1' ? (
              <Spread1Card
                key={spreadKey}
                characterId={characterId}
                onError={showError}
                apiCall={makeApiCall(1)}
              />
            ) : (
              <Spread3Cards
                key={spreadKey}
                characterId={characterId}
                onError={showError}
                apiCall={makeApiCall(3)}
              />
            )}
          </div>
        </div>
      )}

      <CatalogModal
        isOpen={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        onSelect={handleCatalogSelect}
        characterId={characterId}
      />
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        currentCharacter={characterId}
        onCharacterChange={handleCharacterChange}
      />
      <CalendarModal
        isOpen={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        initData={API.getInitData()}
      />

      <ErrorModal
        message={errorMsg}
        visible={errorVisible}
        onHide={hideError}
        characterId={characterId}
      />
    </Layout>
  );
}
