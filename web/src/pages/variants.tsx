'use client';

// THROWAWAY mockups for design review — НЕ коммитить, НЕ в прод.
import { getGuide } from '@/lib/guides';
import SpreadBlock from '@/components/shell/SpreadBlock';

const CARDS = [
  { id: 'seven-of-wands', name: 'Семёрка Жезлов', reversed: false, pos: 'Твоя позиция и энергия', тракт: 'Ты в обороне: держишь высоту и ждёшь подвоха. Эта усталость гасит свет Звезды — ты не даёшь надежде места.' },
  { id: 'the-star', name: 'Звезда', reversed: true, pos: 'Динамика между вами', тракт: 'Перевёрнутая Звезда — вера на исходе. Динамика буксует не из-за внешних стен, а из-за внутреннего неверия.' },
  { id: 'death', name: 'Смерть', reversed: false, pos: 'Главный вектор развития', тракт: 'Вектор — завершение. Оборона и неверие держат тебя в коридоре, а Смерть открывает дверь в конце него.' },
];
const WHISPER = 'Три карты дышат в такт — это одна история, а не три.';
const SIGNAL = 'Ты стоишь на пороге: за спиной — незавершённый спор, а впереди — пауза, которую ты боишься. Семёрка Жезлов держит оборону там, где бой уже кончился, а Звезда тихо напоминает, что надежда — это тоже работа. Смерть в финале не забирает, а закрывает дверь, которую ты сам дёргаешь уже месяц.';
const THREAD = 'Механика расклада — переход: оборона перетекает в неверие, а неверие разрешается завершением. Карты не спорят, они ведут друг друга за руку.';
const ADVICE = 'Перестань оборонять пустую высоту. Закрой один старый вопрос на этой неделе.';
const QUESTION = 'что происходит в моих отношениях';

function useCss() {
  return `
  .vpage{font-family:'JetBrains Mono',monospace;color:#fff;max-width:560px;margin:0 auto;padding:12px;display:flex;flex-direction:column;gap:36px}
  .vlabel{font-size:11px;letter-spacing:.2em;color:rgba(255,255,255,.4);margin-bottom:8px}
  .va-frame{border:1px solid rgba(255,255,255,.25);background:#060509;padding:14px}
  .va-strip{display:flex;gap:8px;margin:10px 0 12px}
  .va-strip img{width:100%;aspect-ratio:2/3;object-fit:cover;filter:grayscale(1) contrast(1.5);display:block}
  .va-status{font-size:10.5px;color:rgba(255,255,255,.45);letter-spacing:.06em;margin-bottom:10px}
  .va-name{font-size:12px;font-weight:800;letter-spacing:.08em;margin-top:6px}
  .va-rev{font-size:10.5px;font-weight:700}
  .va-whisper{font-size:12px;font-style:italic;color:rgba(236,233,246,.6);line-height:1.7;margin:12px 0}
  .va-signal{font-size:15px;font-weight:500;line-height:1.75;border-left:3px solid;padding-left:12px;margin:10px 0 14px}
  .va-sec{font-size:10.5px;letter-spacing:.16em;color:rgba(255,255,255,.35);margin:16px 0 5px}
  .va-body{font-size:13px;line-height:1.7;color:rgba(255,255,255,.82)}
  .va-advice{margin-top:16px;padding:10px 12px;font-size:14px;font-weight:800;line-height:1.6}
  .vb-line{margin:0 0 14px;font-size:13px;line-height:1.7}
  .vb-prompt{font-weight:800}
  .vb-whisper{color:rgba(236,233,246,.6);font-style:italic}
  .vb-signal{color:#fff;font-size:13.5px}
  .vb-rule{color:rgba(255,255,255,.18);margin:4px 0 14px;white-space:nowrap;overflow:hidden}
  .vb-cardline{color:rgba(255,255,255,.75)}
  .vc-step{border:1px solid rgba(255,255,255,.22);margin-bottom:10px;background:#060509}
  .vc-step--hero{border-width:2px}
  .vc-head{display:flex;align-items:baseline;gap:8px;padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.12);font-size:10.5px;letter-spacing:.14em;color:rgba(255,255,255,.5)}
  .vc-num{font-size:15px;font-weight:800}
  .vc-body{padding:10px 12px;font-size:13px;line-height:1.7;color:rgba(255,255,255,.85)}
  .vc-hero-body{font-size:14px;color:#fff}
  .vd-mini{display:flex;gap:6px;margin-bottom:12px}
  .vd-mini img{width:100%;aspect-ratio:2/3;object-fit:cover;filter:grayscale(1) contrast(1.5);display:block}
  .vd-mini div{flex:1;min-width:0}
  .vd-cap{font-size:9.5px;text-align:center;margin-top:3px;color:rgba(255,255,255,.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .vd-signal{font-size:14.5px;line-height:1.75;color:#fff;margin:8px 0}
  .vd-advice{font-size:13.5px;font-weight:800;line-height:1.65;padding:9px 11px;margin:10px 0 14px}
  .vd-det{border-top:1px dashed rgba(255,255,255,.2);padding:9px 0;font-size:12.5px}
  .vd-det summary{cursor:pointer;font-size:13px;font-weight:800;letter-spacing:.1em;color:var(--ga,#fff);list-style:none}
  .vd-det summary::-webkit-details-marker{display:none}
  .vd-det summary:before{content:'[+] ';font-weight:800}
  .vd-det[open] summary:before{content:'[–] '}
  .vd-det .vd-hint{color:rgba(255,255,255,.35);font-weight:400;letter-spacing:.04em}
  .vd-det p{color:rgba(255,255,255,.8);line-height:1.7;margin:8px 0 2px}
  `;
}

function CardImg({ id, name, reversed }: { id: string; name: string; reversed: boolean }) {
  return <img src={`/cards/${id}.png`} alt={name} style={reversed ? { transform: `rotate(180deg)` } : undefined} />;
}

function VariantA({ gid }: { gid: string }) {
  const g = getGuide(gid);
  return (
    <div data-shot={`A-${gid}`}>
      <div className="vlabel">A · АРТЕФАКТ — карты как объект, текст как чтение</div>
      <div className="va-frame" style={{ boxShadow: `inset 0 0 40px ${g.accentDim}` }}>
        <div className="va-status">ARCANUM // три карты · {g.name} · «{QUESTION}»</div>
        <div className="va-strip">
          {CARDS.map((c) => (
            <div key={c.id} style={{ flex: 1, minWidth: 0 }}>
              <CardImg id={c.id} name={c.name} reversed={c.reversed} />
              <div className="va-name">{c.name}</div>
              <div className="va-rev" style={{ color: c.reversed ? g.accent : 'rgba(255,255,255,.35)' }}>
                {c.reversed ? '↳ перевёрнутая' : '· прямая'}
              </div>
            </div>
          ))}
        </div>
        <div className="va-whisper">{WHISPER}</div>
        <div className="va-signal" style={{ borderColor: g.accent }}>{SIGNAL}</div>
        <div className="va-sec" style={{ color: g.accent }}>// нить · связь карт</div>
        <div className="va-body">{THREAD}</div>
        <div className="va-advice" style={{ background: g.accentDim, color: '#fff' }}>{ADVICE}</div>
        <div className="va-status" style={{ margin: '12px 0 0' }}>[ signal complete ] · {g.tag} · ✓ exit 0</div>
      </div>
    </div>
  );
}

function VariantB({ gid }: { gid: string }) {
  const g = getGuide(gid);
  const P = (p: { children?: React.ReactNode }) => (
    <span className="vb-prompt" style={{ color: g.accent }}>{p.children}</span>
  );
  return (
    <div data-shot={`B-${gid}`}>
      <div className="vlabel">B · ДИАЛОГ — проводник говорит с тобой</div>
      <div>
        <div className="vb-line vb-cardline"><P>taro:~$</P> расклад «три карты» · {CARDS.map((c) => c.name + (c.reversed ? ' ↳' : '')).join(' · ')}</div>
        <div className="vb-rule">────────────────────────────────</div>
        <div className="vb-line"><P>{g.tag.toLowerCase()}:~$</P> <span className="vb-whisper">слушай. {WHISPER}</span></div>
        <div className="vb-line"><P>{g.tag.toLowerCase()}:~$</P> <span className="vb-signal">а теперь главное. {SIGNAL}</span></div>
        <div className="vb-line"><P>{g.tag.toLowerCase()}:~$</P> <span className="vb-cardline">и как они связаны: {THREAD}</span></div>
        <div className="vb-rule">────────────────────────────────</div>
        <div className="vb-line"><P>{g.tag.toLowerCase()}:~$</P> <span style={{ color: g.accent, fontWeight: 800 }}>последнее — {ADVICE}</span></div>
        <div className="vb-line" style={{ color: 'rgba(255,255,255,.35)', fontSize: 11 }}>✓ сеанс #{gid.slice(0, 4)} · exit 0</div>
      </div>
    </div>
  );
}

function VariantC({ gid }: { gid: string }) {
  const g = getGuide(gid);
  return (
    <div data-shot={`C-${gid}`}>
      <div className="vlabel">C · РИТУАЛ ПО ШАГАМ — 4 блока, чувство пути</div>
      <div className="vc-step">
        <div className="vc-head"><span className="vc-num" style={{ color: g.accent }}>01</span> ШЁПОТ · настройка</div>
        <div className="vc-body" style={{ fontStyle: 'italic', color: 'rgba(236,233,246,.65)' }}>{WHISPER}</div>
      </div>
      <div className="vc-step vc-step--hero" style={{ borderColor: g.accent }}>
        <div className="vc-head"><span className="vc-num" style={{ color: g.accent }}>02</span> СИГНАЛ · суть</div>
        <div className="vc-body vc-hero-body">{SIGNAL}</div>
      </div>
      <div className="vc-step">
        <div className="vc-head"><span className="vc-num" style={{ color: g.accent }}>03</span> НИТЬ · три карты</div>
        <div className="vc-body">
          {CARDS.map((c, i) => (
            <div key={c.id} style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 800 }}>{String(i + 1).padStart(2, '0')} · {c.name} <span style={{ color: c.reversed ? g.accent : 'rgba(255,255,255,.4)', fontWeight: 400, fontSize: 12 }}>{c.reversed ? '↳ перевёрнутая' : '· прямая'}</span></div>
              <div style={{ color: 'rgba(255,255,255,.6)', fontSize: 12 }}>{c.pos}</div>
              <div style={{ marginTop: 3 }}>{c.тракт}</div>
            </div>
          ))}
          <div style={{ marginTop: 6, color: g.accent, fontSize: 11, letterSpacing: '.1em' }}>СВЯЗЬ</div>
          <div>{THREAD}</div>
        </div>
      </div>
      <div className="vc-step" style={{ borderColor: g.accent }}>
        <div className="vc-head"><span className="vc-num" style={{ color: g.accent }}>04</span> ДЕЙСТВИЕ · совет</div>
        <div className="vc-body" style={{ fontWeight: 800 }}>{ADVICE}</div>
      </div>
    </div>
  );
}

function VariantD({ gid }: { gid: string }) {
  const g = getGuide(gid);
  return (
    <div data-shot={`D-${gid}`}>
      <div className="vlabel">D · СНАЧАЛА СУТЬ — детали по тапу</div>
      <div className="vd-mini">
        {CARDS.map((c) => (
          <div key={c.id}>
            <CardImg id={c.id} name={c.name} reversed={c.reversed} />
            <div className="vd-cap">{c.name}{c.reversed ? ' ↳' : ''}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10.5, letterSpacing: '.14em', color: g.accent }}>─ SIGNAL ─</div>
      <div className="vd-signal">{SIGNAL}</div>
      <div className="vd-advice" style={{ borderLeft: `3px solid ${g.accent}` }}>{ADVICE}</div>
      <details className="vd-det" style={{ ['--ga' as never]: g.accent }}>
        <summary>позиции · 03 <span className="vd-hint">— раскрой</span></summary>
        {CARDS.map((c, i) => (
          <p key={c.id}><b>{String(i + 1).padStart(2, '0')} · {c.pos}</b> — {c.тракт}</p>
        ))}
      </details>
      <details className="vd-det" style={{ ['--ga' as never]: g.accent }}>
        <summary>нить · связь карт <span className="vd-hint">— раскрой</span></summary>
        <p>{THREAD}</p>
      </details>
      <details className="vd-det" style={{ ['--ga' as never]: g.accent }}>
        <summary>шёпот <span className="vd-hint">— раскрой</span></summary>
        <p style={{ fontStyle: 'italic' }}>{WHISPER}</p>
      </details>
    </div>
  );
}

function VariantAD({ gid }: { gid: string }) {
  const g = getGuide(gid);
  return (
    <div data-shot={`AD-${gid}`}>
      <div className="vlabel">AD · ГИБРИД — артефакт + суть + детали по тапу</div>
      <div className="va-frame" style={{ boxShadow: `inset 0 0 40px ${g.accentDim}` }}>
        <div className="va-status">ARCANUM // три карты · {g.name} · «{QUESTION}»</div>
        <div className="va-strip">
          {CARDS.map((c) => (
            <div key={c.id} style={{ flex: 1, minWidth: 0 }}>
              <CardImg id={c.id} name={c.name} reversed={c.reversed} />
              <div className="va-name">{c.name}</div>
              <div className="va-rev" style={{ color: c.reversed ? g.accent : 'rgba(255,255,255,.35)' }}>
                {c.reversed ? '↳ перевёрнутая' : '· прямая'}
              </div>
            </div>
          ))}
        </div>
        <div className="va-whisper">{WHISPER}</div>
        <div className="va-signal" style={{ borderColor: g.accent }}>{SIGNAL}</div>
        <div className="va-advice" style={{ background: g.accentDim, color: '#fff' }}>{ADVICE}</div>
        <details className="vd-det" style={{ marginTop: 14, ['--ga' as never]: g.accent }}>
          <summary>позиции · 03 <span className="vd-hint">— раскрой</span></summary>
          {CARDS.map((c, i) => (
            <p key={c.id}><b>{String(i + 1).padStart(2, '0')} · {c.pos}</b> — {c.тракт}</p>
          ))}
        </details>
        <details className="vd-det" style={{ ['--ga' as never]: g.accent }}>
          <summary>нить · связь карт <span className="vd-hint">— раскрой</span></summary>
          <p>{THREAD}</p>
        </details>
        <div className="va-status" style={{ margin: '12px 0 0' }}>[ signal complete ] · {g.tag} · ✓ exit 0</div>
      </div>
    </div>
  );
}

function VariantEcho({ gid }: { gid: string }) {
  const g = getGuide(gid);
  const cards = CARDS.map((c) => ({ id: c.id, name: c.name, image_url: `/cards/${c.id}.png`, is_reversed: c.reversed }));
  return (
    <div data-shot={`ECHO-${gid}`}>
      <div className="vlabel">ECHO · стык: вскрытая раздача → эхо-полоска в чтении (один визуальный язык)</div>
      <div style={{ ['--guide-accent' as never]: g.accent, ['--guide-accent-dim' as never]: g.accentDim }}>
        <SpreadBlock cards={cards} flipped={[true, true, true]} count={3} positions={CARDS.map((c) => c.pos)} characterId={gid} onFlip={() => {}} />
      </div>
      <div className="va-frame" style={{ marginTop: 10 }}>
        <div className="va-status">// эхо раздачи · тот же порядок · те же метки</div>
        <div className="va-strip" style={{ opacity: 0.92 }}>
          {CARDS.map((c, i) => (
            <div key={c.id} style={{ flex: 1, minWidth: 0 }}>
              <CardImg id={c.id} name={c.name} reversed={c.reversed} />
              <div className="va-name" style={{ fontSize: 11 }}>{String(i + 1).padStart(2, '0')} · {c.name}</div>
              <div className="va-rev" style={{ color: c.reversed ? g.accent : 'rgba(255,255,255,.35)' }}>
                {c.reversed ? '↳ перевёрнутая' : '· прямая'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Variants() {
  const css = useCss();
  return (
    <>
      <style>{`html,body{height:auto!important;overflow:visible!important;background:#000}` + css}</style>
      <div className="vpage" style={{ background: '#000', minHeight: '100vh' }}>
        <VariantA gid="shadow_walker" />
        <VariantB gid="shadow_walker" />
        <VariantC gid="spark_of_chaos" />
        <VariantD gid="ruin_keeper" />
        <VariantA gid="spark_of_chaos" />
        <VariantD gid="shadow_walker" />
        <VariantAD gid="shadow_walker" />
        <VariantAD gid="ruin_keeper" />
        <VariantEcho gid="shadow_walker" />
      </div>
    </>
  );
}
