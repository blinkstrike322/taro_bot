'use client';

import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/Layout';
import WelcomeAnimation from '@/components/WelcomeAnimation';
import Spread1Card from '@/components/Spread1Card';
import Spread3Cards from '@/components/Spread3Cards';
import CatalogModal from '@/components/CatalogModal';
import SettingsModal from '@/components/SettingsModal';
import CalendarModal from '@/components/CalendarModal';
import Card, { TarotCard } from '@/components/Card';
import ReadingResult from '@/components/ReadingResult';
import * as API from '@/lib/api';

type SpreadType = 'daily' | '1' | '3';
type Screen = 'welcome' | 'spread' | 'daily-pick' | 'daily-result';

interface ReadingData {
  cards: TarotCard[];
  interpretation: {
    intro: string;
    short_answer: string;
    card_meaning: string[];
    advice: string;
  };
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

  const [dailyData, setDailyData] = useState<ReadingData | null>(null);
  const [dailyFlipped, setDailyFlipped] = useState(false);
  const [dailyLoading, setDailyLoading] = useState(false);

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
    showToast('ПРОВОДНИК СМЕНЕН');
  }, [showToast]);

  const handleNewSpread = useCallback(() => {
    if (spreadType === 'daily') {
      setDailyData(null);
      setDailyFlipped(false);
      setScreen('daily-pick');
    } else {
      setScreen('spread');
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
    } catch {
      showToast('ОШИБКА. ПОПРОБУЙ СНОВА');
    } finally {
      setDailyLoading(false);
    }
  }, [characterId, showToast, dailyLoading]);

  const handleDailyFlip = useCallback(() => {
    setDailyFlipped(true);
  }, []);

  const arcanaCount = spreadType === '3' ? 3 : 1;

  return (
    <Layout
      spreadType={spreadType ?? '—'}
      arcanaCount={arcanaCount}
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
        />
      )}

      {screen === 'daily-pick' && (
        <div className="flex flex-col items-center py-4 px-3">
          <div className="font-pixel text-[11px] text-white/60 mb-4 text-center tracking-wider">
            {'>> ВЫБЕРИ КАРТУ ДНЯ'}
          </div>
          <div className="flex items-end justify-center gap-3 w-full max-w-md">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="w-32 sm:w-36 flex-shrink-0">
                <Card
                  card={{ id: 'daily', name: '', image_url: '', is_reversed: false }}
                  position=""
                  flipped={false}
                  onFlip={handleDailyCardTap}
                />
              </div>
            ))}
          </div>
          {dailyLoading && (
            <div className="font-pixel text-[11px] text-white/40 mt-3 text-center blink">
              ГАДАНИЕ...
            </div>
          )}
        </div>
      )}

      {screen === 'daily-result' && dailyData && (
        <div className="flex flex-col items-center py-4 px-3">
          <div className="w-48 sm:w-56">
            <Card
              card={dailyData.cards[0]}
              position="КАРТА ДНЯ"
              flipped={dailyFlipped}
              onFlip={handleDailyFlip}
            />
          </div>
          {!dailyFlipped && (
            <div className="font-pixel text-[11px] text-white/40 mt-3 blink">
              НАЖМИ НА КАРТУ
            </div>
          )}
          {dailyFlipped && (
            <ReadingResult interpretation={dailyData.interpretation} />
          )}
        </div>
      )}

      {screen === 'spread' && spreadType === '1' && (
        <Spread1Card
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
        <Spread3Cards
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
        tgId={API.getTgId()}
      />
    </Layout>
  );
}
