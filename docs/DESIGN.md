# ARCANUM — дизайн-система оккультного терминала (v2)

> Telegram Mini App «таро-терминал»: весь флоу живёт в одном непрерывном
> CRT-транскрипте. Нет экранов и модалок — только журнал, командная строка
> и три проводника. Документ актуален на Task 16 (октябрь 2026); источники
> правды: `web/src/lib/guides.ts` (палитры), `web/src/lib/spreads.ts` +
> `data/spreads.json` (каталог), `web/src/styles/globals.css` (токены).

## 1. Тема и атмосфера

Цифровой оракул в корпусе катодно-лучевой трубки: матовая тьма, фосфорный
акцент проводника, ритуальная геометрия. Поверх канваса живут атмосферные
слои (дым, зерно, созвездие, лунные глифы, вращающийся сигил), которые
**уступают контент** — на время печати и скролла они ставятся на паузу.

Ключевые приёмы:

- один непрерывный транскрипт: бут → MOTD → команды → расклады → чтения;
- каждый проводник перекрашивает весь терминал (CSS-переменные
  `--guide-accent`, `--guide-accent-dim`, `--guide-glow`, `--t-bg`);
- пиксельная колода (78 арканов, `image-rendering: pixelated`) + рубашки
  на проводника (`/cards/backs/back_*.png`, `cardBackVersion` для сброса кэша);
- рамки с ASCII-уголками (`╔ ┐ └ ╝`), трассы-дорожки, глифы-осколки.

## 2. Палитра — «Alchemical Manuscript»

Три проводника = три алхимические стадии. Цвета desaturated, «пигмент на
пергаменте», не неон. Контраст акцента на тьме ≥ 7:1.

| Проводник | Стадия | accent | accentDim | bgDeep | corner-символы |
|---|---|---|---|---|---|
| Странница Теней (`shadow_walker`) | ALBEDO · серебро-лава | `#b5a5e6` | `rgba(181,165,230,.22)` | `#05040f` | `☾ ✦ † ☽` |
| Хранитель Руин (`ruin_keeper`) | CITRINITAS · латунь | `#c8a368` | `rgba(200,163,104,.22)` | `#0a0704` | `⚰ ☥ † ⚹` |
| Искра Хаоса (`spark_of_chaos`) | RUBEDO · кармин | `#d65a6e` | `rgba(214,90,110,.22)` | `#0a0406` | `⌇ ✕ ⋈ ※` |

Правила: фон никогда не плоский `#000` — тонированная тьма `bgDeep` +
пятно ЭЛТ `glowCenter`; акцент задаётся переменной проводника, а не
хардкодом; `accentDim` — только подложки/свечения.

## 3. Типографика

Загрузка: Google Fonts (`_document.tsx`), `display=swap`.

| Роль | Шрифт | Вес | Кейс |
|---|---|---|---|
| Терминальный body, UI-лейблы, статус-лайн | JetBrains Mono (`--font-mono-crt`, `--font-pixel`) | 300–800 | lowercase / UPPERCASE для меток |
| Заголовок чтения `.reading-title` | Cormorant Garamond (`--font-serif`) | 600 · 18px | UPPERCASE, `letter-spacing .08em` |
| Имена карт `.reading-position-name` | Cormorant Garamond | 600 · 20px | mixed |
| Закрывающая фраза `.reading-close-phrase` | JetBrains Mono italic | 400 | lowercase |

JetBrains Mono выбран вместо пиксельных шрифтов: полная кириллица
(О/Ы/Ш рендерятся чисто), hinting допускает антиалиасинг.

## 4. Каркас Shell (`components/shell/Shell.tsx`)

```
┌ shell-title   [ ARCANUM.ocv ] · REC · uptime · ./сеанс --tty1
├ shell-scroll  транскрипт: boot → motd → cmd/out/progress/pending
│                          → daily/spread → json(чтение) → menu/history/paywall
├ statusline    -- РЕЖИМ · расклад -- · сеанс #hex · tag · ♪ · utf-8 · часы
└ CommandBar    ввод + чипы (daily/ask/catalog/guides/history/·/sound)
```

Режимы (`ShellMode`): `БУТ · ОЖИДАНИЕ · ВОПРОС · ТАСОВАНИЕ · РАСКЛАД ·
ЧТЕНИЕ · МЕНЮ · ЖУРНАЛ`. Автоскролл: новый расклад анкорится к началу
(`ANCHOR_MS` 2000мс), дальше транскрипт следует вниз; smooth-скролл
отключается при печати и `prefers-reduced-motion`.

Команды (`lib/commands.ts`): префикс `taro` опционален, кириллица
равноправна. Каталожные алиасы не пересекаются с легаси-кейсами
`daily/ask/ask1`; «тень» без текста — проводник, с текстом — расклад
`shadow`. Пасхалки: `whoami/uname/date/pwd/ls/sudo/cat/exit`.

## 5. Движок печати — `lib/typeFlow.ts` + `components/shell/ProseType.tsx`

- печать через `requestAnimationFrame` **прямой инжекцией в Text-ноду** —
  ноль React-ререндеров на символ;
- база 72 cps с плавным wobble `1 + 0.12·sin(i·0.35)`; паузы на знаках:
  `.!?…` → 120мс, `,;:—` → 50мс (`punctDelay`);
- расписание копится (`nextAt += delay`), а не пересчитывается от кадра;
  после залипания кадра догоняем **максимум 2 символами за кадр** —
  текст не «выстреливает» блоком;
- `ProseType` сообщает о завершении через `onDone` (этапы чтения
  двигаются событиями, без pre-computed задержек);
- `Typewriter` (эхо команд, 18 мс/символ) — для коротких строк.

### Механика is-typing

`lib/typingActivity.ts` — модульный счётчик активных потоков
(`begin()/end()` строго парны). Shell подписывается и ставит атрибут
`data-typing` на `.shell-root` и `.crt`; CSS (globals.css, блок
`data-typing`) ставит на паузу дым, сигил, зерно и глушит glow —
main-thread остаётся печати. Аналогично `data-scrolling` (окно 160мс)
морозит фон при скролле.

## 6. Каталог 8 раскладов (`data/spreads.json` ↔ `lib/spreads.ts`)

Backend — источник правды; фронт держит зеркало. `flip_order` — порядок
вскрытия карт (ключи позиций), `layout` — геометрия SpreadBlock.

| id | Имя | Команда | Карт | Layout | Вопрос | flip_order |
|---|---|---|---|---|---|---|
| `daily` | карта дня | `taro daily` | 1 | column1 | нет | p1 |
| `single` | одна карта | `taro ask1 «q»` | 1 | column1 | да | p1 |
| `yesno` | да / нет | `taro yesno «q»` | 3 | trio | да | p1 → p2 → p3 |
| `three` | три карты | `taro ask «q»` | 3 | pyramid | нет* | p1 → p2 → p3 |
| `mfd` | мысли · чувства · действия | `taro mfd «q»` | 3 | trio | да | p1 → p2 → p3 |
| `shadow` | тень | `taro shadow [тема]` | 6 | spine | нет | p1…p6 |
| `pentagram` | пентаграмма | `taro pentagram «q»` **†** | 6 | pentagram | да | earth → air → water → fire → spirit → center |
| `horseshoe` | подкова | `taro horseshoe «q»` | 7 | arc | да | p1…p7 |

\* «три карты» всегда динамическая: имена позиций вычисляет бэкенд по
вопросу (`_positions_for_question`), JSON-позиции не рендерятся напрямую.
† см. «Известные проблемы» — команда `taro pentagram` в текущем парсере
не резолвится, рабочий алиас — `taro пентаграмма`.

Геометрии: `column1` — одна карта по центру; `trio` — ряд из трёх с
метками позиций; `pyramid` — верх (p2) над нижними [p1, p3]; `spine` —
стек 4+2; `pentagram` — ритуальный круг, слоты по ключам
(`center/spirit/fire/water/earth/air`); `arc` — дуга из 7 с
вертикальными микросдвигами (`ARC_DY`).

### Вскрытие (`SpreadBlock.tsx`)

Очередь = `flip_order` → индексы карт через `position_keys` (cards[i] ↔
positionKeys[i]); ключи `pN` мапятся сами, непонятые пропускаются,
остаток добивается слева направо. Клик мимо очереди игнорируется с
однократным shake. Подсказка `// вскрой: {имя позиции}` светится
акцентом, когда фоновый шёпот уже доставлен (`spread-hint--ready`).

## 7. Чтение (`components/ReadingResult.tsx`)

Секции маунтятся последовательно по стейдж-машине: `header` (auto, 350мс +
45мс/карта) → `intro` («шепот») → `signal` (short_answer, акцентный бокс)
→ body (позиции/проявление+на-что-смотреть/значения) → `synthesis`
(«нить») → `disclosure` (`<details>` «траектория дня», auto 200мс) →
`advice` (бокс совета) → `close` (фраза + тег проводника). Проза печатается
ProseType; каждая секция двигает стейдж своим `onDone`.

- Формы body: multi-card — `позиции[]` + `связь_карт`; daily —
  `проявление`/`на_что_смотреть` + disclosure `траектория`; легаси —
  `card_meaning`.
- **Closings** — пул ритуальных подписей на проводника (по 8 фраз,
  `guides.ts`), выбирается случайно при каждом чтении; в журнале —
  «из журнала сеансов».
- `instant` (журнал) — все секции сразу, без таймеров.

## 8. Атмосферные слои и перф-бюджет

| Слой | Файл | Отключение |
|---|---|---|
| ритуальный дым (3 облачка) | `Shell.tsx` (`.ritual-smoke`) | `data-typing`/`data-scrolling` |
| ambient-сигил (вращ. пентаграмма, ~6.8к SVG-нод) | `AmbientSigil.tsx` | маунт после бута; `sigil-dim` при чтении; `heavyMotion` |
| живое зерно ЭЛТ | `CrtNoise.tsx` | `heavyMotion`, `data-typing` |
| созвездие + лунные глифы | `ConstellationLayer.tsx`, `LunarGlyphsLayer.tsx` | `heavyMotion` |

`heavyMotion = isLowEndDevice() || prefers-reduced-motion` — слабые
устройства получают статичный фон. `.term-frame`/`frame-ritual`/`menu-box`
используют `backdrop-filter: blur(6px)` — матовые боксы вместо сплошного
блюра экрана. **Перф-цель: 0 long tasks > 50мс на фазе печати чтения** —
проверяется туром `scripts/e2e_tour.mjs` (PerformanceObserver longtask);
метрика на Task 16: 0 long tasks во всех 8 прогонах.

## 9. Данные и инструменты

- Двухфазный расклад: `POST /api/spread/begin` (карты сразу + token) →
  `GET /api/spread/poll?token=…` (шёпот, поллинг 1.5с). Ответ begin несёт
  `positions` (имена в card-order), `position_keys`, `spread_id/name`.
- Моки: `scripts/serve_webapp_mock.py` — prod-статика + мок API
  (каталог из `data/spreads.json`, легаси 1+question → single, 1 → daily,
  3 → three — как `core/spreads.resolve_spread`); dev-мок `lib/mockApi.ts`
  активен только в `next dev`.
- Верификация: `scripts/e2e_tour.mjs` (Playwright, viewport 390×844) —
  8 раскладов, флипы по flip_order через подсказку, скриншоты
  `docs/assets/tour-v2/`, jank-проба на печати чтения.
- Журнал: типы `daily`, `spread_{catalog_id}`; метки —
  `spreadLabelFromType` (`lib/transcript.ts`).

## 10. Известные проблемы (Task 16, на контроллер)

1. **Дедлок чтения daily** — `ReadingResult.tsx`: при интерпретации без
   `связь_карт`, но с `disclosure` (реальный daily из `core/llm.py`)
   счётчик стадий доходит до `disclosureIdx`, но autoAdvance читает
   `stages[stage]` по позиции массива, где лежит body-запись → `// совет`
   и close-фраза не появляются. Unit-тесты не ловят: все кейсы `instant`.
2. **Команда `taro pentagram` не резолвится** — `commands.ts` строит
   алиасы только из `aliases` каталога (`пента/пентаграмма/pent`), а help
   и строка каталога предлагают `taro pentagram`.

## 11. Do / Don't

- ✅ акцент только через переменные проводника; кириллица в UI — всюду;
- ✅ печать — только через typeFlow/ProseType (события onDone, без
  фиксированных задержек под тайминги);
- ✅ новые анимации — с учётом `data-typing`/`data-scrolling` и
  `heavyMotion`;
- ✅ флипы — строго по `flip_order`, клик мимо очереди = shake;
- ❌ никаких модалок и отдельных экранов — только транскрипт;
- ❌ не хардкодить цвета проводников в компонентах;
- ❌ не рендерить посимвольно через React-состояние;
- ❌ не блокировать main-thread на фазе печати (long tasks > 50мс).
