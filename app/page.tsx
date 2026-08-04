"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Variant = "direct" | "guided" | "ledger";
type Scene = "speech" | "vote" | "tie" | "night";
type TieStage = "speeches" | "revote" | "lift";
type NightAction = "shot" | "don" | "sheriff";
type Role = "Мирный" | "Мафия" | "Дон" | "Шериф";
type VoteMap = Record<number, number[]>;

type Player = {
  seat: number;
  name: string;
  role: Role;
  fouls: number;
  nomination: number | null;
};

type GameSnapshot = {
  players: Player[];
  currentSeat: number;
  selectedSeat: number;
  scene: Scene;
  tieStage: TieStage;
  nightAction: NightAction;
  seconds: number;
  voteMap: VoteMap;
  revoteMap: VoteMap;
  liftVoters: number[];
  eventLog: string[];
  nightRecords: string[];
};

type ToastState = {
  message: string;
  snapshot?: GameSnapshot;
} | null;

const variants: Array<{ id: Variant; letter: string; name: string; note: string }> = [
  { id: "direct", letter: "A", name: "На столе", note: "минимум шагов" },
  { id: "guided", letter: "B", name: "По шагам", note: "меньше ошибок" },
  { id: "ledger", letter: "C", name: "Протокол", note: "полная история" },
];

const scenes: Array<{ id: Scene; name: string }> = [
  { id: "speech", name: "Речь" },
  { id: "vote", name: "Голосование" },
  { id: "tie", name: "Попил" },
  { id: "night", name: "Ночь" },
];

const initialPlayers: Player[] = [
  { seat: 1, name: "Анна", role: "Мирный", fouls: 0, nomination: null },
  { seat: 2, name: "Борис", role: "Мафия", fouls: 1, nomination: 1 },
  { seat: 3, name: "Вика", role: "Мирный", fouls: 0, nomination: null },
  { seat: 4, name: "Глеб", role: "Шериф", fouls: 2, nomination: null },
  { seat: 5, name: "Дана", role: "Мирный", fouls: 0, nomination: 2 },
  { seat: 6, name: "Егор", role: "Мирный", fouls: 1, nomination: null },
  { seat: 7, name: "Жанна", role: "Дон", fouls: 0, nomination: null },
  { seat: 8, name: "Илья", role: "Мафия", fouls: 1, nomination: 3 },
  { seat: 9, name: "Кира", role: "Мирный", fouls: 0, nomination: null },
  { seat: 10, name: "Лев", role: "Мирный", fouls: 0, nomination: null },
];

const seatOrder = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const initialVoteMap: VoteMap = {
  2: [1, 3, 4, 6],
  5: [2, 7, 9, 10],
  8: [5, 8],
};
const initialRevoteMap: VoteMap = {
  2: [1, 3, 6, 7, 10],
  5: [2, 4, 5, 8, 9],
};

function FoulMarks({ count }: { count: number }) {
  return (
    <span className="foul-marks" aria-label={`Фолов: ${count}`}>
      {[0, 1, 2, 3].map((mark) => <span key={mark} className={mark < count ? "is-filled" : ""} />)}
    </span>
  );
}

function voteWord(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "голосов";
  if (last === 1) return "голос";
  if (last >= 2 && last <= 4) return "голоса";
  return "голосов";
}

function nextActiveSeat(currentSeat: number, players: Player[]) {
  for (let offset = 1; offset <= players.length; offset += 1) {
    const seat = ((currentSeat - 1 + offset) % players.length) + 1;
    const player = players.find((candidate) => candidate.seat === seat);
    if (player && player.fouls < 4) return seat;
  }
  return currentSeat;
}

function assignmentFor(voter: number, votes: VoteMap) {
  const entry = Object.entries(votes).find(([, voters]) => voters.includes(voter));
  return entry ? Number(entry[0]) : null;
}

function tiedSeats(candidates: Player[], votes: VoteMap) {
  if (!candidates.length) return [];
  const highest = Math.max(...candidates.map((candidate) => votes[candidate.seat]?.length ?? 0));
  return candidates.filter((candidate) => (votes[candidate.seat]?.length ?? 0) === highest).map((candidate) => candidate.seat);
}

export default function Home() {
  const [variant, setVariant] = useState<Variant>("direct");
  const [scene, setScene] = useState<Scene>("speech");
  const [players, setPlayers] = useState(initialPlayers);
  const [currentSeat, setCurrentSeat] = useState(1);
  const [selectedSeat, setSelectedSeat] = useState(1);
  const [seconds, setSeconds] = useState(60);
  const [running, setRunning] = useState(false);
  const [voteMap, setVoteMap] = useState<VoteMap>(initialVoteMap);
  const [revoteMap, setRevoteMap] = useState<VoteMap>(initialRevoteMap);
  const [voteCandidateSeat, setVoteCandidateSeat] = useState(2);
  const [tieCandidateSeat, setTieCandidateSeat] = useState(2);
  const [tieStage, setTieStage] = useState<TieStage>("speeches");
  const [tieSpeechIndex, setTieSpeechIndex] = useState(0);
  const [liftVoters, setLiftVoters] = useState<number[]>([1, 4, 5, 9]);
  const [nightAction, setNightAction] = useState<NightAction>("shot");
  const [nightTarget, setNightTarget] = useState(6);
  const [nightShooter, setNightShooter] = useState(2);
  const [nightRecords, setNightRecords] = useState<string[]>(["Дон №7 → №4", "Шериф №4 → №8"]);
  const [eventLog, setEventLog] = useState<string[]>([
    "Игрок №8 выставлен третьим",
    "Игроку №4 добавлен второй фол",
    "Началась речь игрока №1",
  ]);
  const [pendingFoulSeat, setPendingFoulSeat] = useState<number | null>(null);
  const [purchaseSeat, setPurchaseSeat] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const deadlineRef = useRef(0);

  const selectedPlayer = players.find((player) => player.seat === selectedSeat) ?? players[0];
  const currentPlayer = players.find((player) => player.seat === currentSeat) ?? players[0];
  const nominees = useMemo(
    () => players.filter((player) => player.nomination !== null).sort((a, b) => a.nomination! - b.nomination!),
    [players],
  );
  const voteTieSeats = useMemo(() => tiedSeats(nominees, voteMap), [nominees, voteMap]);
  const popilSeats = voteTieSeats.length > 1 ? voteTieSeats : nominees.slice(0, 2).map((player) => player.seat);
  const nextSpeakerSeat = nextActiveSeat(currentSeat, players);
  const activePlayers = players.filter((player) => player.fouls < 4);
  const majority = Math.floor(activePlayers.length / 2) + 1;
  const isTimedScene = scene === "speech" || (scene === "tie" && tieStage === "speeches");
  const timerLimit = scene === "tie" ? 30 : 60;
  const timerProgress = Math.max(0, Math.min(100, (seconds / Math.max(timerLimit, seconds)) * 100));
  const isWarning = isTimedScene && seconds <= 10;
  const activeVoteMap = scene === "vote" ? voteMap : revoteMap;
  const activeCandidateSeat = scene === "vote" ? voteCandidateSeat : tieCandidateSeat;
  const activeCandidateVotes = activeVoteMap[activeCandidateSeat]?.length ?? 0;
  const currentCandidateList = scene === "vote" ? nominees.map((player) => player.seat) : popilSeats;
  const currentCandidateIndex = Math.max(0, currentCandidateList.indexOf(activeCandidateSeat));
  const sheriffSeat = players.find((player) => player.role === "Шериф")?.seat ?? 4;
  const donSeat = players.find((player) => player.role === "Дон")?.seat ?? 7;
  const mafiaSeats = players.filter((player) => player.role === "Мафия" || player.role === "Дон").map((player) => player.seat);
  const nightActor = nightAction === "shot" ? nightShooter : nightAction === "don" ? donSeat : sheriffSeat;

  const makeSnapshot = (): GameSnapshot => ({
    players,
    currentSeat,
    selectedSeat,
    scene,
    tieStage,
    nightAction,
    seconds,
    voteMap,
    revoteMap,
    liftVoters,
    eventLog,
    nightRecords,
  });

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

  const addLog = (entry: string) => setEventLog((current) => [entry, ...current].slice(0, 8));

  const toggleTimer = () => {
    if (running) {
      setSeconds(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)));
      setRunning(false);
      return;
    }
    const nextSeconds = seconds === 0 ? timerLimit : seconds;
    setSeconds(nextSeconds);
    deadlineRef.current = Date.now() + nextSeconds * 1000;
    setRunning(true);
  };

  const resetTimer = () => {
    setRunning(false);
    setSeconds(timerLimit);
    setToast({ message: `Таймер сброшен на ${timerLimit} секунд` });
  };

  const changeScene = (nextScene: Scene) => {
    setScene(nextScene);
    setRunning(false);
    if (nextScene === "speech") {
      setSeconds(60);
      setSelectedSeat(currentSeat);
    } else if (nextScene === "vote") {
      setVoteCandidateSeat(nominees[0]?.seat ?? 2);
    } else if (nextScene === "tie") {
      setTieStage("speeches");
      setTieSpeechIndex(0);
      setSelectedSeat(popilSeats[0] ?? 2);
      setSeconds(30);
    } else {
      setNightAction("shot");
      setNightTarget(6);
    }
  };

  const commitFoul = (seat: number) => {
    const player = players.find((candidate) => candidate.seat === seat)!;
    if (player.fouls >= 4) return;
    const before = makeSnapshot();
    const nextFouls = player.fouls + 1;
    setPlayers((current) => current.map((candidate) => candidate.seat === seat ? { ...candidate, fouls: nextFouls } : candidate));
    const message = nextFouls === 4 ? `4-й фол: игрок №${seat} покидает стол` : `Игроку №${seat} добавлен ${nextFouls}-й фол`;
    addLog(message);
    setToast({ message, snapshot: before });
    setPendingFoulSeat(null);
  };

  const requestFoul = (seat: number) => {
    if (variant === "guided") setPendingFoulSeat(seat);
    else commitFoul(seat);
  };

  const toggleNomination = (seat: number) => {
    const player = players.find((candidate) => candidate.seat === seat)!;
    if (player.fouls >= 4) return;
    const before = makeSnapshot();
    const nextOrder = nominees.length ? Math.max(...nominees.map((candidate) => candidate.nomination!)) + 1 : 1;
    setPlayers((current) => current.map((candidate) => candidate.seat === seat
      ? { ...candidate, nomination: candidate.nomination ? null : nextOrder }
      : candidate));
    if (!player.nomination) setVoteMap((current) => ({ ...current, [seat]: current[seat] ?? [] }));
    const message = player.nomination ? `Игрок №${seat} снят с голосования` : `Игрок №${seat} выставлен ${nextOrder}-м`;
    addLog(message);
    setToast({ message, snapshot: before });
  };

  const transferSpeech = (seat: number) => {
    const before = makeSnapshot();
    setCurrentSeat(seat);
    setSelectedSeat(seat);
    setSeconds(60);
    setRunning(false);
    const message = `Речь передана игроку №${seat} · готово 60 секунд`;
    addLog(message);
    setToast({ message, snapshot: before });
  };

  const confirmPurchase = () => {
    if (purchaseSeat === null) return;
    const player = players.find((candidate) => candidate.seat === purchaseSeat)!;
    const before = makeSnapshot();
    const nextFouls = Math.min(4, player.fouls + 2);
    setPlayers((current) => current.map((candidate) => candidate.seat === purchaseSeat ? { ...candidate, fouls: nextFouls } : candidate));
    setSeconds((current) => current + 30);
    if (running) deadlineRef.current += 30_000;
    const message = `Игрок №${purchaseSeat}: +30 секунд и +2 фола`;
    addLog(message);
    setToast({ message, snapshot: before });
    setPurchaseSeat(null);
  };

  const toggleVoter = (candidateSeat: number, voterSeat: number, kind: "vote" | "revote") => {
    const setter = kind === "vote" ? setVoteMap : setRevoteMap;
    setter((current) => {
      const alreadyHere = current[candidateSeat]?.includes(voterSeat) ?? false;
      const next: VoteMap = {};
      Object.entries(current).forEach(([seat, voters]) => {
        next[Number(seat)] = voters.filter((voter) => voter !== voterSeat);
      });
      if (!alreadyHere) next[candidateSeat] = [...(next[candidateSeat] ?? []), voterSeat].sort((a, b) => a - b);
      return next;
    });
  };

  const advanceVote = () => {
    if (currentCandidateIndex < currentCandidateList.length - 1) {
      const next = currentCandidateList[currentCandidateIndex + 1];
      if (scene === "vote") setVoteCandidateSeat(next);
      else setTieCandidateSeat(next);
      setToast({ message: `Теперь голоса за игрока №${next}` });
      return;
    }

    if (scene === "vote") {
      const ties = tiedSeats(nominees, voteMap);
      if (ties.length > 1) {
        setScene("tie");
        setTieStage("speeches");
        setTieSpeechIndex(0);
        setSelectedSeat(ties[0]);
        setSeconds(30);
        setRunning(false);
        setToast({ message: `Попил: игроки ${ties.map((seat) => `№${seat}`).join(" и ")}` });
      } else {
        setToast({ message: `Голосование завершено: большинство у игрока №${ties[0]}` });
      }
      return;
    }

    const repeatTies = tiedSeats(nominees.filter((player) => popilSeats.includes(player.seat)), revoteMap);
    if (repeatTies.length > 1) {
      setTieStage("lift");
      setToast({ message: "Повторный попил: голосуем за подъём обоих" });
    } else {
      setToast({ message: `Переголосование завершено: игрок №${repeatTies[0]} покидает стол` });
    }
  };

  const advanceTieSpeech = () => {
    if (tieSpeechIndex < popilSeats.length - 1) {
      const nextIndex = tieSpeechIndex + 1;
      setTieSpeechIndex(nextIndex);
      setSelectedSeat(popilSeats[nextIndex]);
      setSeconds(30);
      setRunning(false);
      setToast({ message: `Теперь 30 секунд игроку №${popilSeats[nextIndex]}` });
    } else {
      setTieStage("revote");
      setTieCandidateSeat(popilSeats[0]);
      setRunning(false);
      setToast({ message: "Речи закончены · начинаем переголосование" });
    }
  };

  const toggleLiftVoter = (seat: number) => {
    setLiftVoters((current) => current.includes(seat) ? current.filter((voter) => voter !== seat) : [...current, seat].sort((a, b) => a - b));
  };

  const confirmNightRecord = () => {
    if ((nightAction === "don" || nightAction === "sheriff") && nightActor === nightTarget) {
      setToast({ message: "Проверяющий и цель не могут совпадать" });
      return;
    }
    const before = makeSnapshot();
    const label = nightAction === "shot"
      ? `Отстрел: №${nightActor} → №${nightTarget}`
      : `${nightAction === "don" ? "Дон" : "Шериф"} №${nightActor} → №${nightTarget}`;
    setNightRecords((current) => [label, ...current]);
    addLog(label);
    setToast({ message: `${label} · записано`, snapshot: before });
    if (nightAction === "shot") {
      const shooterIndex = mafiaSeats.indexOf(nightShooter);
      setNightShooter(mafiaSeats[(shooterIndex + 1) % mafiaSeats.length]);
    } else if (nightAction === "don") {
      setNightAction("sheriff");
    }
  };

  const restoreSnapshot = (gameSnapshot: GameSnapshot) => {
    setPlayers(gameSnapshot.players);
    setCurrentSeat(gameSnapshot.currentSeat);
    setSelectedSeat(gameSnapshot.selectedSeat);
    setScene(gameSnapshot.scene);
    setTieStage(gameSnapshot.tieStage);
    setNightAction(gameSnapshot.nightAction);
    setSeconds(gameSnapshot.seconds);
    setVoteMap(gameSnapshot.voteMap);
    setRevoteMap(gameSnapshot.revoteMap);
    setLiftVoters(gameSnapshot.liftVoters);
    setEventLog(gameSnapshot.eventLog);
    setNightRecords(gameSnapshot.nightRecords);
    setRunning(false);
    setToast(null);
  };

  const handleSeatClick = (seat: number) => {
    if (scene === "vote") {
      toggleVoter(voteCandidateSeat, seat, "vote");
    } else if (scene === "tie" && tieStage === "revote") {
      toggleVoter(tieCandidateSeat, seat, "revote");
    } else if (scene === "tie" && tieStage === "lift") {
      toggleLiftVoter(seat);
    } else if (scene === "night") {
      setNightTarget(seat);
    } else if (scene === "tie") {
      if (popilSeats.includes(seat)) setSelectedSeat(seat);
    } else {
      setSelectedSeat(seat);
    }
  };

  const renderCandidateRail = (kind: "vote" | "revote") => {
    const candidates = kind === "vote" ? nominees.map((player) => player.seat) : popilSeats;
    const map = kind === "vote" ? voteMap : revoteMap;
    const active = kind === "vote" ? voteCandidateSeat : tieCandidateSeat;
    return (
      <div className="candidate-rail" aria-label="Кандидатуры по порядку">
        {candidates.map((seat, index) => (
          <button
            key={seat}
            className={active === seat ? "is-active" : ""}
            onClick={() => kind === "vote" ? setVoteCandidateSeat(seat) : setTieCandidateSeat(seat)}
          >
            <span>{index + 1}</span>
            <strong>№{seat}</strong>
            <small>{map[seat]?.length ?? 0}</small>
          </button>
        ))}
      </div>
    );
  };

  const renderPlayerGrid = (mode: "select" | "vote" | "lift" | "target") => (
    <div className="player-number-grid">
      {players.map((player) => {
        const voteAssignment = mode === "vote" ? assignmentFor(player.seat, activeVoteMap) : null;
        const active = mode === "select"
          ? selectedSeat === player.seat
          : mode === "lift"
            ? liftVoters.includes(player.seat)
            : mode === "target"
              ? nightTarget === player.seat
              : voteAssignment === activeCandidateSeat;
        return (
          <button
            key={player.seat}
            className={active ? "is-active" : ""}
            disabled={player.fouls >= 4 || (scene === "tie" && tieStage === "speeches" && !popilSeats.includes(player.seat))}
            onClick={() => handleSeatClick(player.seat)}
          >
            {player.seat}
            {voteAssignment && <small>→{voteAssignment}</small>}
          </button>
        );
      })}
    </div>
  );

  const timerStatus = seconds === 0 ? "Время вышло" : running ? "Таймер идёт" : "Готов к старту";
  let centerEyebrow = "";
  let centerValue = "";
  let centerNote = "";
  if (scene === "vote") {
    centerEyebrow = `Кандидат ${currentCandidateIndex + 1} из ${nominees.length}`;
    centerValue = `№${voteCandidateSeat}`;
    centerNote = `${activeCandidateVotes} ${voteWord(activeCandidateVotes)}`;
  } else if (scene === "tie" && tieStage === "revote") {
    centerEyebrow = "Переголосование";
    centerValue = `№${tieCandidateSeat}`;
    centerNote = `${activeCandidateVotes} ${voteWord(activeCandidateVotes)}`;
  } else if (scene === "tie" && tieStage === "lift") {
    centerEyebrow = `Поднять ${popilSeats.map((seat) => `№${seat}`).join(" и ")}?`;
    centerValue = `${liftVoters.length}`;
    centerNote = `за · нужно ${majority}`;
  } else if (scene === "night") {
    centerEyebrow = nightAction === "shot" ? "Отстрел" : `Проверка ${nightAction === "don" ? "Дона" : "Шерифа"}`;
    centerValue = `№${nightActor} → №${nightTarget}`;
    centerNote = "выберите цель на столе";
  }

  const seatVoteMap = scene === "vote" ? voteMap : revoteMap;
  const seatCandidate = scene === "vote" ? voteCandidateSeat : tieCandidateSeat;

  const directPanel = (
    <section className="control-panel direct-panel">
      {scene === "speech" && (
        <>
          <div className="selected-player">
            <div className="selected-number">{selectedPlayer.seat}</div>
            <div className="selected-copy"><span>{selectedSeat === currentSeat ? "Сейчас говорит" : "Выбран игрок"}</span><strong>{selectedPlayer.name}</strong></div>
            <div className="selected-fouls"><span>{selectedPlayer.fouls} / 4 фола</span><FoulMarks count={selectedPlayer.fouls} /></div>
          </div>
          <div className="quick-actions is-three">
            <button onClick={() => requestFoul(selectedSeat)} disabled={selectedPlayer.fouls >= 4}><span>+</span>Фол №{selectedSeat}</button>
            <button onClick={() => toggleNomination(selectedSeat)} disabled={selectedPlayer.fouls >= 4}><span>{selectedPlayer.nomination ? "×" : "↓"}</span>{selectedPlayer.nomination ? "Снять" : "Выставить"} №{selectedSeat}</button>
            <button onClick={() => setPurchaseSeat(currentSeat)}><span>+30</span>За 2 фола</button>
          </div>
          <button className="primary-action" onClick={() => transferSpeech(selectedSeat === currentSeat ? nextSpeakerSeat : selectedSeat)}>
            <span><small>{selectedSeat === currentSeat ? "Завершить текущую речь" : "Таймер остановится"}</small>{selectedSeat === currentSeat ? `Следующий: игрок №${nextSpeakerSeat}` : `Передать речь игроку №${selectedSeat}`}</span><strong>→</strong>
          </button>
        </>
      )}
      {scene === "vote" && (
        <>
          {renderCandidateRail("vote")}
          <div className="workflow-instruction"><div><span>Тапайте по местам</span><strong>Кто голосует против №{voteCandidateSeat}?</strong></div><b>{activeCandidateVotes}</b></div>
          <div className="assignment-copy">Выбраны: {voteMap[voteCandidateSeat]?.length ? voteMap[voteCandidateSeat].map((seat) => `№${seat}`).join(", ") : "никто"}</div>
          <button className="primary-action" onClick={advanceVote}><span><small>Записать {activeCandidateVotes} {voteWord(activeCandidateVotes)}</small>{currentCandidateIndex < currentCandidateList.length - 1 ? `Следующая кандидатура: №${currentCandidateList[currentCandidateIndex + 1]}` : "Завершить голосование"}</span><strong>→</strong></button>
        </>
      )}
      {scene === "tie" && (
        <>
          <div className="stage-tabs"><button className={tieStage === "speeches" ? "is-active" : ""} onClick={() => { setTieStage("speeches"); setSeconds(30); }}>Речи · 30с</button><button className={tieStage === "revote" ? "is-active" : ""} onClick={() => setTieStage("revote")}>Переголосование</button><button className={tieStage === "lift" ? "is-active" : ""} onClick={() => setTieStage("lift")}>Поднять обоих</button></div>
          {tieStage === "speeches" && <button className="primary-action" onClick={advanceTieSpeech}><span><small>Попил · речь игрока №{selectedSeat}</small>{tieSpeechIndex < popilSeats.length - 1 ? `Дать 30 секунд игроку №${popilSeats[tieSpeechIndex + 1]}` : "Перейти к переголосованию"}</span><strong>→</strong></button>}
          {tieStage === "revote" && <>{renderCandidateRail("revote")}<div className="workflow-instruction"><div><span>Тапайте по местам</span><strong>Кто голосует против №{tieCandidateSeat}?</strong></div><b>{activeCandidateVotes}</b></div><button className="primary-action" onClick={advanceVote}><span><small>Записать голоса</small>{currentCandidateIndex < currentCandidateList.length - 1 ? `Следующая: №${currentCandidateList[currentCandidateIndex + 1]}` : "Проверить повторный попил"}</span><strong>→</strong></button></>}
          {tieStage === "lift" && <><div className="lift-result"><span>За подъём обоих</span><strong>{liftVoters.length} из {activePlayers.length}</strong><small>{liftVoters.length >= majority ? "Большинство есть — оба покидают стол" : `Нужно ещё ${majority - liftVoters.length}`}</small></div><button className="primary-action" onClick={() => setToast({ message: liftVoters.length >= majority ? "Оба игрока покидают стол" : "Оба остаются за столом" })}><span><small>Зафиксировать решение</small>{liftVoters.length >= majority ? "Поднять обоих" : "Оставить обоих"}</span><strong>✓</strong></button></>}
        </>
      )}
      {scene === "night" && (
        <>
          <div className="night-action-tabs"><button className={nightAction === "shot" ? "is-active" : ""} onClick={() => setNightAction("shot")}>Отстрел</button><button className={nightAction === "don" ? "is-active" : ""} onClick={() => setNightAction("don")}>Дон</button><button className={nightAction === "sheriff" ? "is-active" : ""} onClick={() => setNightAction("sheriff")}>Шериф</button></div>
          {nightAction === "shot" && <div className="shooter-row"><span>Кто стреляет</span>{mafiaSeats.map((seat) => <button key={seat} className={nightShooter === seat ? "is-active" : ""} onClick={() => setNightShooter(seat)}>№{seat}</button>)}</div>}
          <div className="night-relation"><span>№{nightActor}</span><i>→</i><span className="is-target">№{nightTarget}</span><small>{nightAction === "shot" ? "выстрел" : "проверка"}</small></div>
          <button className="primary-action" onClick={confirmNightRecord}><span><small>Кто кого · ночь 1</small>{nightAction === "shot" ? "Записать отстрел" : "Зафиксировать проверку"}</span><strong>✓</strong></button>
        </>
      )}
    </section>
  );

  const guidedPanel = (
    <section className="control-panel guided-panel">
      <div className="guide-head"><span>ПОШАГОВЫЙ МАСТЕР</span><strong>{scene === "speech" ? "1 из 3" : scene === "night" ? "2 из 4" : "2 из 3"}</strong></div>
      {scene === "speech" && <><div className="guide-title"><span>Шаг 1 · выберите игрока</span><strong>Кому выполнить действие?</strong><small>Номер цели повторится перед подтверждением</small></div>{renderPlayerGrid("select")}<div className="guide-action-grid"><button onClick={() => setPendingFoulSeat(selectedSeat)}>Выдать фол №{selectedSeat}<small>{selectedPlayer.fouls} → {Math.min(4, selectedPlayer.fouls + 1)}</small></button><button onClick={() => toggleNomination(selectedSeat)}>{selectedPlayer.nomination ? "Снять" : "Выставить"} №{selectedSeat}<small>{selectedPlayer.nomination ? "убрать кандидатуру" : `${nominees.length + 1}-м по порядку`}</small></button><button onClick={() => setPurchaseSeat(currentSeat)}>Купить +30 секунд<small>игрок №{currentSeat} получит 2 фола</small></button></div><button className="primary-action" onClick={() => transferSpeech(selectedSeat)}><span><small>Шаг 3 · речь не запустится сама</small>Передать речь игроку №{selectedSeat}</span><strong>→</strong></button></>}
      {scene === "vote" && <><div className="guide-title"><span>Шаг {currentCandidateIndex + 1} · кандидат №{voteCandidateSeat}</span><strong>Кто голосует против?</strong><small>Один игрок может быть записан только один раз</small></div>{renderPlayerGrid("vote")}<div className="guide-count"><span>Выбраны: {voteMap[voteCandidateSeat]?.map((seat) => `№${seat}`).join(", ") || "никто"}</span><strong>{activeCandidateVotes} {voteWord(activeCandidateVotes)}</strong></div><button className="primary-action" onClick={advanceVote}><span><small>Проверить и записать</small>{currentCandidateIndex < currentCandidateList.length - 1 ? "Следующая кандидатура" : "Показать результат"}</span><strong>→</strong></button></>}
      {scene === "tie" && <><div className="guide-title"><span>Попил · {tieStage === "speeches" ? "речи" : tieStage === "revote" ? "переголосование" : "финальное решение"}</span><strong>{tieStage === "speeches" ? `По 30 секунд: ${popilSeats.map((seat) => `№${seat}`).join(" и ")}` : tieStage === "revote" ? `Голоса против №${tieCandidateSeat}` : `Кто за подъём ${popilSeats.map((seat) => `№${seat}`).join(" и ")}?`}</strong><small>{tieStage === "lift" ? `Нужно ${majority} голосов` : "Приложение проведёт этап последовательно"}</small></div>{tieStage === "speeches" ? renderPlayerGrid("select") : tieStage === "revote" ? renderPlayerGrid("vote") : renderPlayerGrid("lift")}<button className="primary-action" onClick={tieStage === "speeches" ? advanceTieSpeech : tieStage === "revote" ? advanceVote : () => setToast({ message: liftVoters.length >= majority ? "Оба игрока покидают стол" : "Оба остаются" })}><span><small>Продолжить сценарий попила</small>{tieStage === "speeches" ? "Следующая 30-секундная речь" : tieStage === "revote" ? "Записать переголосование" : "Подтвердить подъём обоих"}</span><strong>→</strong></button></>}
      {scene === "night" && <><div className="guide-steps"><span className={nightAction === "shot" ? "is-active" : ""}>1 Отстрел</span><span className={nightAction === "don" ? "is-active" : ""}>2 Дон</span><span className={nightAction === "sheriff" ? "is-active" : ""}>3 Шериф</span><span>4 Итог</span></div><div className="guide-title"><span>Шаг 2 · цель</span><strong>{nightAction === "shot" ? `Кого выбирает игрок №${nightActor}?` : `Кого проверяет ${nightAction === "don" ? "Дон" : "Шериф"} №${nightActor}?`}</strong><small>Сначала выберите цель, затем проверьте стрелку</small></div>{renderPlayerGrid("target")}<div className="night-relation"><span>№{nightActor}</span><i>→</i><span className="is-target">№{nightTarget}</span></div><button className="primary-action" onClick={confirmNightRecord}><span><small>Шаг 3 · сверка</small>Подтвердить: №{nightActor} → №{nightTarget}</span><strong>✓</strong></button></>}
    </section>
  );

  const ledgerPanel = (
    <section className="control-panel ledger-panel">
      <div className="ledger-head"><div><span>ЖИВОЙ ПРОТОКОЛ</span><strong>{scene === "night" ? "Ночь 1" : "День 1 · круг 1"}</strong></div><button onClick={() => toast?.snapshot && restoreSnapshot(toast.snapshot)}>↶ Последнее</button></div>
      {scene === "vote" && <div className="ledger-votes">{nominees.map((candidate) => <button key={candidate.seat} className={voteCandidateSeat === candidate.seat ? "is-active" : ""} onClick={() => setVoteCandidateSeat(candidate.seat)}><strong>№{candidate.seat}</strong><span>{voteMap[candidate.seat]?.map((seat) => `№${seat}`).join(", ") || "голосов нет"}</span><b>{voteMap[candidate.seat]?.length ?? 0}</b></button>)}</div>}
      {scene === "tie" && <div className="decision-card"><span>ПОПИЛ</span><strong>{popilSeats.map((seat) => `№${seat}`).join(" и ")}</strong><small>Выберите следующий шаг — всё останется в истории</small><div><button onClick={() => { setTieStage("speeches"); setSeconds(30); }}>Речи 30с</button><button onClick={() => setTieStage("revote")}>Переголосовать</button><button onClick={() => setTieStage("lift")}>Поднять обоих</button></div></div>}
      {scene === "night" && <div className="night-ledger">{nightRecords.map((record, index) => <div key={`${record}-${index}`}><span>{index + 1}</span><strong>{record}</strong><button aria-label={`Исправить ${record}`}>Исправить</button></div>)}</div>}
      {scene === "speech" && <div className="ledger-command"><div className="selected-number">{selectedSeat}</div><div><span>Выбран игрок</span><strong>{selectedPlayer.name} · {selectedPlayer.fouls} фола</strong></div><button onClick={() => requestFoul(selectedSeat)}>+ Фол</button><button onClick={() => toggleNomination(selectedSeat)}>{selectedPlayer.nomination ? "Снять" : "Выставить"}</button><button onClick={() => setPurchaseSeat(currentSeat)}>+30 / 2 фола</button></div>}
      <div className="event-log"><span className="event-log-title">Последние события</span>{eventLog.slice(0, 4).map((entry, index) => <div key={`${entry}-${index}`}><time>{`12:${String(8 - index).padStart(2, "0")}`}</time><span>{entry}</span><button aria-label={`Отменить событие ${entry}`}>↶</button></div>)}</div>
      {scene !== "speech" && <button className="primary-action" onClick={scene === "night" ? confirmNightRecord : scene === "vote" ? advanceVote : tieStage === "speeches" ? advanceTieSpeech : tieStage === "revote" ? advanceVote : () => setToast({ message: liftVoters.length >= majority ? "Оба игрока подняты" : "Оба остаются" })}><span><small>Записать атомарным событием</small>{scene === "night" ? `№${nightActor} → №${nightTarget}` : scene === "vote" ? `Голоса за №${voteCandidateSeat}` : "Следующий шаг попила"}</span><strong>＋</strong></button>}
    </section>
  );

  return (
    <main className="app-shell">
      <section className={`game-app variant-${variant} scene-${scene} ${isWarning ? "is-warning" : ""}`} aria-label="Прототипы пульта ведущего Mafia Master">
        <div className="prototype-toolbar">
          <div className="prototype-toolbar-copy"><span>ВАРИАНТ УПРАВЛЕНИЯ</span><strong>Сравните три подхода</strong></div>
          <div className="variant-switcher">{variants.map((item) => <button key={item.id} className={variant === item.id ? "is-active" : ""} onClick={() => setVariant(item.id)}><span>{item.letter}</span><strong>{item.name}</strong><small>{item.note}</small></button>)}</div>
        </div>

        <header className="game-header">
          <div className="brand-row"><div className="app-brand">M</div><div className="game-heading"><span>MAFIA MASTER · ИГРА 024</span><strong>{scene === "night" ? "Ночь 1" : "День 1"}</strong></div><div className="round-status"><span />Круг 1</div></div>
          <nav className="flow-tabs" aria-label="Сценарий для прототипирования">{scenes.map((item) => <button key={item.id} className={scene === item.id ? "is-active" : ""} onClick={() => changeScene(item.id)}>{item.name}{item.id === "vote" && <small>{nominees.length}</small>}</button>)}</nav>
        </header>

        <section className="table-stage" aria-label="Стол: игрок 1 слева от ведущего, игрок 10 справа">
          <div className="orientation-note"><span>↻</span> 1 → 10 · по часовой</div>
          <div className="table-surface" aria-hidden="true"><div className="table-grain" /><div className="table-inlay" /></div>
          <div className="table-center">
            {isTimedScene ? <><span className="center-kicker"><i />{scene === "speech" ? `Говорит игрок №${currentSeat}` : `Попил · речь игрока №${selectedSeat}`}</span><div className="timer-orbit" style={{ background: `conic-gradient(var(--timer-accent) ${timerProgress}%, rgba(255,255,255,.075) 0)` }}><div className="timer-face"><time aria-live={isWarning ? "assertive" : "off"}>{seconds}</time><small>секунд · {timerStatus}</small></div></div><div className="timer-actions"><button className="timer-main" onClick={toggleTimer}><span>{running ? "Ⅱ" : "▶"}</span>{seconds === 0 ? "Снова" : running ? "Пауза" : seconds < timerLimit ? "Продолжить" : "Старт"}</button><button className="timer-reset" onClick={resetTimer} aria-label="Сбросить таймер">↺</button></div></> : <div className="workflow-center"><span>{centerEyebrow}</span><strong>{centerValue}</strong><small>{centerNote}</small></div>}
          </div>
          <div className="table-seats">{seatOrder.map((seat) => {
            const player = players.find((candidate) => candidate.seat === seat)!;
            const assignment = (scene === "vote" || (scene === "tie" && tieStage === "revote")) ? assignmentFor(seat, seatVoteMap) : null;
            const marker = assignment ? (assignment === seatCandidate ? "✓" : `→${assignment}`) : scene === "tie" && tieStage === "lift" && liftVoters.includes(seat) ? "ЗА" : scene === "night" && nightTarget === seat ? "ЦЕЛЬ" : null;
            const selected = scene === "speech" ? selectedSeat === seat : scene === "tie" && tieStage === "speeches" ? selectedSeat === seat : scene === "night" ? nightTarget === seat : false;
            const candidate = (scene === "vote" || (scene === "tie" && tieStage === "revote")) && activeCandidateSeat === seat;
            return <button key={seat} className={`table-seat seat-${seat} ${selected ? "is-selected" : ""} ${scene === "speech" && currentSeat === seat ? "is-current" : ""} ${player.nomination ? "is-nominated" : ""} ${candidate ? "is-candidate" : ""} ${player.fouls >= 4 ? "is-eliminated" : ""}`} disabled={player.fouls >= 4} onClick={() => handleSeatClick(seat)} aria-label={`Игрок №${seat}, ${player.name}, фолов ${player.fouls}${marker ? `, отметка ${marker}` : ""}`}>{player.nomination && <span className="ballot-order">{player.nomination}</span>}{marker && <span className="seat-state">{marker}</span>}<strong>{seat}</strong><span className="seat-name">{player.name}</span>{player.fouls >= 4 ? <span className="out-label">вне игры</span> : <FoulMarks count={player.fouls} />}</button>;
          })}</div>
          <div className="master-seat" aria-label="Место ведущего"><span className="master-line" /><span className="master-avatar">M</span><span className="master-copy"><strong>Ведущий</strong><small>ваше место</small></span></div>
        </section>

        <section className="nominees-bar"><div className="nominees-title"><span>На голосовании</span><strong>{nominees.length ? `${nominees.length} игрока` : "пока никого"}</strong></div><div className="nominee-chips">{nominees.map((player) => <button key={player.seat} className={(scene === "vote" ? voteCandidateSeat : selectedSeat) === player.seat ? "is-active" : ""} onClick={() => scene === "vote" ? setVoteCandidateSeat(player.seat) : setSelectedSeat(player.seat)}><span>{player.nomination}</span>№{player.seat}</button>)}</div></section>

        {variant === "direct" ? directPanel : variant === "guided" ? guidedPanel : ledgerPanel}

        {toast && <div className="undo-toast" role="status"><span>{toast.message}</span>{toast.snapshot && <button onClick={() => restoreSnapshot(toast.snapshot!)}>Отменить</button>}<button className="toast-close" onClick={() => setToast(null)} aria-label="Закрыть сообщение">×</button></div>}

        {(pendingFoulSeat !== null || purchaseSeat !== null) && <div className="confirmation-overlay" role="dialog" aria-modal="true"><div className="confirmation-card">{pendingFoulSeat !== null ? <><span className="confirmation-kicker">ПРОВЕРЬТЕ НОМЕР</span><h2>Фол игроку №{pendingFoulSeat}</h2><div className="effect-preview"><span>Фолы</span><strong>{players.find((player) => player.seat === pendingFoulSeat)?.fouls} → {Math.min(4, (players.find((player) => player.seat === pendingFoulSeat)?.fouls ?? 0) + 1)}</strong></div><p>Изменение сразу появится на его месте и в протоколе.</p><div className="confirmation-actions"><button onClick={() => setPendingFoulSeat(null)}>Отмена</button><button className="confirm" onClick={() => commitFoul(pendingFoulSeat)}>Выдать фол №{pendingFoulSeat}</button></div></> : <><span className="confirmation-kicker">ПОКУПКА ВРЕМЕНИ</span><h2>+30 секунд игроку №{purchaseSeat}</h2><div className="effect-preview"><span>Таймер</span><strong>{seconds} → {seconds + 30}</strong></div><div className="effect-preview"><span>Фолы</span><strong>{players.find((player) => player.seat === purchaseSeat!)?.fouls} → {Math.min(4, (players.find((player) => player.seat === purchaseSeat!)?.fouls ?? 0) + 2)}</strong></div><p>Два фола и 30 секунд применятся одним действием и отменятся вместе.</p><div className="confirmation-actions"><button onClick={() => setPurchaseSeat(null)}>Отмена</button><button className="confirm" onClick={confirmPurchase}>Купить +30 секунд</button></div></>}</div></div>}
      </section>
    </main>
  );
}
