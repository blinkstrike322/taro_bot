import { Icon } from "./Ornaments";
import { HomeScene } from "./HomeScene";

function HomeRule() {
  return (
    <div className="home-rule" aria-hidden="true">
      <span />
      <Icon name="star" size={22} />
      <span />
    </div>
  );
}

export function HomeScreen({
  onQuestion,
  onDaily,
  onSettings,
  onResume,
}: {
  onQuestion: () => void;
  onDaily: () => void;
  onSettings: () => void;
  onResume?: () => void;
}) {
  return (
    <section className="home-content">
      <header className="home-heading">
        <div className="home-terminal-row">
          <span className="home-terminal">[ ARCANUM.ocv ]</span>
          <div className="home-utilities">
            <button onClick={onDaily} aria-label="Карта дня" title="Карта дня">
              <Icon name="moon" size={17} />
            </button>
            <button
              onClick={onSettings}
              aria-label="Открыть настройки"
              title="Настройки"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth=".9"
                aria-hidden="true"
              >
                <path d="M5 4v16M12 4v16M19 4v16M2 9h6m1 6h6m1-7h6" />
                <circle cx="5" cy="9" r="1.8" fill="#080706" />
                <circle cx="12" cy="15" r="1.8" fill="#080706" />
                <circle cx="19" cy="8" r="1.8" fill="#080706" />
              </svg>
            </button>
          </div>
        </div>
        <HomeRule />
        <h1 className="home-wordmark">АРКАНУМ</h1>
        <p className="home-subtitle">Оккультный терминал</p>
      </header>
      <HomeScene />
      <div className="home-invitation">
        <p className="home-quotation">
          «Иногда ответ приходит
          <br />
          не в словах, а в образах.»
        </p>
        <button className="home-enter" onClick={onQuestion}>
          <Icon name="star" size={17} />
          <span>Задать вопрос</span>
          <Icon name="arrow" size={18} />
        </button>
        {onResume && (
          <button className="home-resume" onClick={onResume}>
            Продолжить свой расклад
          </button>
        )}
      </div>
    </section>
  );
}
