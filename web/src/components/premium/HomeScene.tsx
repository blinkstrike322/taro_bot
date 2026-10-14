/* Artwork layers retain their own alpha; geometry is intentionally code-native. */
/* eslint-disable @next/next/no-img-element */
export function HomeScene() {
  return (
    <div className="home-scene" aria-hidden="true">
      <img
        className="home-stone"
        src="/premium/home-v6/sanctuary.v001.webp"
        width="768"
        height="1152"
        alt=""
        draggable={false}
        fetchPriority="high"
      />
      <svg className="home-orbits" viewBox="0 0 360 420" fill="none">
        <defs>
          <linearGradient id="home-orbit-ink" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#b29261" stopOpacity=".6" />
            <stop offset=".42" stopColor="#675139" stopOpacity=".18" />
            <stop offset=".75" stopColor="#b29261" stopOpacity=".48" />
            <stop offset="1" stopColor="#675139" stopOpacity=".12" />
          </linearGradient>
        </defs>
        <g stroke="url(#home-orbit-ink)" strokeWidth=".65">
          <ellipse cx="180" cy="210" rx="157" ry="164" />
          <path
            d="M57 308A146 146 0 0 1 134 73M226 73a146 146 0 0 1 77 235"
            opacity=".45"
          />
          <ellipse cx="180" cy="210" rx="89" ry="164" opacity=".2" />
          <path
            d="M35 254Q180 155 325 254M45 154q135 85 270 0M180 27v361"
            opacity=".48"
          />
          <path d="M21 210h32m254 0h32M180 38v18m0 305v25" />
          <circle cx="180" cy="306" r="12" />
          <path d="M180 289v35m-7-18h14" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
            <path
              key={angle}
              transform={`rotate(${angle} 180 210)`}
              d="M180 46v8m-3-3h6"
              opacity=".6"
            />
          ))}
        </g>
      </svg>
      <img
        className="home-light"
        src="/premium/home-v6/light-axis.v002.webp"
        width="640"
        height="960"
        alt=""
        draggable={false}
      />
      <div className="home-relic">
        <img
          src="/premium/home-v6/crescent.v001.webp"
          width="384"
          height="384"
          alt=""
          draggable={false}
        />
      </div>
      <div className="home-scene-shade" />
    </div>
  );
}
