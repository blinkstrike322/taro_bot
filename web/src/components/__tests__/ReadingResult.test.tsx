// ReadingResult semantic rendering — locks the presentation contract: the LLM's
// structured `Interpretation` renders as terminal language, NEVER as raw JSON.
// Three interpretation schemas are covered: daily (проявление/траектория),
// single/legacy (card_meaning), three-card (позиции инлайном + нить).
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
  expect(text).not.toContain('"шепот":');
  expect(text).not.toContain('"ответ"');
}

const cards = [makeCard('moon', 'Луна'), makeCard('star', 'Звезда')];

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('ReadingResult / daily schema (проявление · на_что_смотреть · траектория)', () => {
  const daily: Interpretation = {
    intro: 'Шепот начинает звучать.',
    short_answer: 'Сигнал дня: двигайся.',
    проявление: 'День требует внимания к деталям.',
    на_что_смотреть: 'Смотри на повторяющиеся числа.',
    траектория: {
      утро: 'Утро задает ритм.',
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
    // v2 header: serif title from spreadLabel, not the old transmission kind.
    expect(container.textContent).toContain('✦ КАРТА ДНЯ ✦');
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

  it('renders the ritual closing footer (journal variant)', () => {
    const { container } = render(
      <ReadingResult interpretation={daily} cards={cards} instant={true} spreadLabel="карта дня" />,
    );
    expect(container.textContent).toContain('— из журнала сеансов —');
    expect(container.textContent).toContain('SHADOW.WLK');
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
    expect(container.textContent).toContain('✦ ОДНА КАРТА ✦');
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
    expect(container.textContent).toContain('// совет');
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
    { позиция: 'будущее', карта: 'Третий', реверс: false, трактовка: 'Будущее зовет.' },
  ];
  const three: Interpretation = {
    intro: 'Три карты расстелены.',
    short_answer: 'Связь ясна.',
    позиции: positions,
    связь_карт: 'Карты связаны выбором.',
  };

  it('renders inline position sections and the connection thread', () => {
    const { container } = render(
      <ReadingResult interpretation={three} instant={true} spreadLabel="три карты" />,
    );
    expect(screen.getByText(/01\ ·\ прошлое/)).toBeInTheDocument();
    expect(screen.getByText(/02\ ·\ настоящее/)).toBeInTheDocument();
    expect(screen.getByText(/03\ ·\ будущее/)).toBeInTheDocument();
    // связь_карт is a visible «нить» section before advice, not a disclosure.
    expect(container.textContent).toContain('// нить');
    expect(screen.getByText('Прошлое держит ключ.')).toBeInTheDocument();
    expect(screen.getByText('Карты связаны выбором.')).toBeInTheDocument();
    expect(container.textContent).toContain('✦ ТРИ КАРТЫ ✦');
    expectNoJsonLiterals(container.textContent ?? '');
  });

  it('marks reversed cards in the card line and inline positions', () => {
    const { container } = render(
      <ReadingResult interpretation={three} instant={true} spreadLabel="три карты" />,
    );
    // Card names appear in the header artifacts AND inline position blocks.
    for (const name of ['Первый', 'Второй', 'Третий']) {
      expect(screen.getAllByText(name).length).toBeGreaterThanOrEqual(1);
    }
    // Header shows the ↳ marker once; inline position shows plain orientation.
    expect(screen.getAllByText('↳ перевернутая').length).toBe(1);
    expect(container.textContent).toContain('· прямая');
    expect(container.textContent).toContain('перевернутая');
  });

  it('skips the нить section gracefully when связь_карт is absent', () => {
    const noLink: Interpretation = { ...three, связь_карт: undefined };
    const { container } = render(
      <ReadingResult interpretation={noLink} instant={true} spreadLabel="три карты" />,
    );
    expect(container.textContent).not.toContain('// нить');
    expect(screen.getByText('Прошлое держит ключ.')).toBeInTheDocument();
  });

  it('renders off-schema positions without позиция label (legacy robustness)', () => {
    const bare: Interpretation = {
      intro: '',
      short_answer: 'Ответ есть.',
      позиции: [
        { карта: 'Первый', трактовка: 'Прошлое держит ключ.' },
        { карта: 'Второй', трактовка: 'Настоящее искрит.' },
      ],
    };
    const { container } = render(
      <ReadingResult interpretation={bare} instant={true} spreadLabel="три карты" />,
    );
    expect(container.textContent).toContain('01');
    expect(container.textContent).toContain('02');
    expect(screen.getByText('Прошлое держит ключ.')).toBeInTheDocument();
    expectNoJsonLiterals(container.textContent ?? '');
  });
});
