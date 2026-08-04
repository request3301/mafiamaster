"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Stage =
  | "speech"
  | "vote"
  | "tieSpeech"
  | "revote"
  | "lift"
  | "nightShot"
  | "nightDon"
  | "nightSheriff"
  | "nightSummary";

type Role = "Мирный" | "Мафия" | "Дон" | "Шериф";
type VoteMap = Record<number, number[]>;

type Player = {
  seat: number;
  name: string;
  role: Role;
  fouls: number;
  nomination: number | null;
  alive: boolean;
};

type VoteState = {
  candidates: number[];
  eligible: number[];
  index: number;
  confirmed: VoteMap;
  draft: number[];
};

type NightRecord = {
  type: "shot" | "don" | "sheriff";
  actor: number;
  target: number;
};

type GameSnapshot = {
  players: Player[];
  stage: Stage;
  day: number;
  round: number;
  roundStarter: number;
  currentSeat: number;
  selectedSeat: number;
  spokenSeats: number[];
  seconds: number;
  voteState: VoteState;
  tieSeats: number[];
  tieSpeechIndex: number;
  liftDraft: number[];
  nightShotIndex: number;
  nightTarget: number;
  nightRecords: NightRecord[];
  eventLog: string[];
};

type UndoEntry = {
  label: string;
  snapshot: GameSnapshot;
};

const initialPlayers: Player[] = [
  { seat: 1, name: "Анна", role: "Мирный", fouls: 0, nomination: null, alive: true },
  { seat: 2, name: "Борис", role: "Мафия", fouls: 1, nomination: 1, alive: true },
  { seat: 3, name: "Вика", role: "Мирный", fouls: 0, nomination: null, alive: true },
  { seat: 4, name: "Глеб", role: "Шериф", fouls: 2, nomination: null, alive: true },
  { seat: 5, name: "Дана", role: "Мирный", fouls: 0, nomination: 2, alive: true },
  { seat: 6, name: "Егор", role: "Мирный", fouls: 1, nomination: null, alive: true },
  { seat: 7, name: "Жанна", role: "Дон", fouls: 0, nomination: null, alive: true },
  { seat: 8, name: "Илья", role: "Мафия", fouls: 1, nomination: 3, alive: true },
  { seat: 9, name: "Кира", role: "Мирный", fouls: 0, nomination: null, alive: true },
  { seat: 10, name: "Лев", role: "Мирный", fouls: 0, nomination: null, alive: true },
];

const emptyVoteState: VoteState = {
  candidates: [],
  eligible: [],
  index: 0,
  confirmed: {},
  draft: [],
};

const seatOrder = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

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

function orderedAliveFrom(start: number, players: Player[]) {
  return seatOrder
    .map((_, index) => ((start - 1 + index) % 10) + 1)
    .filter((seat) => players.some((player) => player.seat === seat && player.alive));
}

function nextAliveAfter(seat: number, players: Player[]) {
  for (let offset = 1; offset <= 10; offset += 1) {
    const nextSeat = ((seat - 1 + offset) % 10) + 1;
    if (players.some((player) => player.seat === nextSeat && player.alive)) return nextSeat;
  }
  return seat;
}

function assignmentFor(voter: number, votes: VoteMap) {
  const entry = Object.entries(votes).find(([, voters]) => voters.includes(voter));
  return entry ? Number(entry[0]) : null;
}

function leadersFor(candidates: number[], votes: VoteMap) {
  if (!candidates.length) return [];
  const maximum = Math.max(...candidates.map((seat) => votes[seat]?.length ?? 0));
  if (maximum === 0) return [];
  return candidates.filter((seat) => (votes[seat]?.length ?? 0) === maximum);
}

export default function Home() {
  const [players, setPlayers] = useState(initialPlayers);
  const [stage, setStage] = useState<Stage>("speech");
  const [day, setDay] = useState(1);
  const [round, setRound] = useState(1);
  const [roundStarter, setRoundStarter] = useState(1);
  const [currentSeat, setCurrentSeat] = useState(1);
  const [selectedSeat, setSelectedSeat] = useState(1);
  const [spokenSeats, setSpokenSeats] = useState<number[]>([]);
  const [seconds, setSeconds] = useState(60);
  const [running, setRunning] = useState(false);
  const [voteState, setVoteState] = useState<VoteState>(emptyVoteState);
  const [tieSeats, setTieSeats] = useState<number[]>([]);
  const [tieSpeechIndex, setTieSpeechIndex] = useState(0);
  const [liftDraft, setLiftDraft] = useState<number[]>([]);
  const [nightShotIndex, setNightShotIndex] = useState(0);
  const [nightTarget, setNightTarget] = useState(6);
  const [nightRecords, setNightRecords] = useState<NightRecord[]>([]);
  const [eventLog, setEventLog] = useState<string[]>(["Круг 1 начался с игрока №1"]);
  const [history, setHistory] = useState<UndoEntry[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const deadlineRef = useRef(0);

  const selectedPlayer = players.find((player) => player.seat === selectedSeat) ?? players[0];
  const currentPlayer = players.find((player) => player.seat === currentSeat) ?? players[0];
  const alivePlayers = players.filter((player) => player.alive);
  const nominees = useMemo(
    () => players.filter((player) => player.alive && player.nomination !== null).sort((a, b) => a.nomination! - b.nomination!),
    [players],
  );
  const speechOrder = orderedAliveFrom(roundStarter, players);
  const remainingSpeechSeats = speechOrder.filter((seat) => !spokenSeats.includes(seat) && seat !== currentSeat);
  const nextSpeechSeat = remainingSpeechSeats[0] ?? null;
  const isLastSpeech = nextSpeechSeat === null;
  const currentCandidate = voteState.candidates[voteState.index] ?? null;
  const lockedVoters = Object.values(voteState.confirmed).flat();
  const majority = Math.floor(voteState.eligible.length / 2) + 1;
  const isTimedStage = stage === "speech" || stage === "tieSpeech";
  const timerLimit = stage === "tieSpeech" ? 30 : 60;
  const timerProgress = Math.max(0, Math.min(100, (seconds / Math.max(timerLimit, seconds)) * 100));
  const isWarning = isTimedStage && seconds <= 10;
  const mafiaActors = players.filter((player) => player.alive && (player.role === "Мафия" || player.role === "Дон"));
  const don = players.find((player) => player.alive && player.role === "Дон");
  const sheriff = players.find((player) => player.alive && player.role === "Шериф");
  const nightActor = stage === "nightShot"
    ? mafiaActors[nightShotIndex]?.seat ?? mafiaActors[0]?.seat ?? 0
    : stage === "nightDon"
      ? don?.seat ?? 0
      : sheriff?.seat ?? 0;
  const shotRecords = nightRecords.filter((record) => record.type === "shot");
  const shotResult = shotRecords.length > 0 && shotRecords.every((record) => record.target === shotRecords[0].target)
    ? shotRecords[0].target
    : null;

  const captureSnapshot = (): GameSnapshot => ({
    players,
    stage,
    day,
    round,
    roundStarter,
    currentSeat,
    selectedSeat,
    spokenSeats,
    seconds,
    voteState,
    tieSeats,
    tieSpeechIndex,
    liftDraft,
    nightShotIndex,
    nightTarget,
    nightRecords,
    eventLog,
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

  const remember = (label: string) => {
    const entry = { label, snapshot: captureSnapshot() };
    setHistory((current) => [...current.slice(-24), entry]);
  };

  const addLog = (entry: string) => setEventLog((current) => [entry, ...current].slice(0, 12));

  const restoreSnapshot = (snapshot: GameSnapshot) => {
    setPlayers(snapshot.players);
    setStage(snapshot.stage);
    setDay(snapshot.day);
    setRound(snapshot.round);
    setRoundStarter(snapshot.roundStarter);
    setCurrentSeat(snapshot.currentSeat);
    setSelectedSeat(snapshot.selectedSeat);
    setSpokenSeats(snapshot.spokenSeats);
    setSeconds(snapshot.seconds);
    setVoteState(snapshot.voteState);
    setTieSeats(snapshot.tieSeats);
    setTieSpeechIndex(snapshot.tieSpeechIndex);
    setLiftDraft(snapshot.liftDraft);
    setNightShotIndex(snapshot.nightShotIndex);
    setNightTarget(snapshot.nightTarget);
    setNightRecords(snapshot.nightRecords);
    setEventLog(snapshot.eventLog);
    setRunning(false);
  };

  const undo = () => {
    if ((stage === "vote" || stage === "revote") && voteState.draft.length) {
      const removed = voteState.draft[voteState.draft.length - 1];
      setVoteState((current) => ({ ...current, draft: current.draft.slice(0, -1) }));
      setToast(`Выбор голоса игрока №${removed} отменён`);
      return;
    }
    if (stage === "lift" && liftDraft.length) {
      const removed = liftDraft[liftDraft.length - 1];
      setLiftDraft((current) => current.slice(0, -1));
      setToast(`Голос игрока №${removed} снят`);
      return;
    }
    const previous = history[history.length - 1];
    if (!previous) return;
    restoreSnapshot(previous.snapshot);
    setHistory((current) => current.slice(0, -1));
    setToast(`Отменено: ${previous.label}`);
  };

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
    setToast(`Таймер сброшен на ${timerLimit} секунд`);
  };

  const addFoul = () => {
    if (!selectedPlayer.alive || selectedPlayer.fouls >= 4) return;
    remember(`фол игроку №${selectedSeat}`);
    const nextFouls = selectedPlayer.fouls + 1;
    setPlayers((current) => current.map((player) => player.seat === selectedSeat
      ? { ...player, fouls: nextFouls, alive: nextFouls < 4 }
      : player));
    if (selectedSeat === currentSeat && nextFouls === 4) setRunning(false);
    const message = nextFouls === 4 ? `Игрок №${selectedSeat} покидает стол: 4-й фол` : `Игроку №${selectedSeat} добавлен ${nextFouls}-й фол`;
    addLog(message);
    setToast(message);
  };

  const toggleNomination = () => {
    if (!selectedPlayer.alive) return;
    remember(`${selectedPlayer.nomination ? "снятие" : "выставление"} игрока №${selectedSeat}`);
    const nextOrder = nominees.length ? Math.max(...nominees.map((player) => player.nomination!)) + 1 : 1;
    setPlayers((current) => current.map((player) => player.seat === selectedSeat
      ? { ...player, nomination: player.nomination ? null : nextOrder }
      : player));
    const message = selectedPlayer.nomination ? `Игрок №${selectedSeat} снят с голосования` : `Игрок №${selectedSeat} выставлен ${nextOrder}-м`;
    addLog(message);
    setToast(message);
  };

  const buyTime = () => {
    if (!currentPlayer.alive) return;
    remember(`покупка 30 секунд игроком №${currentSeat}`);
    const nextFouls = Math.min(4, currentPlayer.fouls + 2);
    setPlayers((current) => current.map((player) => player.seat === currentSeat
      ? { ...player, fouls: nextFouls, alive: nextFouls < 4 }
      : player));
    setSeconds((current) => current + 30);
    if (running) deadlineRef.current += 30_000;
    if (nextFouls === 4) setRunning(false);
    const message = `Игрок №${currentSeat}: +30 секунд и +2 фола`;
    addLog(message);
    setToast(message);
  };

  const beginNight = (nightPlayers: Player[] = players) => {
    const activeBlack = nightPlayers.filter((player) => player.alive && (player.role === "Мафия" || player.role === "Дон"));
    const activeSheriff = nightPlayers.find((player) => player.alive && player.role === "Шериф");
    const nextNightStage: Stage = activeBlack.length ? "nightShot" : activeSheriff ? "nightSheriff" : "nightSummary";
    const firstActor = activeBlack[0]?.seat ?? activeSheriff?.seat ?? 0;
    setStage(nextNightStage);
    setNightShotIndex(0);
    setNightTarget(nightPlayers.find((player) => player.alive && player.seat !== firstActor)?.seat ?? firstActor);
    setNightRecords([]);
    setRunning(false);
  };

  const beginVoting = () => {
    const candidateSeats = nominees.map((player) => player.seat);
    if (!candidateSeats.length) {
      beginNight();
      setToast("Кандидатов нет · автоматически начинается ночь");
      return;
    }
    setVoteState({
      candidates: candidateSeats,
      eligible: alivePlayers.map((player) => player.seat),
      index: 0,
      confirmed: {},
      draft: [],
    });
    setStage("vote");
    setRunning(false);
    setToast(`Речи закончены · голосование за игрока №${candidateSeats[0]}`);
  };

  const advanceSpeech = () => {
    remember(selectedSeat === currentSeat ? `речь игрока №${currentSeat}` : `передача речи игроку №${selectedSeat}`);
    setRunning(false);

    if (selectedSeat !== currentSeat && selectedPlayer.alive) {
      setSpokenSeats((current) => current.includes(currentSeat) ? current : [...current, currentSeat]);
      setCurrentSeat(selectedSeat);
      setSeconds(60);
      const message = `Речь передана игроку №${selectedSeat}`;
      addLog(message);
      setToast(`${message} · таймер готов`);
      return;
    }

    const nextSpoken = spokenSeats.includes(currentSeat) ? spokenSeats : [...spokenSeats, currentSeat];
    const next = speechOrder.find((seat) => !nextSpoken.includes(seat));
    setSpokenSeats(nextSpoken);
    if (next) {
      setCurrentSeat(next);
      setSelectedSeat(next);
      setSeconds(60);
      addLog(`Началась речь игрока №${next}`);
      setToast(`Следующий игрок №${next} · таймер готов`);
    } else {
      beginVoting();
    }
  };

  const toggleVoteDraft = (seat: number) => {
    if (!voteState.eligible.includes(seat)) {
      setToast(`Игрок №${seat} не участвует в этом голосовании`);
      return;
    }
    const lockedCandidate = assignmentFor(seat, voteState.confirmed);
    if (lockedCandidate !== null) {
      setToast(`Голос игрока №${seat} уже зафиксирован за №${lockedCandidate}`);
      return;
    }
    setVoteState((current) => ({
      ...current,
      draft: current.draft.includes(seat)
        ? current.draft.filter((voter) => voter !== seat)
        : [...current.draft, seat],
    }));
  };

  const eliminateAndBeginNight = (seats: number[]) => {
    const nextPlayers = players.map((player) => seats.includes(player.seat) ? { ...player, alive: false } : player);
    setPlayers(nextPlayers);
    beginNight(nextPlayers);
  };

  const confirmVotes = () => {
    if (currentCandidate === null) return;
    remember(`голоса за игрока №${currentCandidate}`);
    const nextConfirmed = { ...voteState.confirmed, [currentCandidate]: [...voteState.draft].sort((a, b) => a - b) };
    const isLastCandidate = voteState.index === voteState.candidates.length - 1;
    const votersCopy = voteState.draft.length ? voteState.draft.map((seat) => `№${seat}`).join(", ") : "никто";
    addLog(`${votersCopy} → игрок №${currentCandidate}`);

    if (!isLastCandidate) {
      const nextIndex = voteState.index + 1;
      const nextCandidate = voteState.candidates[nextIndex];
      setVoteState((current) => ({ ...current, confirmed: nextConfirmed, draft: [], index: nextIndex }));
      setToast(`Голоса за №${currentCandidate} зафиксированы · дальше №${nextCandidate}`);
      return;
    }

    const leaders = leadersFor(voteState.candidates, nextConfirmed);
    setVoteState((current) => ({ ...current, confirmed: nextConfirmed, draft: [] }));
    if (!leaders.length) {
      setToast("Никто не получил голосов · автоматически начинается ночь");
      beginNight();
    } else if (leaders.length > 1) {
      setTieSeats(leaders);
      setTieSpeechIndex(0);
      setCurrentSeat(leaders[0]);
      setSelectedSeat(leaders[0]);
      setSeconds(30);
      setRunning(false);
      setStage("tieSpeech");
      setToast(`Попил: ${leaders.map((seat) => `№${seat}`).join(" и ")} · по 30 секунд`);
    } else {
      setToast(`Игрок №${leaders[0]} покидает стол · начинается ночь`);
      eliminateAndBeginNight(leaders);
    }
  };

  const advanceTieSpeech = () => {
    remember(`30-секундная речь игрока №${currentSeat}`);
    setRunning(false);
    if (tieSpeechIndex < tieSeats.length - 1) {
      const nextIndex = tieSpeechIndex + 1;
      const next = tieSeats[nextIndex];
      setTieSpeechIndex(nextIndex);
      setCurrentSeat(next);
      setSelectedSeat(next);
      setSeconds(30);
      setToast(`Следующая речь попила: игрок №${next}`);
    } else {
      setVoteState({
        candidates: tieSeats,
        eligible: alivePlayers.map((player) => player.seat),
        index: 0,
        confirmed: {},
        draft: [],
      });
      setStage("revote");
      setToast(`Речи попила закончены · переголосование за №${tieSeats[0]}`);
    }
  };

  const confirmRevote = () => {
    if (currentCandidate === null) return;
    remember(`переголосование за игрока №${currentCandidate}`);
    const nextConfirmed = { ...voteState.confirmed, [currentCandidate]: [...voteState.draft].sort((a, b) => a - b) };
    const isLastCandidate = voteState.index === voteState.candidates.length - 1;
    addLog(`Переголосование: ${voteState.draft.map((seat) => `№${seat}`).join(", ") || "никто"} → №${currentCandidate}`);
    if (!isLastCandidate) {
      const nextIndex = voteState.index + 1;
      setVoteState((current) => ({ ...current, confirmed: nextConfirmed, draft: [], index: nextIndex }));
      setToast(`Голоса за №${currentCandidate} зафиксированы · дальше №${voteState.candidates[nextIndex]}`);
      return;
    }
    const leaders = leadersFor(voteState.candidates, nextConfirmed);
    setVoteState((current) => ({ ...current, confirmed: nextConfirmed, draft: [] }));
    if (leaders.length > 1) {
      setTieSeats(leaders);
      setLiftDraft([]);
      setStage("lift");
      setToast(`Повторный попил · голосуем за подъём ${leaders.map((seat) => `№${seat}`).join(" и ")}`);
    } else if (leaders.length === 1) {
      setToast(`Игрок №${leaders[0]} покидает стол · начинается ночь`);
      eliminateAndBeginNight(leaders);
    } else {
      setToast("Голосов нет · оба остаются, начинается ночь");
      beginNight();
    }
  };

  const toggleLiftVote = (seat: number) => {
    if (!players.some((player) => player.seat === seat && player.alive)) return;
    setLiftDraft((current) => current.includes(seat) ? current.filter((voter) => voter !== seat) : [...current, seat]);
  };

  const confirmLift = () => {
    remember(`голосование за подъём ${tieSeats.map((seat) => `№${seat}`).join(" и ")}`);
    if (liftDraft.length >= Math.floor(alivePlayers.length / 2) + 1) {
      addLog(`${liftDraft.map((seat) => `№${seat}`).join(", ")} → поднять ${tieSeats.map((seat) => `№${seat}`).join(" и ")}`);
      setToast("Большинство за · оба игрока покидают стол");
      eliminateAndBeginNight(tieSeats);
    } else {
      addLog(`Большинства за подъём нет · оба остаются`);
      setToast("Большинства нет · оба остаются, начинается ночь");
      beginNight();
    }
  };

  const confirmNightStep = () => {
    if (!nightActor || nightTarget === nightActor) {
      setToast(nightTarget === nightActor ? "Нельзя выбрать самого себя" : "Ночной действующий игрок выбыл");
      return;
    }
    remember(`ночное действие №${nightActor} → №${nightTarget}`);
    if (stage === "nightShot") {
      const record: NightRecord = { type: "shot", actor: nightActor, target: nightTarget };
      setNightRecords((current) => [...current, record]);
      addLog(`Отстрел: №${nightActor} → №${nightTarget}`);
      if (nightShotIndex < mafiaActors.length - 1) {
        setNightShotIndex((current) => current + 1);
        setToast(`Отстрел записан · следующий стрелок №${mafiaActors[nightShotIndex + 1].seat}`);
      } else if (don) {
        setStage("nightDon");
        setNightTarget(players.find((player) => player.alive && player.seat !== don.seat)?.seat ?? 1);
        setToast("Отстрелы закончены · проверка Дона");
      } else if (sheriff) {
        setStage("nightSheriff");
        setNightTarget(players.find((player) => player.alive && player.seat !== sheriff.seat)?.seat ?? 1);
        setToast("Отстрелы закончены · проверка Шерифа");
      } else {
        setStage("nightSummary");
      }
    } else if (stage === "nightDon") {
      setNightRecords((current) => [...current, { type: "don", actor: nightActor, target: nightTarget }]);
      addLog(`Дон №${nightActor} → №${nightTarget}`);
      if (sheriff) {
        setStage("nightSheriff");
        setNightTarget(players.find((player) => player.alive && player.seat !== sheriff.seat)?.seat ?? 1);
        setToast("Проверка Дона записана · теперь Шериф");
      } else {
        setStage("nightSummary");
      }
    } else {
      setNightRecords((current) => [...current, { type: "sheriff", actor: nightActor, target: nightTarget }]);
      addLog(`Шериф №${nightActor} → №${nightTarget}`);
      setStage("nightSummary");
      setToast("Проверка Шерифа записана · итоги ночи");
    }
  };

  const beginNextRound = () => {
    remember(`начало круга ${round + 1}`);
    const nextPlayers = players.map((player) => shotResult === player.seat ? { ...player, alive: false } : player);
    const nextStarter = nextAliveAfter(roundStarter, nextPlayers);
    setPlayers(nextPlayers.map((player) => ({ ...player, nomination: null })));
    setDay((current) => current + 1);
    setRound((current) => current + 1);
    setRoundStarter(nextStarter);
    setCurrentSeat(nextStarter);
    setSelectedSeat(nextStarter);
    setSpokenSeats([]);
    setSeconds(60);
    setRunning(false);
    setVoteState(emptyVoteState);
    setTieSeats([]);
    setLiftDraft([]);
    setNightRecords([]);
    setStage("speech");
    const message = `Круг ${round + 1} начинается с игрока №${nextStarter}`;
    addLog(message);
    setToast(message);
  };

  const handleSeatClick = (seat: number) => {
    if (stage === "speech") {
      setSelectedSeat(seat);
    } else if (stage === "vote" || stage === "revote") {
      toggleVoteDraft(seat);
    } else if (stage === "lift") {
      toggleLiftVote(seat);
    } else if (stage === "nightShot" || stage === "nightDon" || stage === "nightSheriff") {
      const player = players.find((candidate) => candidate.seat === seat);
      if (!player?.alive) {
        setToast(`Игрок №${seat} выбыл и не может быть целью`);
      } else {
        setNightTarget(seat);
      }
    }
  };

  let stageLabel = "";
  let stageNote = "";
  if (stage === "speech") {
    stageLabel = `Речь ${Math.min(spokenSeats.length + 1, speechOrder.length)} из ${speechOrder.length}`;
    stageNote = `Круг начал №${roundStarter}`;
  } else if (stage === "vote") {
    stageLabel = `Голосование ${voteState.index + 1} из ${voteState.candidates.length}`;
    stageNote = `Кандидат №${currentCandidate}`;
  } else if (stage === "tieSpeech") {
    stageLabel = `Попил · речь ${tieSpeechIndex + 1} из ${tieSeats.length}`;
    stageNote = "По 30 секунд";
  } else if (stage === "revote") {
    stageLabel = `Переголосование ${voteState.index + 1} из ${voteState.candidates.length}`;
    stageNote = `Кандидат №${currentCandidate}`;
  } else if (stage === "lift") {
    stageLabel = "Подъём обоих";
    stageNote = `${liftDraft.length} за · нужно ${Math.floor(alivePlayers.length / 2) + 1}`;
  } else if (stage === "nightShot") {
    stageLabel = `Ночь · отстрел ${nightShotIndex + 1} из ${mafiaActors.length}`;
    stageNote = `Стреляет №${nightActor}`;
  } else if (stage === "nightDon") {
    stageLabel = "Ночь · проверка Дона";
    stageNote = `Проверяет №${nightActor}`;
  } else if (stage === "nightSheriff") {
    stageLabel = "Ночь · проверка Шерифа";
    stageNote = `Проверяет №${nightActor}`;
  } else {
    stageLabel = "Итоги ночи";
    stageNote = shotResult ? `Выбывает №${shotResult}` : "Промах";
  }

  const undoAvailable = history.length > 0 || ((stage === "vote" || stage === "revote") && voteState.draft.length > 0) || (stage === "lift" && liftDraft.length > 0);
  const primaryLabel = stage === "speech"
    ? selectedSeat !== currentSeat
      ? `Передать речь игроку №${selectedSeat}`
      : isLastSpeech
        ? nominees.length ? `К голосованию · ${nominees.length}` : "К ночи"
        : `Следующий: игрок №${nextSpeechSeat}`
    : stage === "vote" || stage === "revote"
      ? voteState.index < voteState.candidates.length - 1
        ? `Зафиксировать · дальше №${voteState.candidates[voteState.index + 1]}`
        : "Зафиксировать и подвести итог"
      : stage === "tieSpeech"
        ? tieSpeechIndex < tieSeats.length - 1 ? `Следующая речь: №${tieSeats[tieSpeechIndex + 1]}` : "К переголосованию"
        : stage === "lift"
          ? "Зафиксировать решение"
          : stage === "nightSummary"
            ? `Начать круг ${round + 1}`
            : stage === "nightShot" && nightShotIndex < mafiaActors.length - 1
              ? `Следующий стрелок: №${mafiaActors[nightShotIndex + 1]?.seat}`
              : stage === "nightShot"
                ? don ? "К проверке Дона" : sheriff ? "К проверке Шерифа" : "К итогам ночи"
                : stage === "nightDon" && sheriff ? "К проверке Шерифа" : "К итогам ночи";

  const onPrimary = stage === "speech"
    ? advanceSpeech
    : stage === "vote"
      ? confirmVotes
      : stage === "tieSpeech"
        ? advanceTieSpeech
        : stage === "revote"
          ? confirmRevote
          : stage === "lift"
            ? confirmLift
            : stage === "nightSummary"
              ? beginNextRound
              : confirmNightStep;

  const timedLabel = stage === "speech" ? `Говорит игрок №${currentSeat}` : `Попил · игрок №${currentSeat}`;
  const timerStatus = seconds === 0 ? "Время вышло" : running ? "таймер идёт" : "готов к старту";

  return (
    <main className="app-shell">
      <section className={`game-app stage-${stage} ${isWarning ? "is-warning" : ""}`} aria-label="Пульт ведущего Mafia Master">
        <header className="game-header">
          <div className="header-main">
            <button className="undo-button" onClick={undo} disabled={!undoAvailable} aria-label="Откатить последнее действие назад">
              <span>↶</span>
              Назад
            </button>
            <div className="game-heading">
              <span>MAFIA MASTER · ИГРА 024</span>
              <strong>День {day} · круг {round}</strong>
            </div>
            <div className="app-brand">M</div>
          </div>
          <div className="stage-status" aria-live="polite">
            <span className="stage-dot" />
            <div><small>Сейчас</small><strong>{stageLabel}</strong></div>
            <span>{stageNote}</span>
          </div>
        </header>

        <section className="table-stage" aria-label="Стол: игрок 1 слева от ведущего, игрок 10 справа">
          <div className="orientation-note"><span>↻</span> 1 → 10 · по часовой</div>
          <div className="table-surface" aria-hidden="true"><div className="table-grain" /><div className="table-inlay" /></div>

          <div className="table-center">
            {isTimedStage ? (
              <>
                <span className="center-kicker"><i />{timedLabel}</span>
                <button
                  className="timer-orbit"
                  onClick={toggleTimer}
                  style={{ background: `conic-gradient(var(--timer-accent) ${timerProgress}%, rgba(255,255,255,.075) 0)` }}
                  aria-label={`${running ? "Поставить на паузу" : "Запустить"} таймер`}
                >
                  <span className="timer-face"><time aria-live={isWarning ? "assertive" : "off"}>{seconds}</time><small>секунд · {timerStatus}</small></span>
                </button>
                <button className="timer-reset" onClick={resetTimer}>↺ Сбросить</button>
              </>
            ) : stage === "vote" || stage === "revote" ? (
              <div className="workflow-center">
                <span>{stage === "vote" ? "Кандидат" : "Переголосование"} {voteState.index + 1} из {voteState.candidates.length}</span>
                <strong>№{currentCandidate}</strong>
                <small>{voteState.draft.length} {voteWord(voteState.draft.length)} выбрано</small>
              </div>
            ) : stage === "lift" ? (
              <div className="workflow-center"><span>Поднять {tieSeats.map((seat) => `№${seat}`).join(" и ")}?</span><strong>{liftDraft.length}</strong><small>за · нужно {Math.floor(alivePlayers.length / 2) + 1}</small></div>
            ) : stage === "nightSummary" ? (
              <div className="workflow-center night-result"><span>Итог ночи</span><strong>{shotResult ? `№${shotResult}` : "Промах"}</strong><small>{shotResult ? "покидает стол утром" : "единая цель не выбрана"}</small></div>
            ) : (
              <div className="workflow-center night-target"><span>{stage === "nightShot" ? "Отстрел" : "Проверка"}</span><strong>№{nightActor} → №{nightTarget}</strong><small>тапните цель на столе</small></div>
            )}
          </div>

          <div className="table-seats">
            {players.map((player) => {
              const lockedCandidate = (stage === "vote" || stage === "revote") ? assignmentFor(player.seat, voteState.confirmed) : null;
              const draftVote = (stage === "vote" || stage === "revote") && voteState.draft.includes(player.seat);
              const liftVote = stage === "lift" && liftDraft.includes(player.seat);
              const isTarget = (stage === "nightShot" || stage === "nightDon" || stage === "nightSheriff") && nightTarget === player.seat;
              const isCandidate = (stage === "vote" || stage === "revote") && currentCandidate === player.seat;
              const isSelected = stage === "speech" && selectedSeat === player.seat;
              const marker = lockedCandidate !== null ? `→${lockedCandidate}` : draftVote ? "✓" : liftVote ? "ЗА" : isTarget ? "ЦЕЛЬ" : null;
              return (
                <button
                  key={player.seat}
                  className={`table-seat seat-${player.seat} ${isSelected ? "is-selected" : ""} ${stage === "speech" && currentSeat === player.seat ? "is-current" : ""} ${player.nomination ? "is-nominated" : ""} ${isCandidate ? "is-candidate" : ""} ${draftVote || liftVote ? "is-draft-vote" : ""} ${lockedCandidate !== null ? "has-voted" : ""} ${!player.alive ? "is-eliminated" : ""}`}
                  disabled={!player.alive && stage === "speech"}
                  aria-disabled={lockedCandidate !== null || !player.alive}
                  onClick={() => handleSeatClick(player.seat)}
                  aria-label={`Игрок №${player.seat}, ${player.name}${lockedCandidate !== null ? `, голос за игрока №${lockedCandidate} зафиксирован` : ""}`}
                >
                  {player.nomination && <span className="ballot-order">{player.nomination}</span>}
                  {marker && <span className={`seat-state ${lockedCandidate !== null ? "is-locked" : ""}`}>{marker}</span>}
                  <strong>{player.seat}</strong>
                  <span className="seat-name">{player.name}</span>
                  {!player.alive ? <span className="out-label">вне игры</span> : <FoulMarks count={player.fouls} />}
                </button>
              );
            })}
          </div>

          <div className="master-seat" aria-label="Место ведущего"><span className="master-line" /><span className="master-avatar">M</span><span className="master-copy"><strong>Ведущий</strong><small>ваше место</small></span></div>
        </section>

        {nominees.length > 0 && !stage.startsWith("night") && (
          <section className="candidate-queue" aria-label="Очередь кандидатур">
            <div><span>Кандидаты</span><strong>{nominees.length} по порядку</strong></div>
            <ol>{nominees.map((player, index) => {
              const confirmedCount = voteState.confirmed[player.seat]?.length;
              return <li key={player.seat} className={currentCandidate === player.seat ? "is-current" : confirmedCount !== undefined ? "is-done" : ""}><span>{index + 1}</span><strong>№{player.seat}</strong>{confirmedCount !== undefined && <small>{confirmedCount}</small>}</li>;
            })}</ol>
          </section>
        )}

        <section className="control-panel">
          {stage === "speech" && (
            <>
              <div className="selected-player">
                <div className="selected-number">{selectedPlayer.seat}</div>
                <div className="selected-copy"><span>{selectedSeat === currentSeat ? "Сейчас говорит" : "Выбран игрок"}</span><strong>{selectedPlayer.name}</strong></div>
                <div className="selected-fouls"><span>{selectedPlayer.fouls} / 4 фола</span><FoulMarks count={selectedPlayer.fouls} /></div>
              </div>
              <div className="quick-actions">
                <button onClick={addFoul} disabled={!selectedPlayer.alive}><span>+</span><strong>Фол №{selectedSeat}</strong></button>
                <button onClick={toggleNomination} disabled={!selectedPlayer.alive}><span>{selectedPlayer.nomination ? "×" : "↓"}</span><strong>{selectedPlayer.nomination ? "Снять" : "Выставить"} №{selectedSeat}</strong></button>
                <button onClick={buyTime} disabled={!currentPlayer.alive}><span>+30</span><strong>№{currentSeat} · 2 фола</strong></button>
              </div>
            </>
          )}

          {(stage === "vote" || stage === "revote") && (
            <div className="vote-panel">
              <div className="vote-instruction"><div><span>Тапните номера голосующих</span><strong>Против игрока №{currentCandidate}</strong></div><b>{voteState.draft.length}</b></div>
              <div className="vote-summary"><span>Сейчас: {voteState.draft.length ? voteState.draft.map((seat) => `№${seat}`).join(", ") : "никто не выбран"}</span><strong>Зафиксировано: {lockedVoters.length} из {voteState.eligible.length}</strong></div>
              <div className="vote-legend"><span><i className="draft" />Выбран сейчас</span><span><i className="locked" />Голос уже отдан</span></div>
            </div>
          )}

          {stage === "tieSpeech" && <div className="simple-instruction"><span>Попил</span><strong>Игрок №{currentSeat} получает 30 секунд</strong><small>Следующий этап приложение выберет автоматически</small></div>}
          {stage === "lift" && <div className="simple-instruction"><span>Финальное голосование</span><strong>Кто за подъём {tieSeats.map((seat) => `№${seat}`).join(" и ")}?</strong><small>Тапните номера голосующих «за». Остальные считаются «против».</small></div>}
          {(stage === "nightShot" || stage === "nightDon" || stage === "nightSheriff") && <div className="night-instruction"><span>{stage === "nightShot" ? "Кто стреляет → кого" : "Кто проверяет → кого"}</span><div><strong>№{nightActor}</strong><i>→</i><strong className="target">№{nightTarget}</strong></div><small>После записи приложение само откроет следующее ночное действие.</small></div>}
          {stage === "nightSummary" && <div className="night-summary"><span>Ночь записана</span>{nightRecords.map((record, index) => <div key={`${record.type}-${record.actor}-${index}`}><strong>{record.type === "shot" ? "Отстрел" : record.type === "don" ? "Дон" : "Шериф"}</strong><span>№{record.actor} → №{record.target}</span></div>)}<div className="night-outcome"><strong>Результат</strong><span>{shotResult ? `утром выбывает №${shotResult}` : "промах"}</span></div></div>}

          <button className="primary-action" onClick={onPrimary}>
            <span><small>{stage === "speech" ? "Речи идут по часовой стрелке" : stage === "vote" || stage === "revote" ? `${voteState.draft.length} ${voteWord(voteState.draft.length)} будет зафиксировано` : "Следующий этап откроется автоматически"}</small>{primaryLabel}</span>
            <strong>→</strong>
          </button>
        </section>

        {toast && <div className="toast" role="status"><span>{toast}</span><button onClick={() => setToast(null)} aria-label="Закрыть сообщение">×</button></div>}
      </section>
    </main>
  );
}
