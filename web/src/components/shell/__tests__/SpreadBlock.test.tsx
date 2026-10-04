// SpreadBlock smoke — все 8 раскладов каталога (мок-данные):
//   геометрия (layout-класс, слоты пентаграммы, дуга подковы),
//   строгий порядок флипа по flipOrder, клик мимо очереди → shake + игнор,
//   подсказка «вскрой: <следующая позиция>» и ready-вариант.
// Sound is mocked so no AudioContext is ever constructed in jsdom.

import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SpreadBlock from '@/components/shell/SpreadBlock';
import type { TarotCard } from '@/components/Card';
import { SPREADS } from '@/lib/spreads';

vi.mock('@/lib/sound', () => ({
  sFlip: vi.fn(),
  sReveal: vi.fn(),
}));

function mkCards(n: number): TarotCard[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    name: `аркан ${i}`,
    image_url: `/cards/c${i}.png`,
    is_reversed: false,
  }));
}

const all = (n: number, v: boolean) => Array.from({ length: n }, () => v);

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('SpreadBlock / smoke всех 8 раскладов каталога', () => {
  // каталог — источник правды: cards[i] ↔ positions[i] ↔ positionKeys[i],
  // flipOrder — ключи в порядке вскрытия.
  const cases = Object.values(SPREADS);

  it.each(cases.map((s) => [s.id, s] as const))(
    '%s: рендерит геометрию каталога без ошибок',
    (_id, spread) => {
      const onFlip = vi.fn();
      const { container } = render(
        <SpreadBlock
          cards={mkCards(spread.count)}
          flipped={all(spread.count, false)}
          count={spread.count}
          layout={spread.layout}
          positions={spread.positions.map((p) => p.name)}
          positionKeys={spread.positions.map((p) => p.key)}
          flipOrder={spread.flipOrder}
          singleLabel={spread.id === 'daily' ? 'карта дня' : undefined}
          onFlip={onFlip}
        />,
      );
      if (spread.layout === 'column1') {
        expect(container.querySelector('.spread-wrap--single')).not.toBeNull();
      } else {
        expect(container.querySelector(`.spread-${spread.layout}`)).not.toBeNull();
      }
      expect(container.querySelectorAll('.flip')).toHaveLength(spread.count);
      expect(onFlip).not.toHaveBeenCalled();
    },
  );

  it('column1 (daily): метка «карта дня», подсказка «вскрой: карта дня»', () => {
    const onFlip = vi.fn();
    const { container, rerender } = render(
      <SpreadBlock
        cards={mkCards(1)}
        flipped={[false]}
        count={1}
        layout="column1"
        singleLabel="карта дня"
        onFlip={onFlip}
      />,
    );
    expect(container.querySelector('.spread-wrap--single')).not.toBeNull();
    expect(container.textContent).toContain('карта дня');
    expect(container.textContent).toContain('вскрой: карта дня');
    // флип по очереди работает
    fireEvent.click(container.querySelector('.flip')!);
    expect(onFlip).toHaveBeenCalledWith(0);
    // после флипа подсказка исчезает
    rerender(
      <SpreadBlock
        cards={mkCards(1)}
        flipped={[true]}
        count={1}
        layout="column1"
        singleLabel="карта дня"
        onFlip={onFlip}
      />,
    );
    expect(container.textContent).not.toContain('вскрой');
  });

  it('trio (yesno): метки под картами, флип p1→p2→p3, подсказка ведёт по очереди', () => {
    const spread = SPREADS.yesno;
    const onFlip = vi.fn();
    const props = {
      cards: mkCards(3),
      count: spread.count,
      layout: spread.layout,
      positions: spread.positions.map((p) => p.name),
      positionKeys: spread.positions.map((p) => p.key),
      flipOrder: spread.flipOrder,
      onFlip,
    };
    const { container, rerender } = render(
      <SpreadBlock {...props} flipped={[false, false, false]} />,
    );
    expect(container.querySelector('.spread-trio')).not.toBeNull();
    // метки позиций под картами
    expect(container.textContent).toContain('за');
    expect(container.textContent).toContain('против');
    expect(container.textContent).toContain('совет');
    // подсказка — имя следующей позиции
    expect(container.textContent).toContain('вскрой: за');
    // флип по очереди
    fireEvent.click(container.querySelectorAll('.flip')[0]);
    expect(onFlip).toHaveBeenCalledWith(0);
    rerender(<SpreadBlock {...props} flipped={[true, false, false]} />);
    expect(container.textContent).toContain('вскрой: против');
    fireEvent.click(container.querySelectorAll('.flip')[1]);
    expect(onFlip).toHaveBeenCalledWith(1);
    rerender(<SpreadBlock {...props} flipped={[true, true, false]} />);
    expect(container.textContent).toContain('вскрой: совет');
    // третья карта: имя скрыто до флипа, метка на месте
    const cells = container.querySelectorAll('.spread-trio > .spread-cell');
    expect(cells).toHaveLength(3);
  });

  it('trio: клик мимо очереди — onFlip не зовётся, однократный shake', () => {
    const spread = SPREADS.yesno;
    const onFlip = vi.fn();
    const { container } = render(
      <SpreadBlock
        cards={mkCards(3)}
        flipped={[false, false, false]}
        count={spread.count}
        layout={spread.layout}
        positions={spread.positions.map((p) => p.name)}
        positionKeys={spread.positions.map((p) => p.key)}
        flipOrder={spread.flipOrder}
        onFlip={onFlip}
      />,
    );
    const buttons = container.querySelectorAll('.flip');
    fireEvent.click(buttons[2]);
    expect(onFlip).not.toHaveBeenCalled();
    const cell = container.querySelectorAll('.spread-trio > .spread-cell')[2];
    expect(cell.className).toContain('spread-shake');
    // верная карта шейка не имеет
    expect(
      container.querySelectorAll('.spread-trio > .spread-cell')[0].className,
    ).not.toContain('spread-shake');
  });

  it('pyramid (three): верх — позиция 2, без OFFSETS-сдвигов, флип слева направо без flipOrder', () => {
    const positions = ['исток ситуации', 'узор между вами', 'куда движется'];
    const onFlip = vi.fn();
    const { container } = render(
      <SpreadBlock
        cards={mkCards(3)}
        flipped={[false, false, false]}
        count={3}
        layout="pyramid"
        positions={positions}
        onFlip={onFlip}
      />,
    );
    expect(container.querySelector('.spread-pyramid')).not.toBeNull();
    // регрессия OFFSETS: ни одной translate-трансформации в инлайн-стилях
    const withTransform = Array.from(container.querySelectorAll<HTMLElement>('[style]'))
      .filter((el) => (el.getAttribute('style') || '').includes('translate'));
    expect(withTransform).toHaveLength(0);
    // DOM-порядок: вершина (карта 1) первая, затем нижний ряд [0], [2].
    // флип без flipOrder — слева направо: вершина не вскроется первой
    const buttons = container.querySelectorAll('.flip');
    fireEvent.click(buttons[0]);
    expect(onFlip).not.toHaveBeenCalled();
    expect(container.querySelector('.spread-shake')).not.toBeNull();
    fireEvent.click(buttons[1]);
    expect(onFlip).toHaveBeenCalledWith(0);
    // динамические позиции от бэкенда на местах
    expect(container.textContent).toContain('исток ситуации');
    expect(container.textContent).toContain('узор между вами');
    expect(container.textContent).toContain('куда движется');
  });

  it('spine (shadow): 6 ячеек в сетке, флип p1→p6', () => {
    const spread = SPREADS.shadow;
    const onFlip = vi.fn();
    const { container } = render(
      <SpreadBlock
        cards={mkCards(6)}
        flipped={all(6, false)}
        count={spread.count}
        layout={spread.layout}
        positions={spread.positions.map((p) => p.name)}
        positionKeys={spread.positions.map((p) => p.key)}
        flipOrder={spread.flipOrder}
        onFlip={onFlip}
      />,
    );
    expect(container.querySelector('.spread-spine')).not.toBeNull();
    expect(container.querySelectorAll('.spread-spine > .spread-cell')).toHaveLength(6);
    expect(container.textContent).toContain('что я скрываю');
    // p6 последняя: клик по 5-й карте — мимо очереди
    fireEvent.click(container.querySelectorAll('.flip')[5]);
    expect(onFlip).not.toHaveBeenCalled();
    fireEvent.click(container.querySelectorAll('.flip')[0]);
    expect(onFlip).toHaveBeenCalledWith(0);
  });

  it('pentagram (backend-ключи): слоты по positionKeys, центр вскрывается последним', () => {
    const spread = SPREADS.pentagram;
    const positions = spread.positions.map((p) => p.name);
    const positionKeys = spread.positions.map((p) => p.key); // card-order, как отдаёт бэкенд
    const onFlip = vi.fn();
    const props = {
      cards: mkCards(6),
      count: spread.count,
      layout: spread.layout,
      positions,
      positionKeys,
      flipOrder: spread.flipOrder,
      onFlip,
    };
    const { container } = render(<SpreadBlock {...props} flipped={all(6, false)} />);
    expect(container.querySelector('.spread-pentagram')).not.toBeNull();
    // слоты по ключам: card0 = center, card4 = earth, card5 = air
    const cells = container.querySelectorAll('.spread-pentagram > .spread-cell');
    expect(cells).toHaveLength(6);
    expect(cells[0].className).toContain('spread-cell--center');
    expect(cells[1].className).toContain('spread-cell--spirit');
    expect(cells[2].className).toContain('spread-cell--fire');
    expect(cells[3].className).toContain('spread-cell--water');
    expect(cells[4].className).toContain('spread-cell--earth');
    expect(cells[5].className).toContain('spread-cell--air');
    // порядок вскрытия: earth(4) → air(5) → water(3) → fire(2) → spirit(1) → center(0)
    const expected = [4, 5, 3, 2, 1, 0];
    let flippedState = all(6, false);
    for (const idx of expected) {
      const current = render(<SpreadBlock {...props} flipped={flippedState} />);
      fireEvent.click(current.container.querySelectorAll('.flip')[idx]);
      expect(onFlip).toHaveBeenLastCalledWith(idx);
      flippedState = flippedState.map((v, i) => (i === idx ? true : v));
      current.unmount();
    }
    // подсказка ведёт по очереди вскрытия
    const mid = render(<SpreadBlock {...props} flipped={[false, false, false, false, false, true]} />);
    expect(mid.container.textContent).toContain('вскрой: земля');
    mid.unmount();
    const last = render(<SpreadBlock {...props} flipped={[false, true, true, true, true, true]} />);
    expect(last.container.textContent).toContain('вскрой: сигнификатор');
    last.unmount();
  });

  it('pentagram (mock-ключи): positionKeys = flipOrder — центр (последняя карта) вскрывается последним', () => {
    // mockApi отдаёт position_keys = flip_order каталога: карты розданы в
    // порядке вскрытия, card5 = center. Геометрия — по ключам, флип — по ним же.
    const spread = SPREADS.pentagram;
    const positionKeys = spread.flipOrder;
    const onFlip = vi.fn();
    const { container } = render(
      <SpreadBlock
        cards={mkCards(6)}
        flipped={all(6, false)}
        count={spread.count}
        layout={spread.layout}
        positions={spread.positions.map((p) => p.name)}
        positionKeys={positionKeys}
        flipOrder={spread.flipOrder}
        onFlip={onFlip}
      />,
    );
    const cells = container.querySelectorAll('.spread-pentagram > .spread-cell');
    // card0 keyed earth → слот earth; card5 keyed center → слот center
    expect(cells[0].className).toContain('spread-cell--earth');
    expect(cells[5].className).toContain('spread-cell--center');
    const buttons = container.querySelectorAll('.flip');
    // center (card5) нельзя вскрыть первой
    fireEvent.click(buttons[5]);
    expect(onFlip).not.toHaveBeenCalled();
    // первая в очереди — earth (card0)
    fireEvent.click(buttons[0]);
    expect(onFlip).toHaveBeenCalledWith(0);
  });

  it('arc (horseshoe): 7 карт, вертикальная дуга ARC_DY, флип p1→p7', () => {
    const spread = SPREADS.horseshoe;
    const onFlip = vi.fn();
    const { container } = render(
      <SpreadBlock
        cards={mkCards(7)}
        flipped={all(7, false)}
        count={spread.count}
        layout={spread.layout}
        positions={spread.positions.map((p) => p.name)}
        positionKeys={spread.positions.map((p) => p.key)}
        flipOrder={spread.flipOrder}
        onFlip={onFlip}
      />,
    );
    expect(container.querySelector('.spread-arc')).not.toBeNull();
    const cells = container.querySelectorAll('.spread-arc > .spread-cell');
    expect(cells).toHaveLength(7);
    // дуга: края ниже (+14), центр выше (−6)
    expect((cells[0] as HTMLElement).style.marginTop).toBe('14px');
    expect((cells[3] as HTMLElement).style.marginTop).toBe('-6px');
    expect((cells[6] as HTMLElement).style.marginTop).toBe('14px');
    expect(container.textContent).toContain('вскрой: ситуация');
    const buttons = container.querySelectorAll('.flip');
    fireEvent.click(buttons[1]);
    expect(onFlip).not.toHaveBeenCalled();
    fireEvent.click(buttons[0]);
    expect(onFlip).toHaveBeenCalledWith(0);
  });

  it('whisperReady: ready-вариант подсказки светится и упоминает шёпот', () => {
    const spread = SPREADS.yesno;
    const { container } = render(
      <SpreadBlock
        cards={mkCards(3)}
        flipped={[false, false, false]}
        count={spread.count}
        layout={spread.layout}
        positions={spread.positions.map((p) => p.name)}
        positionKeys={spread.positions.map((p) => p.key)}
        flipOrder={spread.flipOrder}
        whisperReady
        onFlip={vi.fn()}
      />,
    );
    expect(container.querySelector('.spread-hint--ready')).not.toBeNull();
    expect(container.textContent).toContain('шёпот уже здесь');
    expect(container.textContent).toContain('вскрой: за');
  });

  it('легаси без layout/positions: 3 карты → пирамида с нейтральными фолбэками', () => {
    const onFlip = vi.fn();
    const { container } = render(
      <SpreadBlock
        cards={mkCards(3)}
        flipped={[false, false, false]}
        count={3}
        onFlip={onFlip}
      />,
    );
    expect(container.querySelector('.spread-wrap')).not.toBeNull();
    expect(container.textContent).toContain('нить первая');
    expect(container.textContent).toContain('узор дня');
    expect(container.textContent).toContain('вектор');
    // фолбэк-очередь — слева направо (DOM: вершина=карта1, затем [0], [2])
    fireEvent.click(container.querySelectorAll('.flip')[1]);
    expect(onFlip).toHaveBeenCalledWith(0);
  });
});
