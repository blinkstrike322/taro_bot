'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Layout from '@/components/Layout';
import WelcomeAnimation from '@/components/WelcomeAnimation';
import Spread1Card from '@/components/Spread1Card';
import Spread3Cards from '@/components/Spread3Cards';
import CatalogModal from '@/components/CatalogModal';
import SettingsModal from '@/components/SettingsModal';
import CalendarModal from '@/components/CalendarModal';
import Card, { TarotCard } from '@/components/Card';
import ReadingResult from '@/components/ReadingResult';
import GuideLoading from '@/components/GuideLoading';
import ErrorModal from '@/components/ErrorModal';
import * as API from '@/lib/api';
import { getGuide, GuideMeta } from '@/lib/guides';

type SpreadType = 'daily' | '1' | '3';
type Screen = 'welcome' | 'spread' | 'daily-pick' | 'daily-result';

interface ReadingData {
  cards: TarotCard[];
  interpretation: {
    intro: string;
    short_answer: string;
    card_meaning: string[] | string;
    advice: string;
  };
}

// ── per-guide particle layer (procedural, no images) ──
function GuideParticles({ guide }: { guide: GuideMeta }) {
  const particles = useMemo(() => {
    const PHI = 1.618033988749;
    const seeded = (s: number) => Math.abs((Math.sin(s * 12.9898 + 78.233) * 43758.5453) % 1);
    return Array.from({ length: 22 }, (_, i) => {
      const s = i * PHI + 7;
      return {
        symbol: guide.ambientSymbols[Math.floor(seeded(s) * guide.ambientSymbols.length)],
        x: seeded(s * 3) * 100,
        y: 60 + seeded(s * 5) * 40, // biased to bottom half, drifts up
        size: 7 + Math.floor(seeded(s * 7) * 9),
        op: 0.12 + seeded(s * 11) * 0.20,
        delay: seeded(s * 13) * 18,
        dur: 14 + seeded(s * 17) * 12,
        xShift: (seeded(s * 19) - 0.5) * 24,
        rot: (seeded(s * 23) - 0.5) * 14,
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
            textShadow: `0 0 4px ${guide.accentDim}`,
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

  const [dailyData, setDailyData] = useState<ReadingData | null>(null);
  const [dailyFlipped, setDailyFlipped] = useState(false);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [spreadKey, setSpreadKey] = useState(0);

  const guide = useMemo(() => getGuide(characterId), [characterId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = (params.get('type') as SpreadType) || 'daily';
    setSpreadType(type);

    try {
      const stored = localStorage.getItem('taro_character');
      if (stored) setCharacterId(stored);
    } catch {}
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
    if (spreadType === 'daily') {
      setScreen('daily-pick');
    } else {
      setScreen('spread');
    }
  }, [spreadType]);

  const handleCatalogSelect = useCallback((type: SpreadType) => {
    setSpreadType(type);
    const url = new URL(window.location.href);
    url.searchParams.set('type', type);
    window.history.replaceState({}, '', url.toString());

    if (type === 'daily') {
      setDailyData(null);
      setDailyFlipped(false);
      setScreen('daily-pick');
      showToast('ВЫБЕРИ КАРТУ');
    } else {
      setScreen('spread');
    }
  }, [showToast]);

  const handleCharacterChange = useCallback((id: string) => {
    setCharacterId(id);
    try {
      localStorage.setItem('taro_character', id);
    } catch {}
    showToast('ПРOВOДНИК СМЕНЕН');
  }, [showToast]);

  const handleNewSpread = useCallback(() => {
    if (spreadType === 'daily') {
      setDailyData(null);
      setDailyFlipped(false);
      setScreen('daily-pick');
    } else {
      setScreen('spread');
      setSpreadKey(k => k + 1);
    }
  }, [spreadType]);

  const handleDailyCardTap = useCallback(async () => {
    if (dailyLoading) return;
    setDailyLoading(true);
    try {
      const result = await API.spread(1, null, characterId);
      const cards = result.cards.map((c) => ({
        ...c,
        image_url: `/cards/${c.id}.png`,
      }));
      setDailyData({ cards, interpretation: result.interpretation });
      setDailyFlipped(false);
      setScreen('daily-result');
    } catch (err: any) {
      const msg = err?.response?.error || err?.message || 'OШИБКА. ПOПРOБУЙ СНOВА';
      showError(msg);
    } finally {
      setDailyLoading(false);
    }
  }, [characterId, showError, dailyLoading]);

  const handleDailyFlip = useCallback(() => {
    setDailyFlipped(true);
  }, []);

  const arcanaCount = spreadType === '3' ? 3 : 1;

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

      {/* ─── DAILY-PICK with per-guide ambient + particles ─── */}
      {screen === 'daily-pick' && (
        <div
          className="relative flex flex-col items-center py-4 px-3 w-full overflow-hidden min-h-full justify-start"
          style={{ '--guide-accent': guide.accent } as React.CSSProperties}
        >
          {/* per-guide ambient background pattern */}
          <div
            className="guide-ambient"
            style={{ background: guide.ambientPattern }}
            aria-hidden="true"
          />
          {/* per-guide floating particles */}
          <GuideParticles guide={guide} />

          <div
            className="font-pixel text-[11px] mb-4 text-center tracking-wider relative z-10"
            style={{ color: guide.accent }}
          >
            {'>> ВЫБЕРИ КАРТУ ДНЯ'}
          </div>

          <div className="w-full max-w-[240px] sm:max-w-[326px] lg:max-w-[380px] relative z-10">
            <Card
              card={{ id: 'daily', name: '', image_url: '', is_reversed: false }}
              position="КАРТА ДНЯ"
              flipped={false}
              onFlip={handleDailyCardTap}
              characterId={characterId}
            />
          </div>

          {dailyLoading && (
            <div className="relative z-10">
              <GuideLoading guide={guide} />
            </div>
          )}

          {/* per-guide greeting whisper at the bottom */}
          <div className="mt-5 relative z-10 text-center max-w-[280px]">
            <span
              className="font-mono-crt text-[14px] italic leading-snug"
              style={{ color: 'rgba(255,255,255,0.55)' }}
            >
              «{guide.greeting}»
            </span>
          </div>
        </div>
      )}

      {/* ─── DAILY-RESULT ─── */}
      {screen === 'daily-result' && dailyData && (
        <div
          className="relative flex flex-col items-center py-4 px-3 w-full overflow-hidden min-h-full"
          style={{ '--guide-accent': guide.accent } as React.CSSProperties}
        >
          <div
            className="guide-ambient"
            style={{ background: guide.ambientPattern }}
            aria-hidden="true"
          />
          <GuideParticles guide={guide} />

          <div className={`flex-1 flex flex-col items-center w-full ${dailyFlipped ? 'justify-start' : 'justify-center'}`}>
            <div className="w-full max-w-[240px] sm:max-w-[326px] lg:max-w-[380px] relative z-10">
              <Card
                card={dailyData.cards[0]}
                position="КАРТА ДНЯ"
                flipped={dailyFlipped}
                onFlip={handleDailyFlip}
                characterId={characterId}
              />
            </div>
            {!dailyFlipped && (
              <div className="font-pixel text-[11px] text-white/40 mt-3 blink relative z-10">
                НАЖМИ НА КАРТУ
              </div>
            )}
          </div>
          {dailyFlipped && (
            <div className="relative z-10 w-full">
              <ReadingResult interpretation={dailyData.interpretation} />
            </div>
          )}
        </div>
      )}

      {screen === 'spread' && spreadType === '1' && (
        <Spread1Card key={spreadKey}
          characterId={characterId}
          onError={showError}
          apiCall={(question) =>
            API.spread(1, question, characterId).then((res) => ({
              cards: res.cards.map((c) => ({
                ...c,
                image_url: `/cards/${c.id}.png`,
              })),
              interpretation: res.interpretation,
            }))
          }
        />
      )}

      {screen === 'spread' && spreadType === '3' && (
        <Spread3Cards key={spreadKey}
          characterId={characterId}
          onError={showError}
          apiCall={(question) =>
            API.spread(3, question, characterId).then((res) => ({
              cards: res.cards.map((c) => ({
                ...c,
                image_url: `/cards/${c.id}.png`,
              })),
              interpretation: res.interpretation,
            }))
          }
        />
      )}

      <CatalogModal
        isOpen={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        onSelect={handleCatalogSelect}
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
