'use client';

// PaywallBlock — «пелена сомкнулась» в стилистике ARCANUM.
// Квота исчерпана — это не ошибка канала, а продуктовый момент:
// продажа продолжения ритуала, а не «лимит запросов».
import { getGuide } from '@/lib/guides';

interface PaywallBlockProps {
  msg: string;
  /** активный проводник — цвет пелены */
  characterId: string;
  /** закрыть WebApp и вернуться в чат бота (там /subscribe) */
  onClose: () => void;
}

export default function PaywallBlock({ msg, characterId, onClose }: PaywallBlockProps) {
  const guide = getGuide(characterId);

  return (
    <div
      className="paywall-block"
      style={
        {
          '--guide-accent': guide.accent,
          '--guide-accent-dim': guide.accentDim,
          '--glow-center': guide.glowCenter,
        } as React.CSSProperties
      }
    >
      <div className="paywall-veil" aria-hidden="true" />
      <div className="paywall-title">ПЕЛЕНА СОМКНУЛАСЬ</div>
      <div className="tl tl-dim paywall-msg">{msg}</div>
      <div className="tl tl-comment" style={{ marginTop: 8 }}>
        {'// за пеленой — 100 призывов в месяц'}
        {'\n// первый месяц: 100 ★ · дальше 600 ★'}
      </div>
      <button type="button" className="paywall-cta" onClick={onClose}>
        <span className="pw-glyph">◈</span> ОТКРЫТЬ ПЕЛЕНУ — В БОТЕ
        <span className="pw-hint">вернуться в чат → /subscribe</span>
      </button>
    </div>
  );
}
