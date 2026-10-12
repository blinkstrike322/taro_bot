// Run against Next dev plus serve_premium_test.py. The API uses real handlers,
// signed dummy identity and a disposable DB; only its LLM result is a fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.resolve('web/package.json'));
const playwrightPath = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = require(playwrightPath);
const url = process.env.PREMIUM_URL || 'http://localhost:3210';
const api = process.env.PREMIUM_TEST_API || 'http://127.0.0.1:8097';
const output = path.resolve('docs/assets/premium');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {}) });
const failures = [];
const report = { widths: [], preview: false, realAPI: false, reload: false, lostResponseRetry: false, followup: false, spreads: [], errors: failures };

async function image(page, name) {
  await page.screenshot({ path: path.join(output, name + '.png') });
}

async function measure(page, width, screen) {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    main: document.querySelector('main')?.scrollWidth,
    brokenImages: [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.getAttribute('src')),
  }));
  assert.ok(metrics.document <= width && metrics.body <= width, `${screen}: horizontal overflow ${JSON.stringify(metrics)}`);
  assert.ok(!metrics.main || metrics.main <= width, `${screen}: main overflow ${JSON.stringify(metrics)}`);
  assert.deepEqual(metrics.brokenImages, [], `${screen}: broken images`);
  report.widths.push({ width, screen, ...metrics });
}

async function question(page) {
  await page.getByRole('button', { name: 'Задать вопрос', exact: true }).click();
  await page.locator('#arcanum-question').fill('Как понять, что я готова к переменам?');
  await page.getByRole('button', { name: 'Выбрать расклад', exact: true }).click();
}

try {
  const preview = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await preview.newPage();
  page.on('pageerror', error => failures.push(error.message));
  await page.goto(url);
  await page.getByRole('button', { name: 'Посмотреть демонстрацию', exact: true }).waitFor();
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await measure(page, width, 'home');
    await image(page, `home-${width}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Посмотреть демонстрацию', exact: true }).click();
  await question(page);
  await image(page, 'setup-390');
  await page.getByRole('button', { name: 'Начать ритуал', exact: true }).click();
  await page.getByRole('button', { name: /^Открыть карту 1,/ }).waitFor();
  assert.equal(await page.getByRole('img', { name: 'Карта Луна', exact: true }).count(), 0, 'unrevealed front must be hidden from accessibility');
  await image(page, 'ritual-390');
  for (let index = 1; index <= 3; index++) await page.getByRole('button', { name: new RegExp(`^Открыть карту ${index},`) }).click();
  assert.equal(await page.getByRole('img', { name: 'Карта Луна', exact: true }).count(), 1, 'revealed front must be accessible');
  await page.getByRole('button', { name: 'Перейти к чтению', exact: true }).click();
  await image(page, 'reading-390');
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await measure(page, width, 'reading');
  }
  report.preview = true;
  await preview.close();

  const identityResponse = await fetch(api + '/__test_identity');
  assert.equal(identityResponse.status, 200);
  const { init_data } = await identityResponse.json();
  const real = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await real.route('https://telegram.org/js/telegram-web-app.js', route => route.fulfill({
    contentType: 'application/javascript', body: `window.Telegram={WebApp:{initData:${JSON.stringify(init_data)},initDataUnsafe:{user:{id:919191}},ready(){},expand(){},HapticFeedback:{impactOccurred(){}}}};`,
  }));
  let begins = 0;
  let loseFirstBegin = true;
  let firstToken;
  await real.route('**/api/**', async route => {
    const request = route.request();
    const requestURL = new URL(request.url());
    if (requestURL.pathname === '/api/spread/begin') begins++;
    assert.ok(!requestURL.searchParams.has('init_data'), 'auth should not appear in API URL');
    const response = await real.request.fetch(api + requestURL.pathname + requestURL.search, {
      method: request.method(), headers: request.headers(), data: request.postData() || undefined,
    });
    if (requestURL.pathname === '/api/spread/begin') {
      const body = await response.json();
      if (!firstToken && response.ok()) firstToken = body.token;
      if (loseFirstBegin && response.ok()) {
        loseFirstBegin = false;
        await route.abort('failed');
        return;
      }
      if (begins === 2) assert.equal(body.token, firstToken, 'retry after a lost response must reuse the server session');
    }
    await route.fulfill({ response });
  });
  const live = await real.newPage();
  live.on('pageerror', error => failures.push(error.message));
  await live.goto(url);
  await live.getByRole('button', { name: 'Задать вопрос', exact: true }).waitFor();
  await question(live);
  await live.getByRole('button', { name: 'Начать ритуал', exact: true }).click();
  await live.getByRole('button', { name: 'Повторить подключение', exact: true }).waitFor();
  assert.equal(await live.locator('.p-spread-chip:not(:disabled)').count(), 0, 'uncertain operation must keep inputs fixed');
  await live.getByRole('button', { name: 'Повторить подключение', exact: true }).click();
  await live.getByRole('button', { name: /^Открыть карту 1,/ }).waitFor();
  report.lostResponseRetry = true;
  await live.getByRole('button', { name: /^Открыть карту 1,/ }).click();
  const storageBefore = await live.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith('arcanum.premium.v1:'))));
  const saved = JSON.parse(Object.values(storageBefore)[0]);
  assert.equal(saved.session.cards.length, 3);
  assert.deepEqual(saved.session.revealed, [0]);
  await live.reload();
  await live.getByRole('button', { name: /Вернуться к раскладу/ }).click();
  await live.getByRole('button', { name: /^Читать карту Луна,/ }).waitFor();
  assert.equal(begins, 2, 'reload must not create a new reading');
  report.reload = true;
  for (const index of [2, 3]) await live.getByRole('button', { name: new RegExp(`^Открыть карту ${index},`) }).click();
  await live.getByRole('button', { name: 'Перейти к чтению', exact: true }).click();
  await live.getByText('Проясни, что уже известно, и выбери небольшой следующий шаг.', { exact: true }).waitFor();
  await live.locator('#followup-question').fill('Какой небольшой шаг поможет мне?');
  await live.getByRole('button', { name: 'Спросить проводника', exact: true }).click();
  await live.getByText(/Фиксированный ответ тестового сервера/).waitFor();
  report.followup = true;
  await live.getByRole('button', { name: 'Открыть журнал', exact: true }).click();
  await live.getByRole('button', { name: /Как понять, что я готова к переменам/ }).waitFor();
  await image(live, 'journal-real-api-390');
  report.realAPI = true;
  const spreads = [['daily', 1], ['single', 1], ['three', 3], ['yesno', 3], ['mfd', 3], ['shadow', 6], ['pentagram', 6], ['horseshoe', 7]];
  for (let index = 0; index < spreads.length; index++) {
    const [id, count] = spreads[index];
    await live.getByRole('button', { name: 'Расклады', exact: true }).click();
    await live.locator('.p-catalog-card').nth(index).click();
    if (id !== 'daily') {
      await live.locator('#arcanum-question').fill(`Тест ${id}: на что обратить внимание в творческом проекте?`);
      await live.getByRole('button', { name: 'Выбрать расклад', exact: true }).click();
    }
    await live.locator('.p-guide-options button').nth(index % 3).click();
    await live.getByRole('button', { name: 'Начать ритуал', exact: true }).click();
    await live.getByRole('button', { name: /^Открыть карту 1,/ }).waitFor();
    assert.equal(await live.locator('.p-reveal-card').count(), count, id + ' card count');
    await live.setViewportSize({ width: 320, height: 844 });
    await measure(live, 320, 'ritual-' + id);
    await image(live, `ritual-${id}-320`);
    for (let card = 1; card <= count; card++) await live.getByRole('button', { name: new RegExp(`^Открыть карту ${card},`) }).click();
    await live.getByRole('button', { name: 'Перейти к чтению', exact: true }).click();
    await live.getByText('Проясни, что уже известно, и выбери небольшой следующий шаг.', { exact: true }).waitFor();
    await measure(live, 320, 'reading-' + id);
    report.spreads.push({ id, cards: count, guideIndex: index % 3, passed: true });
    await live.setViewportSize({ width: 390, height: 844 });
  }
  await real.close();
  assert.deepEqual(failures, [], 'browser errors');
} finally {
  await browser.close();
  await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
