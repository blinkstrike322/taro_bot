"use client";
import { useState } from "react";
import { getGuide } from "@/lib/guides";
import { PREMIUM_GUIDES } from "@/lib/premium";
import { Divider, Icon } from "./Ornaments";
const ids = ["spark_of_chaos", "shadow_walker", "ruin_keeper"];
export function GuideGallery({
  chosen,
  onChoose,
  busy,
}: {
  chosen: string;
  onChoose: (id: string) => void;
  busy: boolean;
}) {
  const [selected, setSelected] = useState(chosen);
  const guide = getGuide(selected),
    design = PREMIUM_GUIDES[selected];
  const voices: Record<string, string> = {
    shadow_walker:
      "«Перемены могут пугать даже тогда, когда ты их ждёшь. Давай услышать, что прячется за этой тревогой».",
    ruin_keeper:
      "«Не нужно видеть весь путь. Найдём то, что выдержит первый шаг, и начнём оттуда».",
    spark_of_chaos:
      "«Кажется, ты уже стоишь у двери. Давай выясним: тебе нужен ещё один знак — или разрешение повернуть ручку?»",
  };
  return (
    <section className="content-page guides-page">
      <h1>Выбери проводника</h1>
      <p className="subtle">Чей голос тебе ближе сегодня?</p>
      <div className="persona-gallery">
        {ids.map((id) => (
          <button
            className={`persona ${selected === id ? "selected" : ""}`}
            style={
              { "--persona": PREMIUM_GUIDES[id].accent } as React.CSSProperties
            }
            key={id}
            aria-pressed={selected === id}
            onClick={() => setSelected(id)}
          >
            <img src={`/premium/ritual-v5/${id}.v001.webp`} alt="" />
            <span className="persona-veil" />
            <span className="persona-name">{getGuide(id).name}</span>
            <span className="persona-symbol">
              <Icon name={PREMIUM_GUIDES[id].symbol} size={22} />
            </span>
          </button>
        ))}
      </div>
      <div
        className="persona-detail"
        key={selected}
        style={{ "--persona": design.accent } as React.CSSProperties}
      >
        <p className="eyebrow">{design.lead}</p>
        <h2>{guide.name}</h2>
        <p>{design.description}</p>
        <Divider />
        <p className="voice-question">«Как решиться на перемены?»</p>
        <blockquote>{voices[selected]}</blockquote>
      </div>
      <button
        className="primary"
        disabled={busy || selected === chosen}
        onClick={() => onChoose(selected)}
      >
        {busy
          ? "Сохраняем…"
          : selected === chosen
            ? "Сейчас рядом с тобой"
            : "Выбрать этого проводника"}
        <Icon name={selected === chosen ? "check" : "arrow"} size={18} />
      </button>
      <p className="footnote">Голос начатого расклада останется прежним.</p>
    </section>
  );
}
