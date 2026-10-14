"use client";
import { useState } from "react";
import type { TarotCardData } from "@/lib/api";
import { cardArt } from "@/lib/premium";
import { Icon } from "./Ornaments";
export function TarotArtwork({
  card,
  back = false,
  large = false,
}: {
  card?: TarotCardData;
  back?: boolean;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const framed =
    !!card && ["the-moon", "the-hermit", "the-fool"].includes(card.id);
  return (
    <div
      className={`tarot-art ${back ? "is-back" : ""} ${large ? "large" : ""} ${!back && card?.is_reversed ? "reversed" : ""}`}
    >
      {back ? (
        <div className="card-back-art" aria-hidden="true">
          <span />
          <span />
          <Icon name="star" size={38} />
        </div>
      ) : failed ? (
        <div
          className="missing-art"
          role="img"
          aria-label={`Изображение карты ${card?.name} недоступно`}
        >
          <Icon name="cards" />
          <span>{card?.name}</span>
        </div>
      ) : (
        <img
          draggable={false}
          src={card ? cardArt(card) : ""}
          alt={card?.name || ""}
          loading={large ? "eager" : "lazy"}
          className="card-picture"
          onError={() => setFailed(true)}
        />
      )}
      {framed && !back && !failed && (
        <img
          draggable={false}
          src="/premium/ritual-v5/card-frame.v004b.png"
          alt=""
          className="card-frame"
        />
      )}
    </div>
  );
}
