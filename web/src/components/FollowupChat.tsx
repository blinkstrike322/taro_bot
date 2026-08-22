'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { SendHorizontal } from 'lucide-react';
import { getGuide } from '@/lib/guides';
import * as API from '@/lib/api';

interface ChatMessage {
  role: 'user' | 'guide';
  text: string;
}

interface FollowupChatProps {
  readingId: number | null;
  characterId?: string;
}

export default function FollowupChat({ readingId, characterId }: FollowupChatProps) {
  const guide = getGuide(characterId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const disabled = loading || readingId === null || (remaining !== null && remaining <= 0);

  // автоскролл к новому сообщению
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const submit = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || disabled) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: q }]);
    setLoading(true);
    try {
      const res = await API.followup(readingId as number, q);
      setMessages((prev) => [...prev, { role: 'guide', text: res.answer }]);
      setRemaining(res.remaining);
      try {
        (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      } catch {}
    } catch (err: any) {
      const msg = err?.message || 'Проводница задержалась. Попробуй ещё раз.';
      setMessages((prev) => [...prev, { role: 'guide', text: msg }]);
      if (err?.status === 429) setRemaining(0);
    } finally {
      setLoading(false);
    }
  }, [disabled, readingId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit(input);
    }
  };

  return (
    <div
      className="mt-3"
      style={{
        '--guide-accent': guide.accent,
        '--guide-accent-deep': guide.accentDeep,
        '--guide-accent-dim': guide.accentDim,
      } as React.CSSProperties}
    >
      <div className="section-label mb-2">
        <span>Спроси ещё</span>
      </div>

      <div className="soft-card p-3.5" style={{ borderRadius: 4 }}>
        {/* шапка чата */}
        <div className="flex items-center gap-2.5 pb-2.5 mb-2" style={{ borderBottom: '1px dashed var(--line)' }}>
          <span className="w-8 h-8 guide-portrait-frame flex-shrink-0" style={{ borderRadius: 10, border: `1.5px solid ${guide.accentDim}` }}>
            <img
              src={guide.portrait}
              alt={guide.name}
              className="w-full h-full object-cover guide-portrait-scan"
              style={{ imageRendering: 'pixelated' }}
            />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="font-serif text-[16px] font-semibold text-[color:var(--ink)]">
              {guide.name} рядом
            </span>
            <span className="font-pixel text-[8px] tracking-[0.16em] uppercase" style={{ color: guide.accent }}>
              отвечает по картам этого расклада
            </span>
          </div>
          {remaining !== null && remaining <= 3 && remaining > 0 && (
            <span className="ml-auto font-pixel text-[8px] text-[color:var(--ink-faint)] tracking-wider">
              ещё {remaining}
            </span>
          )}
        </div>

        {/* лента сообщений */}
        <div ref={listRef} className="flex flex-col gap-2.5 max-h-[42vh] overflow-y-auto pr-0.5">
          {messages.length === 0 && !loading && (
            <div className="flex flex-wrap gap-2 py-1">
              {guide.chatChips.map((chip, i) => (
                <button
                  key={i}
                  type="button"
                  className="chat-chip"
                  onClick={() => submit(chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          {messages.map((m, i) =>
            m.role === 'guide' ? (
              <div key={i} className="chat-msg-in flex items-end gap-2 max-w-[92%]">
                <span className="w-5 h-5 guide-portrait-frame flex-shrink-0 mb-1" style={{ borderRadius: 6 }}>
                  <img
                    src={guide.portrait}
                    alt=""
                    className="w-full h-full object-cover guide-portrait-scan"
                    style={{ imageRendering: 'pixelated' }}
                  />
                </span>
                <div
                  className="chat-bubble-guide px-3.5 py-2.5"
                >
                  <p className="font-sans text-[13.5px] leading-relaxed text-[color:var(--ink)]">
                    {m.text}
                  </p>
                </div>
              </div>
            ) : (
              <div key={i} className="chat-msg-in flex justify-end">
                <div className="chat-bubble-user px-3.5 py-2.5 max-w-[85%]">
                  <p className="font-sans text-[13.5px] font-semibold leading-relaxed">
                    {m.text}
                  </p>
                </div>
              </div>
            ),
          )}

          {loading && (
            <div className="chat-msg-in flex items-end gap-2">
              <span className="w-5 h-5 guide-portrait-frame flex-shrink-0 mb-1.5" style={{ borderRadius: 6 }}>
                <img
                  src={guide.portrait}
                  alt=""
                  className="w-full h-full object-cover guide-portrait-scan"
                  style={{ imageRendering: 'pixelated' }}
                />
              </span>
              <div
                className="chat-bubble-guide px-4 py-3 flex items-center gap-1.5"
                aria-label={`${guide.name} думает`}
              >
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="guide-loading-dot"
                    style={{ '--dot-delay': `${d * 0.2}s` } as React.CSSProperties}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ввод */}
        <div className="flex items-center gap-2 mt-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              remaining !== null && remaining <= 0
                ? 'вопросы к раскладу закончились'
                : 'Спроси о картах...'
            }
            disabled={disabled}
            maxLength={500}
            className="chat-input flex-1 min-w-0 px-4 py-2.5 text-[13.5px]"
          />
          <button
            type="button"
            className="btn-vibe flex-shrink-0 w-10 h-10 flex items-center justify-center"
            style={{ background: 'var(--accent-blue)', borderColor: 'var(--accent-blue)' }}
            onClick={() => submit(input)}
            disabled={disabled || !input.trim()}
            aria-label="Отправить вопрос"
          >
            <SendHorizontal size={16} strokeWidth={1.75} className="relative z-10" />
          </button>
        </div>
      </div>
    </div>
  );
}
