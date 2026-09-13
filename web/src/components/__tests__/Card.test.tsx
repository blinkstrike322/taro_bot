// Card reveal contract — locks face-down/face-up rendering and the flip cue:
//   unflipped  → position label + card back, name hidden, click fires onFlip once
//   flipped    → name shown (+ reversed marker if reversed), click is a no-op
// Sound is mocked so no AudioContext is ever constructed in jsdom.

import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Card, { type TarotCard } from '@/components/Card';

vi.mock('@/lib/sound', () => ({
  sFlip: vi.fn(),
  sReveal: vi.fn(),
}));

function makeCard(id: string, name: string, is_reversed = false): TarotCard {
  return { id, name, image_url: `/cards/${id}.png`, is_reversed };
}

const base = makeCard('moon', 'Луна');
const reversed = makeCard('moon', 'Луна', true);

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Card / flip contract', () => {
  it('unflipped shows the position label and hides the card name', () => {
    const { container } = render(
      <Card card={base} position="прошлое" flipped={false} onFlip={vi.fn()} />,
    );
    // Position label rendered when a position is given and card not flipped.
    expect(container.textContent).toContain('прошлое');
    // Card name is NOT shown while face-down.
    expect(container.textContent).not.toContain('Луна');
    // Button not marked flipped yet.
    expect(container.querySelector('.flip')?.className).not.toContain('is-flipped');
  });

  it('unflipped without a position renders the generic flip label', () => {
    const { container } = render(
      <Card card={base} flipped={false} onFlip={vi.fn()} />,
    );
    // Position label absent (no position), but the flip button survives.
    expect(container.querySelector('.flip')).toBeInTheDocument();
  });

  it('click on an unflipped card calls onFlip exactly once', () => {
    const onFlip = vi.fn();
    render(<Card card={base} position="прошлое" flipped={false} onFlip={onFlip} />);
    const button = document.querySelector<HTMLButtonElement>('.flip');
    expect(button).not.toBeNull();
    fireEvent.click(button!);
    expect(onFlip).toHaveBeenCalledTimes(1);
  });

  it('click on an already-flipped card is a no-op', () => {
    const onFlip = vi.fn();
    render(<Card card={base} position="прошлое" flipped={true} onFlip={onFlip} />);
    const button = document.querySelector<HTMLButtonElement>('.flip');
    expect(button).not.toBeNull();
    fireEvent.click(button!);
    expect(onFlip).not.toHaveBeenCalled();
  });

  it('flipped card shows the name and the position label disappears', () => {
    const { container } = render(
      <Card card={base} position="прошлое" flipped={true} onFlip={vi.fn()} />,
    );
    expect(container.textContent).toContain('Луна');
    // Once flipped, the position label is no longer rendered.
    expect(container.textContent).not.toContain('прошлое');
    expect(container.querySelector('.flip')?.className).toContain('is-flipped');
  });

  it('flipped reversed card shows the reversal marker; upright does not', () => {
    const { container, unmount } = render(
      <Card card={reversed} position="прошлое" flipped={true} onFlip={vi.fn()} />,
    );
    expect(container.textContent).toContain('↳ перевёрнутая');
    unmount();

    const upright = render(
      <Card card={base} position="прошлое" flipped={true} onFlip={vi.fn()} />,
    );
    expect(upright.container.textContent).not.toContain('↳ перевёрнутая');
  });
});