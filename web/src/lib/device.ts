// Хелперы для детекта слабых устройств (Android-WebView, старые телефоны).
// Используем только там, где разница в цене рендера велика: тяжёлые постоянно
// анимированные ambient-слои (~6.8к SVG-нод) гонять на дедушках нет смысла.

export function isLowEndDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const dm = nav.deviceMemory;
  const cores = navigator.hardwareConcurrency;
  const reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ≤4 ГБ памяти или ≤4 логических ядра — типичные бюджетные телефоны
  const low = (typeof dm === 'number' && dm > 0 && dm <= 4) || (cores > 0 && cores <= 4);
  return low || reduced;
}