'use client';

import { useState } from 'react';
import type { TarotCardData } from '@/lib/api';
import { cardArt, cardMetadata } from '@/lib/premium';
import { Icon } from './Ornaments';

export function TarotArtwork({ card, back = false, large = false }: { card?: TarotCardData; back?: boolean; large?: boolean }) {
  const [fallback, setFallback] = useState(false);
  const [missing, setMissing] = useState(false);
  const meta = card ? cardMetadata(card.id) : null;
  const primary = back ? '/premium/card-back.webp' : card ? cardArt(card) : '';
  const src = fallback ? back ? '/cards/backs/back_ruin_keeper.png' : card?.image_url || `/cards/${card?.id}.png` : primary;
  return <div className={`p-artwork ${back ? 'is-back' : 'is-front'} ${large ? 'is-large' : ''} ${card?.is_reversed && !back ? 'is-reversed' : ''}`}>
    {!missing && <img src={src} alt={back ? '' : `Карта ${card?.name || ''}`} className="p-card-image" loading={large || back ? 'eager' : 'lazy'} onError={() => { if (!fallback) setFallback(true); else setMissing(true); }} />}
    {missing && <div className="p-artwork-missing"><Icon name={back ? 'star' : 'cards'} size={48} />{!back && <span>{card?.name}</span>}</div>}
    {!back && <><span className="p-artwork-number">{meta?.numeral}</span><span className="p-artwork-title">{card?.name}</span></>}
    <span className="p-artwork-corner is-tl" /><span className="p-artwork-corner is-tr" /><span className="p-artwork-corner is-bl" /><span className="p-artwork-corner is-br" />
  </div>;
}
