// ─────────────────────────────────────────────────────────────
// themes.ts — покрытия фосфора ARCANUM. Четыре темперамента
// одного терминала: исходный пергамент, лунное серебро (альбедо),
// костёр (игнидио) и монохромный пепел (кальцинация).
// Тема — это фильтр над всей ЭЛТ: краски проводника остаются,
// но трубка «видит» в своём фосфоре. Выбор живёт в localStorage
// (taro_theme), гидрации не мешает: стартуем с classic и после
// кадра подставляем сохранённую.
// ─────────────────────────────────────────────────────────────

export interface ThemeMeta {
  id: string;
  /** имя для интерфейса */
  name: string;
  /** глиф в статус-лайне и списке тем */
  glyph: string;
  /** алхимическая стадия — подпись темы */
  stage: string;
  /** одна строка настроения */
  note: string;
  /** CSS filter, наложение на .crt. classic = identity-фильтр,
   *  чтобы transition между темами всегда интерполировался */
  filter: string;
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'classic',
    name: 'пергамент',
    glyph: '✦',
    stage: 'исходное',
    note: 'пигмент на пергаменте · фосфор терминала как задуман',
    filter: 'brightness(1)',
  },
  {
    id: 'silver',
    name: 'серебро',
    glyph: '☽',
    stage: 'альбедо',
    note: 'лунный свет на латуни · холодный чистый тон',
    // grayscale снимает цвет → sepia даёт тёплую базу →
    // hue-rotate 170° разворачивает её в циан; яркость возвращает вес
    filter: 'grayscale(0.6) sepia(0.32) hue-rotate(170deg) saturate(1.6) brightness(1.08)',
  },
  {
    id: 'ember',
    name: 'костёр',
    glyph: '✸',
    stage: 'игнидио',
    note: 'угли под пеплом · тёплое дыхание огня',
    filter: 'sepia(0.55) saturate(1.7) hue-rotate(-14deg) brightness(1.03) contrast(1.04)',
  },
  {
    id: 'ash',
    name: 'пепел',
    glyph: '◌',
    stage: 'кальцинация',
    note: 'монохромный фосфор · старый монитор, вся магия — в тоне',
    filter: 'grayscale(1) brightness(0.95) contrast(1.12)',
  },
];

export const THEME_IDS = THEMES.map((t) => t.id);

export const DEFAULT_THEME = 'classic';

export function getTheme(id: string | null | undefined): ThemeMeta {
  const t = THEMES.find((x) => x.id === id);
  return t ?? THEMES[0];
}

/** алиасы аргументов команды taro theme */
const THEME_ALIASES: Record<string, string> = {
  // классика
  'classic': 'classic', 'пергамент': 'classic', 'пергам': 'classic',
  'исходная': 'classic', 'исходное': 'classic', 'сброс': 'classic',
  'reset': 'classic', 'default': 'classic', 'none': 'classic',
  // серебро
  'silver': 'silver', 'серебро': 'silver', 'серебр': 'silver',
  'луна-тема': 'silver', 'albedo': 'silver', 'альбедо': 'silver',
  // костёр
  'ember': 'ember', 'костёр': 'ember', 'костер': 'ember',
  'огонь': 'ember', 'fire': 'ember', 'угли': 'ember', 'игнидио': 'ember',
  // пепел
  'ash': 'ash', 'пепел': 'ash', 'прах': 'ash', 'монохром': 'ash',
  'grayscale': 'ash', 'чб': 'ash', 'кальцинация': 'ash',
};

/** «серебро» | «silver» | «СЕРЕБРО» → id; иначе null */
export function normalizeThemeArg(arg: string): string | null {
  const key = arg.trim().toLowerCase();
  return THEME_ALIASES[key] ?? null;
}

const LS_KEY = 'taro_theme';

/** тема из памяти терминала (некорректное значение → классика) */
export function readSavedTheme(): string {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw && THEME_IDS.includes(raw) ? raw : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveTheme(id: string): void {
  try {
    localStorage.setItem(LS_KEY, id);
  } catch {}
}
