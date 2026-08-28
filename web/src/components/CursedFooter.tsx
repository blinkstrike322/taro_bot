'use client';

const ABOVE = [
  '\u0300','\u0301','\u0302','\u0303','\u0304','\u0305','\u0306','\u0307',
  '\u0308','\u030A','\u030B','\u030C','\u030D','\u030E','\u030F','\u0310',
  '\u0311','\u0312','\u0313','\u0314','\u033D','\u033E','\u033F','\u0340',
  '\u0341','\u0342','\u0343','\u0344','\u0346','\u034A','\u034B','\u034C',
  '\u0350','\u0351','\u0352','\u0353','\u0354','\u0355','\u0356','\u0357',
  '\u035B','\u035C','\u035D','\u035E','\u035F','\u0360','\u0361','\u0362',
  '\u0363','\u0364','\u0365','\u0366','\u0367','\u0368','\u0369','\u036A',
  '\u036B','\u036C','\u036D','\u036E','\u036F',
];

const BELOW = [
  '\u0316','\u0317','\u0318','\u0319','\u031C','\u031D','\u031E','\u031F',
  '\u0320','\u0321','\u0322','\u0323','\u0324','\u0325','\u0326','\u0327',
  '\u0328','\u0329','\u032A','\u032B','\u032C','\u032D','\u032E','\u032F',
  '\u0330','\u0331','\u0332','\u0333','\u0339','\u033A','\u033B','\u033C',
];

const MIDDLE = ['\u0334','\u0335','\u0336','\u0337','\u0338'];

const BASE_CHARS = [
  '·','•','*','+','×','÷','†','‡','♰','♱','⚹','☠','○','◇','◎','°','~','^','･','ﾟ','ﾥ',
  'Ж','Ψ','Ω','Σ','Φ','ᛉ','ᚨ','ᛏ',
  '※','⁂','†','‡',
  '·','•','…','·','·',
  '═','║','╔','╗','╚','╝','╠','╣',
  '⋅','⋮','⋰','⋱',
];

const OVERLAY = ['\u0488','\u0489','\u20DD','\u20DE','\u20DF','\u20E0'];

function pseudoRand(seed: number): number {
  return Math.abs((Math.sin(seed * 12.9898 + 78.233) * 43758.5453) % 1);
}

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.floor(pseudoRand(seed) * arr.length)];
}

function zalgofy(base: string, seed: number, intensity: number): string {
  let r = base;
  for (let i = 0; i < intensity; i++) {
    r += pick(ABOVE, seed * 7 + i * 3);
    r += pick(BELOW, seed * 7 + i * 3 + 1);
    if (pseudoRand(seed * 7 + i * 3 + 2) > 0.55) {
      r += pick(MIDDLE, seed * 7 + i * 3 + 3);
    }
  }
  if (pseudoRand(seed * 13) > 0.7) {
    r += pick(OVERLAY, seed * 17);
  }
  return r;
}

interface BlockDef {
  text: string;
  delay: number;
}

function makeBlocks(count: number, charsPerBlock: number, offset: number): BlockDef[] {
  return Array.from({ length: count }, (_, b) => {
    let seg = '';
    for (let c = 0; c < charsPerBlock; c++) {
      const idx = offset + b * charsPerBlock + c;
      const base = BASE_CHARS[idx % BASE_CHARS.length];
      const intensity = 2 + (idx % 5);
      seg += zalgofy(base, idx, intensity);
    }
    const delay = pseudoRand(b * 11 + 5) * 2.5;
    return { text: seg, delay };
  });
}

const ROW_DATA = [
  { blocks: makeBlocks(14, 5, 0),    delay: 0.0, dur: 28, layer: 'front' },
  { blocks: makeBlocks(12, 5, 70),   delay: 1.6, dur: 34, layer: 'deep' },
  { blocks: makeBlocks(10, 5, 130),  delay: 3.2, dur: 38, layer: 'top' },
  { blocks: makeBlocks(16, 4, 180),  delay: 0.6, dur: 24, layer: 'mid' },
];

export default function CursedFooter() {
  return (
    <div className="cursed-area" aria-hidden="true">
      {ROW_DATA.map((row, ri) => (
        <div
          key={ri}
          className={`cursed-fire cursed-fire--${row.layer}`}
          style={{ '--cd': `${row.delay}s`, '--dur': `${row.dur}s` } as React.CSSProperties}
        >
          <div className="cursed-fire-inner">
            {row.blocks.map((block, bi) => (
              <span
                key={bi}
                className="cursed-block"
                style={{ '--bd': `${block.delay}s` } as React.CSSProperties}
              >
                {block.text}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
