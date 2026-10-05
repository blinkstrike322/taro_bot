// ─────────────────────────────────────────────────────────────
// e2e_tour.mjs — Playwright-тур ARCANUM v2 (Task 16, финальная верификация)
//
// Прогоняет все 8 раскладов каталога: команда → флипы строго по
// flip_order (через подсказку «вскрыть: …») → чтение. Скриншоты фаз —
// в docs/assets/tour-v2/. Jank-проба (PerformanceObserver longtask)
// ставится на фазе печати чтения; цель — 0 long tasks > 50ms.
//
// Запуск:  cd web && node ../scripts/e2e_tour.mjs
// URL:     TOUR_URL=http://localhost:3100 (prod-smoke serve_webapp_mock.py)
// ─────────────────────────────────────────────────────────────
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const require = createRequire(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'package.json'),
);
const { chromium } = require('playwright');

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(REPO, 'docs', 'assets', 'tour-v2');
const URL = process.env.TOUR_URL || 'http://localhost:3100';
const VP = { width: 390, height: 844 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[tour]', ...a);

// каталог в порядке data/spreads.json; вопрос — inline для needsQuestion
const TOUR = [
  { id: 'daily',     cmd: 'taro daily',                          n: 1, flipNames: ['карта дня'] },
  { id: 'single',    cmd: 'taro ask1 стоит ли менять работу?',   n: 1, flipNames: ['суть ответа'] },
  { id: 'yesno',     cmd: 'taro yesno отпускать ли старое?',     n: 3, flipNames: ['за', 'против', 'совет'] },
  { id: 'three',     cmd: 'taro ask стоит ли менять работу?',    n: 3, flipNames: null }, // динамические позиции
  { id: 'mfd',       cmd: 'taro mfd что думает обо мне М.?',     n: 3, flipNames: ['мысли', 'чувства', 'действия'] },
  { id: 'shadow',    cmd: 'taro shadow выгорание',               n: 6, flipNames: ['что я скрываю', 'почему я это скрываю', 'что скрывание защищает', 'что оно стоит', 'путь интеграции', 'следующий шаг'] },
  // NB: 'taro pentagram' — сломанная команда (id не в алиасах commands.ts, product bug T16-R2);
  // тур идёт через рабочий алиас каталога
  { id: 'pentagram', cmd: 'taro пентаграмма кто я в этой ситуации?', n: 6, flipNames: ['земля', 'воздух', 'вода', 'огонь', 'дух', 'сигнификатор'] },
  { id: 'horseshoe', cmd: 'taro horseshoe переезд в другой город', n: 7, flipNames: ['ситуация', 'скрытое', 'препятствие', 'внешнее', 'твоя позиция', 'чужая позиция', 'исход'] },
];

let idx = 0;
async function shot(page, name) {
  const file = path.join(OUT, `${String(idx).padStart(2, '0')}_${name}.png`);
  await page.screenshot({ path: file });
  log(`📸 ${path.basename(file)}`);
  idx += 1;
}

async function typeCmd(page, text) {
  const input = page.locator('input, textarea').last();
  await input.click();
  await input.fill('');
  await input.type(text, { delay: 12 });
  await page.keyboard.press('Enter');
}

async function scrollToBottom(page) {
  await page.evaluate(() => {
    const sc = document.querySelector('.shell-scroll');
    if (sc) sc.scrollTop = sc.scrollHeight;
  });
}

async function installJankProbe(page) {
  await page.evaluate(() => {
    window.__longTasks = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__longTasks.push({ d: e.duration, t: e.startTime });
      }).observe({ entryTypes: ['longtask'] });
    } catch {}
  });
}

async function resetJank(page) {
  await page.evaluate(() => { window.__longTasks = []; });
}

async function readJank(page) {
  return page.evaluate(() => window.__longTasks || []);
}

// подсказка «вскрой: {nextName}» — очередь задаётся flip_order каталога
async function nextHintName(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.spread-hint');
    if (!el) return null;
    const m = /вскро(?:й|ть):\s*(.+)$/.exec(el.textContent || '');
    return m ? m[1].trim() : null;
  });
}

// последний расклад в транскрипте (карты копятся — считаем только новейший)
const LAST_SPREAD_FN = () => {
  const wraps = document.querySelectorAll('.spread-wrap');
  return wraps[wraps.length - 1] || null;
};

async function clickNextCard(page, spec) {
  const name = await nextHintName(page);
  // программный DOM-click: force-click по координатам на плотных макетах
  // (пентаграмма) попадает в перекрывающую соседнюю карту
  const ok = await page.evaluate((label) => {
    const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s);
    let btn = null;
    if (label) {
      btn = document.querySelector(`button.flip[aria-label="${esc(label)} — перевернуть карту"]`);
    }
    if (!btn) {
      const wraps = document.querySelectorAll('.spread-wrap');
      const w = wraps[wraps.length - 1];
      btn = w ? w.querySelector('button.flip:not(.is-flipped)') : null;
    }
    if (btn) { btn.click(); return true; }
    return false;
  }, name);
  if (!ok) throw new Error(`no clickable card for hint "${name}"`);
  return name;
}

async function flipAll(page, spec, baseName) {
  const flippedSeq = [];
  for (let k = 0; k < spec.n; k += 1) {
    const before = await page.evaluate(() => {
      const wraps = document.querySelectorAll('.spread-wrap');
      const w = wraps[wraps.length - 1];
      return w ? w.querySelectorAll('button.flip.is-flipped').length : 0;
    });
    const name = await clickNextCard(page, spec);
    flippedSeq.push(name);
    // ждём инкремент вскрытых (анимация флипа)
    for (let t = 0; t < 40; t += 1) {
      const now = await page.evaluate(() => {
        const wraps = document.querySelectorAll('.spread-wrap');
        const w = wraps[wraps.length - 1];
        return w ? w.querySelectorAll('button.flip.is-flipped').length : 0;
      });
      if (now > before) break;
      await sleep(150);
    }
    await sleep(350);
    const mid = k + 1 === Math.ceil(spec.n / 2);
    if (mid) await shot(page, `${spec.id}_flipmid`);
  }
  const allFlipped = await page.evaluate(() => {
    const wraps = document.querySelectorAll('.spread-wrap');
    const w = wraps[wraps.length - 1];
    if (!w) return false;
    return w.querySelectorAll('button.flip.is-flipped').length === w.querySelectorAll('button.flip').length;
  });
  return { flippedSeq, allFlipped };
}

async function waitForReading(page, baseline, timeoutMs = 60000) {
  const t0 = Date.now();
  for (;;) {
    const c = await page.locator('.reading-close-phrase').count();
    if (c > baseline) return Date.now() - t0;
    if (Date.now() - t0 > timeoutMs) return -1;
    await sleep(400);
  }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VP, deviceScaleFactor: 2 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));

fs.mkdirSync(OUT, { recursive: true });
await installJankProbe(page);

const t0 = Date.now();
const at = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;

log(`→ ${URL}`);
await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForSelector('input, textarea', { timeout: 30000 });
await sleep(600);
await shot(page, 'boot');
// MOTD печатается после бута
await page.waitForFunction(
  () => document.querySelectorAll('.reading-close-phrase, .motd, .tl').length > 0,
  null,
  { timeout: 15000 },
).catch(() => {});
await sleep(1500);
await shot(page, 'motd');
log(`boot done ${at()}`);

// каталог
await typeCmd(page, 'taro catalog');
await page.waitForFunction(() => document.querySelectorAll('.menu-row').length > 0, null, { timeout: 15000 });
await sleep(700);
const menuRows = await page.locator('.menu-row').count();
log(`catalog rows: ${menuRows}`);
await shot(page, 'catalog');

const results = [];
let readingBaseline = await page.locator('.reading-close-phrase').count();

for (const spec of TOUR) {
  const r = { id: spec.id, cmd: spec.cmd };
  try {
    const wrapsBefore = await page.evaluate(() => document.querySelectorAll('.spread-wrap').length);
    await typeCmd(page, spec.cmd);
    await page.waitForFunction(
      ({ before, n }) => {
        const wraps = document.querySelectorAll('.spread-wrap');
        if (wraps.length <= before) return false;
        const last = wraps[wraps.length - 1];
        return last.querySelectorAll('button.flip').length === n;
      },
      { before: wrapsBefore, n: spec.n },
      { timeout: 25000 },
    );
    await sleep(500);
    await scrollToBottom(page);
    await shot(page, `${spec.id}_cards`);
    r.cardsSeen = true;

    const { flippedSeq, allFlipped } = await flipAll(page, spec);
    r.flipSeq = flippedSeq;
    r.flipOrderOk = spec.flipNames
      ? JSON.stringify(flippedSeq) === JSON.stringify(spec.flipNames)
      : flippedSeq.filter(Boolean).length === spec.n;
    r.allFlipped = allFlipped;
    log(`${spec.id}: flips [${flippedSeq.join(' → ')}] ok=${r.flipOrderOk} ${at()}`);

    // jank-окно: фаза печати чтения (от последнего флипа до close-фразы)
    await resetJank(page);
    const waitMs = await waitForReading(page, readingBaseline, 30000);
    r.readingMs = waitMs;
    r.readingComplete = waitMs >= 0;
    const jank = await readJank(page);
    r.longTasks = jank.length;
    r.jankMaxMs = jank.reduce((m, e) => Math.max(m, e.d), 0);

    const title = await page.evaluate(() => {
      const els = document.querySelectorAll('.reading-title');
      return els.length ? els[els.length - 1].textContent.trim() : null;
    });
    r.readingTitle = waitMs >= 0 ? title : null;
    await scrollToBottom(page);
    await sleep(350);
    await page.locator('.reading-close-phrase').last().scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await shot(page, `${spec.id}_reading`);
    readingBaseline = await page.locator('.reading-close-phrase').count();
    log(`${spec.id}: reading ${title} in ${waitMs}ms, longTasks=${r.longTasks} max=${r.jankMaxMs}ms ${at()}`);
  } catch (e) {
    r.error = String(e.message || e).slice(0, 300);
    await shot(page, `${spec.id}_FAIL`);
    await scrollToBottom(page);
    await shot(page, `${spec.id}_FAIL_tail`);
    log(`✗ ${spec.id} FAILED: ${r.error} — продолжаю`);
  }
  results.push(r);
}

// журнал: типы каталога в tail-виде
{
  await typeCmd(page, 'taro history');
  await page.waitForFunction(() => document.querySelectorAll('.history-row').length > 0, null, { timeout: 15000 }).catch(() => {});
  await sleep(600);
  await shot(page, 'history');
  const types = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.hr-type')).map((e) => e.textContent.trim()));
  results.push({ id: 'history', types });
  log(`history types: ${types.join(', ')}`);
}

const totalJank = await readJank(page);
const summary = {
  url: URL,
  viewport: VP,
  catalogRows: menuRows,
  spreads: results,
  jankAfterAll: { count: totalJank.length, maxMs: totalJank.reduce((m, e) => Math.max(m, e.d), 0) },
  consoleErrors: errors,
  durationS: (Date.now() - t0) / 1000,
};
fs.writeFileSync(path.join(OUT, 'jank-report.json'), JSON.stringify(summary, null, 2));
console.log('\n=== JANK PROBE (reading typing phases) ===');
for (const r of results.filter((x) => x.longTasks !== undefined)) {
  console.log(`${r.id}: longTasks=${r.longTasks} max=${r.jankMaxMs}ms reading=${r.readingMs}ms flipOrderOk=${r.flipOrderOk}`);
}
console.log('=== CONSOLE ERRORS ===');
console.log(errors.length ? errors.join('\n') : '(none)');
await browser.close();
log(`DONE in ${summary.durationS.toFixed(1)}s → ${OUT}`);
