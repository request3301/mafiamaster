"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ConceptId = "deck" | "focus" | "table";
type Phase = "speech" | "vote";
type Role = "Мирный" | "Мафия" | "Дон" | "Шериф";

type Player = {
  seat: number;
  name: string;
  role: Role;
  fouls: number;
  nomination: number | null;
  votes: number;
};

type ToastState = {
  message: string;
  snapshot: Player[];
} | null;

const concepts: Array<{
  id: ConceptId;
  number: string;
  name: string;
  eyebrow: string;
  description: string;
  strengths: string[];
  recommended?: boolean;
}> = [
  {
    id: "deck",
    number: "01",
    name: "Пульт",
    eyebrow: "Скорость и контроль",
    description:
      "Плотный профессиональный экран: весь стол, таймер и частые действия видны одновременно.",
    strengths: ["всё перед глазами", "минимум переходов", "для турниров"],
    recommended: true,
  },
  {
    id: "focus",
    number: "02",
    name: "Фокус",
    eyebrow: "Спокойный сценарий",
    description:
      "Интерфейс ведёт мастера по одному шагу за раз и снижает нагрузку во время напряжённой игры.",
    strengths: ["легко освоить", "крупные действия", "меньше ошибок"],
  },
  {
    id: "table",
    number: "03",
    name: "Стол",
    eyebrow: "Пространственная память",
    description:
      "Места игроков повторяют реальный стол, поэтому нужный номер находится почти автоматически.",
    strengths: ["физическая метафора", "быстрый выбор", "выразительный стиль"],
  },
];

const initialPlayers: Player[] = [
  { seat: 1, name: "Анна", role: "Мирный", fouls: 0, nomination: null, votes: 0 },
  { seat: 2, name: "Борис", role: "Мафия", fouls: 1, nomination: 1, votes: 2 },
  { seat: 3, name: "Вика", role: "Мирный", fouls: 0, nomination: null, votes: 0 },
  { seat: 4, name: "Глеб", role: "Шериф", fouls: 2, nomination: null, votes: 0 },
  { seat: 5, name: "Дана", role: "Мирный", fouls: 0, nomination: 2, votes: 3 },
  { seat: 6, name: "Егор", role: "Мирный", fouls: 1, nomination: null, votes: 0 },
  { seat: 7, name: "Жанна", role: "Дон", fouls: 0, nomination: null, votes: 0 },
  { seat: 8, name: "Илья", role: "Мафия", fouls: 1, nomination: 3, votes: 0 },
  { seat: 9, name: "Кира", role: "Мирный", fouls: 0, nomination: null, votes: 0 },
  { seat: 10, name: "Лев", role: "Мирный", fouls: 0, nomination: null, votes: 0 },
];

function formatTimer(seconds: number) {
  return `00:${String(seconds).padStart(2, "0")}`;
}

function FoulMarks({ count, compact = false }: { count: number; compact?: boolean }) {
  return (
    <span className={`foul-marks ${compact ? "is-compact" : ""}`} aria-label={`${count} фола`}>
      {[0, 1, 2, 3].map((mark) => (
        <span key={mark} className={mark < count ? "is-filled" : ""} />
      ))}
    </span>
  );
}

function PhaseSwitch({ phase, onChange }: { phase: Phase; onChange: (phase: Phase) => void }) {
  return (
    <div className="phase-switch" role="group" aria-label="Этап игры">
      <button className={phase === "speech" ? "is-active" : ""} onClick={() => onChange("speech")}>
        Речи
      </button>
      <button className={phase === "vote" ? "is-active" : ""} onClick={() => onChange("vote")}>
        Голосование
      </button>
    </div>
  );
}

function TimerButtons({
  running,
  seconds,
  onToggle,
  onReset,
}: {
  running: boolean;
  seconds: number;
  onToggle: () => void;
  onReset: () => void;
}) {
  const primaryLabel = seconds === 0 ? "Снова" : running ? "Пауза" : seconds < 60 ? "Продолжить" : "Старт";

  return (
    <div className="timer-buttons">
      <button className="timer-primary" onClick={onToggle} aria-label={`${primaryLabel} таймер`}>
        <span aria-hidden="true">{running ? "Ⅱ" : "▶"}</span>
        {primaryLabel}
      </button>
      <button className="timer-reset" onClick={onReset} aria-label="Сбросить таймер">
        ↺
      </button>
    </div>
  );
}

function NominationLine({ nominees }: { nominees: Player[] }) {
  return (
    <div className="nomination-line">
      <span>На голосовании</span>
      <strong>
        {nominees.length
          ? nominees.map((player) => `№${player.seat}`).join("  →  ")
          : "никого"}
      </strong>
    </div>
  );
}

function DeckConcept(props: PrototypeProps) {
  const {
    players,
    currentSeat,
    selectedSeat,
    selectedPlayer,
    nominees,
    seconds,
    running,
    phase,
    rolesVisible,
    onSelect,
    onPhase,
    onToggleTimer,
    onResetTimer,
    onFoul,
    onNominate,
    onVote,
    onNext,
    onNextNominee,
    onToggleRoles,
  } = props;

  return (
    <section className={`prototype deck-prototype ${seconds <= 10 ? "is-warning" : ""}`}>
      <header className="deck-header">
        <div>
          <span>ИГРА 024</span>
          <strong>Круг 2</strong>
        </div>
        <PhaseSwitch phase={phase} onChange={onPhase} />
        <button className="icon-button" aria-label="История действий">↶</button>
      </header>

      <div className="deck-timer">
        <div className="timer-kicker">
          <span className="live-dot" />
          {phase === "speech" ? `Говорит игрок №${currentSeat}` : "Распределите голоса"}
        </div>
        <div className="timer-value" aria-live={seconds <= 10 ? "assertive" : "off"}>
          {formatTimer(seconds)}
        </div>
        <div className="linear-progress" aria-hidden="true">
          <span style={{ width: `${Math.max(0, (seconds / (phase === "speech" ? 60 : 10)) * 100)}%` }} />
        </div>
        <TimerButtons running={running} seconds={seconds} onToggle={onToggleTimer} onReset={onResetTimer} />
      </div>

      <div className="deck-section-title">
        <span>Стол · 10 игроков</span>
        <button onClick={onToggleRoles}>{rolesVisible ? "Скрыть роли" : "Показать роли"}</button>
      </div>

      <div className="deck-player-grid">
        {players.map((player) => (
          <button
            key={player.seat}
            className={`deck-player ${player.seat === currentSeat ? "is-current" : ""} ${
              player.seat === selectedSeat ? "is-selected" : ""
            } ${player.nomination ? "is-nominated" : ""}`}
            onClick={() => onSelect(player.seat)}
            aria-label={`Игрок ${player.seat}, ${player.name}, ${player.fouls} фола`}
          >
            {player.nomination && <span className="nomination-order">{player.nomination}</span>}
            <span className="player-number">{player.seat}</span>
            <span className="player-name">{player.name}</span>
            {rolesVisible ? <span className="role-label">{player.role}</span> : <FoulMarks count={player.fouls} compact />}
          </button>
        ))}
      </div>

      <NominationLine nominees={nominees} />

      <div className="deck-console">
        <div className="selected-copy">
          <span>Выбран игрок</span>
          <strong>№{selectedPlayer.seat} · {selectedPlayer.name}</strong>
        </div>
        {phase === "speech" ? (
          <div className="console-actions">
            <button onClick={() => onFoul(selectedPlayer.seat)}>+ Фол №{selectedPlayer.seat}</button>
            <button className="accent" onClick={() => onNominate(selectedPlayer.seat)}>
              {selectedPlayer.nomination ? `Снять №${selectedPlayer.seat}` : `Выставить №${selectedPlayer.seat}`}
            </button>
            <button className="wide" onClick={onNext}>Следующий игрок →</button>
          </div>
        ) : (
          <div className="console-actions vote-actions">
            <button onClick={() => onVote(selectedPlayer.seat, -1)}>− Голос</button>
            <strong>{selectedPlayer.votes}</strong>
            <button className="accent" onClick={() => onVote(selectedPlayer.seat, 1)}>+ Голос</button>
            <button className="wide" onClick={onNextNominee}>Следующий кандидат →</button>
          </div>
        )}
      </div>
    </section>
  );
}

function FocusConcept(props: PrototypeProps) {
  const {
    players,
    currentSeat,
    selectedSeat,
    selectedPlayer,
    nominees,
    seconds,
    running,
    phase,
    onSelect,
    onPhase,
    onToggleTimer,
    onResetTimer,
    onFoul,
    onNominate,
    onVote,
    onNext,
    onNextNominee,
  } = props;

  const heroPlayer = phase === "speech" ? players.find((player) => player.seat === currentSeat)! : selectedPlayer;

  return (
    <section className={`prototype focus-prototype ${seconds <= 10 ? "is-warning" : ""}`}>
      <header className="focus-header">
        <div>
          <span>КРУГ 2</span>
          <strong>{phase === "speech" ? "Речь" : "Голосование"}</strong>
        </div>
        <span className="focus-progress">{phase === "speech" ? `${currentSeat} из 10` : `${nominees.length} кандидата`}</span>
        <button className="focus-menu" aria-label="Открыть сводку">•••</button>
      </header>

      <div className="focus-phase-row">
        <PhaseSwitch phase={phase} onChange={onPhase} />
      </div>

      <div className="speaker-hero">
        <div className="speaker-orbit">
          <span>ИГРОК</span>
          <strong>{heroPlayer.seat}</strong>
        </div>
        <div className="speaker-name">{heroPlayer.name}</div>
        <div className="speaker-status">
          {phase === "speech" ? "Сейчас говорит" : `${heroPlayer.votes} голосов записано`}
        </div>
      </div>

      <div className="focus-timer-block">
        <span>{seconds === 0 ? "Время вышло" : running ? "Речь идёт" : "Готово"}</span>
        <div className="focus-time" aria-live={seconds <= 10 ? "assertive" : "off"}>{formatTimer(seconds)}</div>
        <TimerButtons running={running} seconds={seconds} onToggle={onToggleTimer} onReset={onResetTimer} />
      </div>

      <div className="focus-actions">
        {phase === "speech" ? (
          <>
            <button onClick={() => onFoul(selectedPlayer.seat)}>
              <span>+</span>
              Фол игроку {selectedPlayer.seat}
            </button>
            <button onClick={() => onNominate(selectedPlayer.seat)}>
              <span>{selectedPlayer.nomination ? "×" : "↓"}</span>
              {selectedPlayer.nomination ? "Снять кандидатуру" : "Выставить игрока"}
            </button>
          </>
        ) : (
          <>
            <button onClick={() => onVote(selectedPlayer.seat, -1)}>
              <span>−</span>
              Убрать голос
            </button>
            <button onClick={() => onVote(selectedPlayer.seat, 1)}>
              <span>+</span>
              Добавить голос
            </button>
          </>
        )}
      </div>

      <div className="focus-table-summary">
        <div className="focus-summary-head">
          <div>
            <span>{phase === "speech" ? "Выберите игрока" : "Выберите кандидата"}</span>
            <strong>{selectedPlayer.name} · №{selectedPlayer.seat}</strong>
          </div>
          <FoulMarks count={selectedPlayer.fouls} />
        </div>
        <div className="focus-seat-grid">
          {players.map((player) => (
            <button
              key={player.seat}
              className={`${player.seat === selectedSeat ? "is-selected" : ""} ${
                player.seat === currentSeat ? "is-current" : ""
              }`}
              onClick={() => onSelect(player.seat)}
              aria-label={`Выбрать игрока ${player.seat}`}
            >
              {player.seat}
              {player.nomination && <sup>{player.nomination}</sup>}
            </button>
          ))}
        </div>
        <NominationLine nominees={nominees} />
      </div>

      <button className="focus-next" onClick={phase === "speech" ? onNext : onNextNominee}>
        {phase === "speech" ? "Следующий игрок" : "Записать и дальше"}
        <span>→</span>
      </button>
    </section>
  );
}

function TableConcept(props: PrototypeProps) {
  const {
    players,
    currentSeat,
    selectedSeat,
    selectedPlayer,
    nominees,
    seconds,
    running,
    phase,
    onSelect,
    onPhase,
    onToggleTimer,
    onResetTimer,
    onFoul,
    onNominate,
    onVote,
    onNext,
    onNextNominee,
  } = props;

  const tablePositions = [1, 2, 3, 4, 5, 10, 9, 8, 7, 6];

  return (
    <section className={`prototype table-prototype ${seconds <= 10 ? "is-warning" : ""}`}>
      <header className="table-header">
        <div>
          <span>ДЕНЬ 1</span>
          <strong>{phase === "speech" ? "Речи" : "Голосование"}</strong>
        </div>
        <PhaseSwitch phase={phase} onChange={onPhase} />
        <button aria-label="История действий">История</button>
      </header>

      <div className="table-stage">
        <div className="table-surface">
          <div className="table-grain" />
          <div className="table-center">
            <span>{phase === "speech" ? `Игрок ${currentSeat} говорит` : `Кандидат №${selectedSeat}`}</span>
            <strong aria-live={seconds <= 10 ? "assertive" : "off"}>{formatTimer(seconds)}</strong>
            <TimerButtons running={running} seconds={seconds} onToggle={onToggleTimer} onReset={onResetTimer} />
          </div>
        </div>

        <div className="table-seats">
          {tablePositions.map((seat, index) => {
            const player = players.find((candidate) => candidate.seat === seat)!;
            return (
              <button
                key={seat}
                className={`table-seat pos-${index + 1} ${seat === selectedSeat ? "is-selected" : ""} ${
                  seat === currentSeat ? "is-current" : ""
                }`}
                onClick={() => onSelect(seat)}
                aria-label={`Место ${seat}, ${player.name}, ${player.fouls} фола`}
              >
                {player.nomination && <span className="table-ballot">{player.nomination}</span>}
                <strong>{seat}</strong>
                <span>{player.name}</span>
                <FoulMarks count={player.fouls} compact />
              </button>
            );
          })}
        </div>
      </div>

      <NominationLine nominees={nominees} />

      <div className="table-context">
        <div className="table-player-copy">
          <div className="table-avatar">{selectedPlayer.seat}</div>
          <div>
            <span>Выбран</span>
            <strong>{selectedPlayer.name}</strong>
          </div>
          <FoulMarks count={selectedPlayer.fouls} />
        </div>
        {phase === "speech" ? (
          <div className="table-actions">
            <button onClick={() => onFoul(selectedPlayer.seat)}>+ Фол</button>
            <button onClick={() => onNominate(selectedPlayer.seat)}>
              {selectedPlayer.nomination ? "Снять" : "Выставить"}
            </button>
            <button className="table-primary" onClick={onNext}>Следующий →</button>
          </div>
        ) : (
          <div className="table-actions table-vote-actions">
            <button onClick={() => onVote(selectedPlayer.seat, -1)}>−</button>
            <strong>{selectedPlayer.votes}</strong>
            <button onClick={() => onVote(selectedPlayer.seat, 1)}>+</button>
            <button className="table-primary" onClick={onNextNominee}>Дальше →</button>
          </div>
        )}
      </div>
    </section>
  );
}

type PrototypeProps = {
  players: Player[];
  currentSeat: number;
  selectedSeat: number;
  selectedPlayer: Player;
  nominees: Player[];
  seconds: number;
  running: boolean;
  phase: Phase;
  rolesVisible: boolean;
  onSelect: (seat: number) => void;
  onPhase: (phase: Phase) => void;
  onToggleTimer: () => void;
  onResetTimer: () => void;
  onFoul: (seat: number) => void;
  onNominate: (seat: number) => void;
  onVote: (seat: number, delta: number) => void;
  onNext: () => void;
  onNextNominee: () => void;
  onToggleRoles: () => void;
};

export default function Home() {
  const [concept, setConcept] = useState<ConceptId>("deck");
  const [players, setPlayers] = useState(initialPlayers);
  const [currentSeat, setCurrentSeat] = useState(4);
  const [selectedSeat, setSelectedSeat] = useState(4);
  const [phase, setPhase] = useState<Phase>("speech");
  const [seconds, setSeconds] = useState(42);
  const [running, setRunning] = useState(false);
  const [rolesVisible, setRolesVisible] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const deadlineRef = useRef(0);

  const selectedPlayer = players.find((player) => player.seat === selectedSeat) ?? players[0];
  const nominees = useMemo(
    () => players.filter((player) => player.nomination !== null).sort((a, b) => a.nomination! - b.nomination!),
    [players],
  );
  const activeConcept = concepts.find((item) => item.id === concept)!;

  useEffect(() => {
    if (!running) return;

    const tick = () => {
      const next = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setSeconds(next);
      if (next === 0) setRunning(false);
    };

    tick();
    const interval = window.setInterval(tick, 150);
    return () => window.clearInterval(interval);
  }, [running]);

  const updatePlayers = (message: string, update: (players: Player[]) => Player[]) => {
    setToast({ message, snapshot: players });
    setPlayers(update(players));
  };

  const toggleTimer = () => {
    if (running) {
      setSeconds(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)));
      setRunning(false);
      return;
    }

    const nextSeconds = seconds === 0 ? (phase === "speech" ? 60 : 10) : seconds;
    setSeconds(nextSeconds);
    deadlineRef.current = Date.now() + nextSeconds * 1000;
    setRunning(true);
  };

  const resetTimer = () => {
    setRunning(false);
    setSeconds(phase === "speech" ? 60 : 10);
  };

  const changePhase = (nextPhase: Phase) => {
    setPhase(nextPhase);
    setRunning(false);
    setSeconds(nextPhase === "speech" ? 60 : 10);
    if (nextPhase === "vote" && nominees.length) setSelectedSeat(nominees[0].seat);
  };

  const addFoul = (seat: number) => {
    const player = players.find((candidate) => candidate.seat === seat)!;
    updatePlayers(`Игроку №${seat} добавлен фол`, (current) =>
      current.map((candidate) =>
        candidate.seat === seat ? { ...candidate, fouls: Math.min(4, candidate.fouls + 1) } : candidate,
      ),
    );
    if (player.fouls >= 3) setToast({ message: `4-й фол: игрок №${seat} покидает стол`, snapshot: players });
  };

  const toggleNomination = (seat: number) => {
    const player = players.find((candidate) => candidate.seat === seat)!;
    const nextOrder = nominees.length ? Math.max(...nominees.map((candidate) => candidate.nomination!)) + 1 : 1;
    updatePlayers(
      player.nomination ? `Игрок №${seat} снят с голосования` : `Игрок №${seat} выставлен ${nextOrder}-м`,
      (current) =>
        current.map((candidate) =>
          candidate.seat === seat
            ? { ...candidate, nomination: candidate.nomination ? null : nextOrder }
            : candidate,
        ),
    );
  };

  const changeVote = (seat: number, delta: number) => {
    updatePlayers(`Голоса игрока №${seat} изменены`, (current) =>
      current.map((candidate) =>
        candidate.seat === seat ? { ...candidate, votes: Math.max(0, candidate.votes + delta) } : candidate,
      ),
    );
  };

  const nextSpeaker = () => {
    const next = currentSeat === 10 ? 1 : currentSeat + 1;
    setCurrentSeat(next);
    setSelectedSeat(next);
    setRunning(false);
    setSeconds(60);
  };

  const nextNominee = () => {
    if (!nominees.length) return;
    const currentIndex = nominees.findIndex((player) => player.seat === selectedSeat);
    setSelectedSeat(nominees[(currentIndex + 1 + nominees.length) % nominees.length].seat);
  };

  const sharedProps: PrototypeProps = {
    players,
    currentSeat,
    selectedSeat,
    selectedPlayer,
    nominees,
    seconds,
    running,
    phase,
    rolesVisible,
    onSelect: setSelectedSeat,
    onPhase: changePhase,
    onToggleTimer: toggleTimer,
    onResetTimer: resetTimer,
    onFoul: addFoul,
    onNominate: toggleNomination,
    onVote: changeVote,
    onNext: nextSpeaker,
    onNextNominee: nextNominee,
    onToggleRoles: () => setRolesVisible((visible) => !visible),
  };

  return (
    <main className="prototype-lab">
      <div className="lab-ambient lab-ambient-one" />
      <div className="lab-ambient lab-ambient-two" />

      <header className="lab-brand">
        <div className="brand-mark"><span>M</span></div>
        <div>
          <strong>MAFIA MASTER</strong>
          <span>Лаборатория интерфейса</span>
        </div>
        <div className="prototype-status"><span /> Прототип</div>
      </header>

      <div className="lab-layout">
        <aside className="lab-sidebar">
          <div className="lab-intro">
            <span className="lab-overline">ТРИ НАПРАВЛЕНИЯ · ОДИН СЦЕНАРИЙ</span>
            <h1>Как должен ощущаться идеальный пульт ведущего?</h1>
            <p>
              Переключайте варианты и нажимайте на игроков. Таймер, фолы, кандидаты и голоса работают — состояние сохраняется между концептами для честного сравнения.
            </p>
          </div>

          <nav className="concept-list" aria-label="Варианты интерфейса">
            {concepts.map((item) => (
              <button
                key={item.id}
                className={concept === item.id ? "is-active" : ""}
                onClick={() => setConcept(item.id)}
              >
                <span className="concept-number">{item.number}</span>
                <span className="concept-button-copy">
                  <strong>{item.name}</strong>
                  <small>{item.eyebrow}</small>
                </span>
                {item.recommended && <span className="recommended-pill">старт</span>}
                <span className="concept-arrow">↗</span>
              </button>
            ))}
          </nav>

          <div className="concept-detail" aria-live="polite">
            <div className="concept-detail-head">
              <span>{activeConcept.number}</span>
              <div>
                <small>{activeConcept.eyebrow}</small>
                <h2>{activeConcept.name}</h2>
              </div>
            </div>
            <p>{activeConcept.description}</p>
            <div className="strength-list">
              {activeConcept.strengths.map((strength) => <span key={strength}>{strength}</span>)}
            </div>
          </div>
        </aside>

        <section className="device-column" aria-label={`Прототип ${activeConcept.name}`}>
          <div className="mobile-concept-switcher">
            {concepts.map((item) => (
              <button key={item.id} className={concept === item.id ? "is-active" : ""} onClick={() => setConcept(item.id)}>
                {item.name}
              </button>
            ))}
          </div>
          <div className="device-caption">
            <div><span>Сейчас смотрим</span><strong>{activeConcept.name}</strong></div>
            <span>390 × 844</span>
          </div>
          <div className={`phone-frame concept-${concept}`}>
            <div className="phone-speaker" />
            <div className="phone-screen">
              {concept === "deck" && <DeckConcept {...sharedProps} />}
              {concept === "focus" && <FocusConcept {...sharedProps} />}
              {concept === "table" && <TableConcept {...sharedProps} />}
              {toast && (
                <div className="undo-toast" role="status">
                  <span>{toast.message}</span>
                  <button
                    onClick={() => {
                      setPlayers(toast.snapshot);
                      setToast(null);
                    }}
                  >
                    Отменить
                  </button>
                  <button className="toast-close" aria-label="Закрыть сообщение" onClick={() => setToast(null)}>×</button>
                </div>
              )}
            </div>
          </div>
          <p className="device-hint">Попробуйте: запустите таймер, выберите игрока №7, добавьте фол и перейдите к голосованию.</p>
        </section>
      </div>
    </main>
  );
}
