// ReadingResult semantic rendering — locks the presentation contract: the LLM's
// structured `Interpretation` renders as terminal language, NEVER as raw JSON.
// Three interpretation schemas are covered: daily (проявление/траектория),
// single/legacy (card_meaning), three-card (позиции + связь_карт).
//
// `instant` is passed so no typing timers run — the tests assert finished state.

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ReadingResult from '@/components/ReadingResult';
import type { Interpretation, ReadingPosition } from '@/lib/api';
import type { TarotCard } from '@/components/Card';

// Sound module is a side-effectful audio synth; mock it so jsdom never
// constructs an AudioContext. (ProseType/ReadingResult call sType/sFlip etc.)
vi.mock('@/lib/sound', () => ({
  sFlip: vi.fn(),
  sReveal: vi.fn(),
  sType: vi.fn(),
  sKey: vi.fn(),
  sEnter: vi.fn(),
  sError: vi.fn(),
  sWhisper: vi.fn(),
  sBoot: vi.fn(),
}));

function makeCard(id: string, name: string, is_reversed = false): TarotCard {
  return { id, name, image_url: `/cards/${id}.png`, is_reversed };
}

// The suite must FAIL if ReadingResult regresses to dumping JSON tokens.
function expectNoJsonLiterals(text: string): void {
  expect(text).not.toContain('"');
  expect(text).not.toContain('{');
  expect(text).not.toContain('}');
  // Explicit contract keys that a JSON dump would emit:
  expect(text).not.toContain('"сеанс"');
  expect(text).not.toContain('"шёпот":');
  expect(text).not.toContain('"ответ"');
}

const cards = [makeCard('moon', 'Луна'), makeCard('star', 'Звезда')];

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('ReadingResult / daily schema (проявление · на_что_смотреть · траектория)', () => {
  const daily: Interpretation = {
    intro: 'Шёпот начинает звучать.',
    short_answer: 'Сигнал дня: двигайся.',
    проявление: 'День требует внимания к деталям.',
    на_что_смотреть: 'Смотри на повторяющиеся числа.',
    траектория: {
      утро: 'Утро задаёт ритм.',
      день: 'День подтверждает выбор.',
      вечер: 'Вечер подводит итог.',
    },
    advice: 'Не торопись.',
  };

  it('renders body section labels from проявление/траектория', () => {
    const { container } = render(
      <ReadingResult interpretation={daily} cards={cards} instant={true} spreadLabel="карта дня" />,
    );
    expect(screen.getByText(/проявление/)).toBeInTheDocument();
    expect(screen.getByText(/на\ что\ смотреть/)).toBeInTheDocument();
    expect(screen.getByText(/траектория\ ·\ утро/)).toBeInTheDocument();
    expect(screen.getByText(/траектория\ ·\ день/)).toBeInTheDocument();
    expect(screen.getByText(/траектория\ ·\ вечер/)).toBeInTheDocument();
    // Daily transmission header.
    expect(container.textContent).toContain('DAILY TRANSMISSION');
    // Per-отдел prose is rendered.
    expect(screen.getByText('День требует внимания к деталям.')).toBeInTheDocument();
    // No stray JSON in a fully-rendered daily reading.
    expectNoJsonLiterals(container.textContent ?? '');
  });

  it('renders per-card labels and orientation text', () => {
    const { container } = render(
      <ReadingResult interpretation={daily} cards={cards} instant={true} spreadLabel="карта дня" />,
    );
    expect(screen.getByText('Луна')).toBeInTheDocument();
    expect(screen.getByText('Звезда')).toBeInTheDocument();
    expect(container.textContent).toContain('· прямая'); // none reversed here
    expect(screen.getByText('Странница Теней')).toBeInTheDocument(); // guide meta
  });
});

describe('ReadingResult / single-legacy schema (card_meaning)', () => {
  const single: Interpretation = {
    intro: 'Одна карта отвечает.',
    short_answer: 'Ответ: действуй.',
    card_meaning: 'Карта говорит о внутреннем голосе.',
    advice: 'Прислушайся к себе.',
  };

  it('renders a single value section with no JSON keys', () => {
    const { container } = render(
      <ReadingResult interpretation={single} cards={[makeCard('luna', 'Луна')]} instant={true} spreadLabel="одна карта" />,
    );
    expect(screen.getByText(/значение/)).toBeInTheDocument();
    expect(screen.getByText('Карта говорит о внутреннем голосе.')).toBeInTheDocument();
    expect(container.textContent).toContain('SINGLE TRANSMISSION');
    // Legacy single-card reading must NEVER leak JSON keys.
    expect(container.textContent).not.toContain('"сеанс"');
    expect(container.textContent).not.toContain('"ответ"');
    expectNoJsonLiterals(container.textContent ?? '');
  });

  it('renders advice and signal sections', () => {
    const { container } = render(
      <ReadingResult interpretation={single} cards={[makeCard('luna', 'Луна')]} instant={true} spreadLabel="одна карта" />,
    );
    expect(screen.getByText('Прислушайся к себе.')).toBeInTheDocument();
    expect(container.textContent).toContain('[ advice ]');
    expect(container.textContent).toContain('─ signal ─');
  });

  it('supports card_meaning as an array (multiple meanings)', () => {
    const multi: Interpretation = {
      ...single,
      card_meaning: ['Первое значение.', 'Второе значение.'],
    };
    const { container } = render(
      <ReadingResult interpretation={multi} cards={[makeCard('luna', 'Луна')]} instant={true} spreadLabel="одна карта" />,
    );
    expect(screen.getByText(/значение\ ·\ 01/)).toBeInTheDocument();
    expect(screen.getByText(/значение\ ·\ 02/)).toBeInTheDocument();
    expect(container.textContent).toContain('Первое значение.');
    expect(container.textContent).toContain('Второе значение.');
  });
});

describe('ReadingResult / three-card schema (позиции + связь_карт)', () => {
  const positions: ReadingPosition[] = [
    { позиция: 'прошлое', карта: 'Первый', реверс: false, трактовка: 'Прошлое держит ключ.' },
    { позиция: 'настоящее', карта: 'Второй', реверс: true, трактовка: 'Настоящее искрит.' },
    { позиция: 'будущее', карта: 'Третий', реверс: false, трактовка: 'Будущее зовёт.' },
  ];
  const three: Interpretation = {
    intro: 'Три карты расстелены.',
    short_answer: 'Связь ясна.',
    позиции: positions,
    связь_карт: 'Карты связаны выбором.',
  };

  it('renders position-label sections and the connection thread', () => {
    const { container } = render(
      <ReadingResult interpretation={three} instant={true} spreadLabel="три карты" />,
    );
    expect(screen.getByText(/01\ ·\ прошлое/)).toBeInTheDocument();
    expect(screen.getByText(/02\ ·\ настоящее/)).toBeInTheDocument();
    expect(screen.getByText(/03\ ·\ будущее/)).toBeInTheDocument();
    expect(screen.getByText(/нить\ ·\ связь\ карт/)).toBeInTheDocument();
    expect(screen.getByText('Прошлое держит ключ.')).toBeInTheDocument();
    expect(screen.getByText('Карты связаны выбором.')).toBeInTheDocument();
    expect(container.textContent).toContain('THREE-CARD TRANSMISSION');
    expectNoJsonLiterals(container.textContent ?? '');
  });

  it('marks reversed cards in the card line', () => {
    const { container } = render(
      <ReadingResult interpretation={three} instant={true} spreadLabel="три карты" />,
    );
    // Card names come from Интерпретация.карта, not prop.cards.
    expect(screen.getByText('Первый')).toBeInTheDocument();
    expect(screen.getByText('Второй')).toBeInTheDocument();
    expect(screen.getByText('Третий')).toBeInTheDocument();
    // Only the reversed position shows the reversal marker.
    expect(screen.getAllByText('↳ перевёрнутая').length).toBe(1);
    expect(container.textContent).toContain('· прямая');
  });
});