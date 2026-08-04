"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Stage =
  | "dealChoice"
  | "appDeal"
  | "manualDeal"
  | "dealReady"
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
type DealMethod = "app" | "cards" | null;
type VoteMap = Record<number, number[]>;

type Player = {
  seat: number;
  name: string;
  role: Role | null;
  fouls: number;
  nomination: number | null;
  nominatedBy: number | null;
  alive: boolean;
};

type VoteState = {
  candidates: number[];
  eligible: number[];
  index: number;
  confirmed: VoteMap;
  draft: number[];
};

type NightRecord =
  | { type: "shot"; target: number | null }
  | { type: "don"; target: number; result: "Шериф" | "Не шериф" }
  | { type: "sheriff"; target: number; result: "Мафия" | "Мирный" };

type GameSnapshot = {
  players: Player[];
  stage: Stage;
  dealMethod: DealMethod;
  dealIndex: number;
  appViewedCount: number;
  roleRevealed: boolean;
  manualRoleSelection: Role | null;
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
  nightTarget: number;
  nightShotChoice: number | "miss" | null;
  nightRecords: NightRecord[];
  eventLog: string[];
};

type UndoEntry = {
  label: string;
  snapshot: GameSnapshot;
};

const initialPlayers: Player[] = [
  { seat: 1, name: "Анна", role: null, fouls: 0, nomination: null, nominatedBy: null, alive: true },
  { seat: 2, name: "Борис", role: null, fouls: 0, nomination: null, nominatedBy: null, alive: true },
  { seat: 3, name: "Вика", role: null, fouls: 0, nomination: null, nominatedBy: null, alive: true },
  { seat: 4, name: "Глеб", role: null, fouls: 0, nomination: null, nominatedBy: null, alive: true },
  { seat: 5, name: "Дана", role: null, fouls: 0, nomination: null, nominatedBy: null, alive: true },
  { seat: 6, name: "Егор", role: null, fouls: 0, nomination: null, nominatedBy: null, alive: true },
  { seat: 7, name: "Жанна", role: null, fouls: 0, nomination: null, nominatedBy: null, alive: true },
  { seat: 8, name: "Илья", role: null, fouls: 0, nomination: null, nominatedBy: null, alive: true },
  { seat: 9, name: "Кира", role: null, fouls: 0, nomination: null, nominatedBy: null, alive: true },
  { seat: 10, name: "Лев", role: null, fouls: 0, nomination: null, nominatedBy: null, alive: true },
];

const standardRoles: Role[] = [
  "Мирный", "Мирный", "Мирный", "Мирный", "Мирный", "Мирный",
  "Мафия", "Мафия", "Дон", "Шериф",
];

const roleLimits: Record<Role, number> = { Мирный: 6, Мафия: 2, Дон: 1, Шериф: 1 };
const roleDescriptions: Record<Role, string> = {
  Мирный: "Найдите чёрную команду за столом",
  Мафия: "Играйте вместе с Доном и мафией",
  Дон: "Возглавьте мафию и найдите Шерифа",
  Шериф: "Проверяйте игроков и найдите мафию",
};
const roleClassNames: Record<Role, string> = {
  Мирный: "citizen",
  Мафия: "mafia",
  Дон: "don",
  Шериф: "sheriff",
};
const roleOptions: Role[] = ["Мирный", "Мафия", "Дон", "Шериф"];

const emptyVoteState: VoteState = {
  candidates: [],
  eligible: [],
  index: 0,
  confirmed: {},
  draft: [],
};

const seatOrder = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function shuffleRoles() {
  const roles = [...standardRoles];
  const randomValues = new Uint32Array(roles.length);
  globalThis.crypto.getRandomValues(randomValues);
  for (let index = roles.length - 1; index > 0; index -= 1) {
    const next = randomValues[index] % (index + 1);
    [roles[index], roles[next]] = [roles[next], roles[index]];
  }
  return roles;
}

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
  const [stage, setStage] = useState<Stage>("dealChoice");
  const [dealMethod, setDealMethod] = useState<DealMethod>(null);
  const [dealIndex, setDealIndex] = useState(0);
  const [appViewedCount, setAppViewedCount] = useState(0);
  const [roleRevealed, setRoleRevealed] = useState(false);
  const [manualRoleSelection, setManualRoleSelection] = useState<Role | null>(null);
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
  const [nightTarget, setNightTarget] = useState(6);
  const [nightShotChoice, setNightShotChoice] = useState<number | "miss" | null>(null);
  const [nightRecords, setNightRecords] = useState<NightRecord[]>([]);
  const [eventLog, setEventLog] = useState<string[]>(["Выберите способ раздачи ролей"]);
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
  const currentNomination = players.find((player) => player.nominatedBy === currentSeat) ?? null;
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
  const don = players.find((player) => player.alive && player.role === "Дон");
  const sheriff = players.find((player) => player.alive && player.role === "Шериф");
  const checkActor = stage === "nightDon" ? don?.seat ?? 0 : sheriff?.seat ?? 0;
  const shotRecord = nightRecords.find((record) => record.type === "shot");
  const shotResult = shotRecord?.type === "shot" ? shotRecord.target : null;
  const targetRole = players.find((player) => player.seat === nightTarget)?.role;
  const currentCheckResult = stage === "nightDon"
    ? targetRole === "Шериф" ? "Шериф" : "Не шериф"
    : targetRole === "Мафия" || targetRole === "Дон" ? "Мафия" : "Мирный";
  const assignedRoleCounts = standardRoles.reduce<Record<Role, number>>((counts, role) => {
    counts[role] = players.filter((player) => player.role === role).length;
    return counts;
  }, { Мирный: 0, Мафия: 0, Дон: 0, Шериф: 0 });

  const captureSnapshot = (): GameSnapshot => ({
    players,
    stage,
    dealMethod,
    dealIndex,
    appViewedCount,
    roleRevealed,
    manualRoleSelection,
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
    nightTarget,
    nightShotChoice,
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
    setDealMethod(snapshot.dealMethod);
    setDealIndex(snapshot.dealIndex);
    setAppViewedCount(snapshot.appViewedCount);
    setRoleRevealed(snapshot.roleRevealed);
    setManualRoleSelection(snapshot.manualRoleSelection);
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
    setNightTarget(snapshot.nightTarget);
    setNightShotChoice(snapshot.nightShotChoice);
    setNightRecords(snapshot.nightRecords);
    setEventLog(snapshot.eventLog);
    setRunning(false);
  };

  const undo = () => {
    if (stage === "appDeal") {
      if (roleRevealed) {
        setRoleRevealed(false);
        setToast("Роль снова скрыта");
      } else if (dealIndex > 0) {
        setDealIndex((current) => current - 1);
        setToast(`Вернулись к передаче телефона игроку №${dealIndex}`);
      } else if (appViewedCount > 0) {
        setToast("Раздача уже началась · просмотренные роли нельзя перемешать незаметно");
      } else {
        setPlayers(initialPlayers);
        setDealMethod(null);
        setStage("dealChoice");
      }
      return;
    }
    if (stage === "manualDeal") {
      if (manualRoleSelection) {
        setManualRoleSelection(null);
      } else if (dealIndex > 0) {
        const previousIndex = dealIndex - 1;
        const previousRole = players[previousIndex].role;
        setPlayers((current) => current.map((player, index) => index === previousIndex ? { ...player, role: null } : player));
        setDealIndex(previousIndex);
        setManualRoleSelection(previousRole);
      } else {
        setPlayers(initialPlayers);
        setDealMethod(null);
        setStage("dealChoice");
      }
      return;
    }
    if (stage === "dealReady") {
      if (dealMethod === "app") {
        setStage("appDeal");
        setDealIndex(9);
        setRoleRevealed(false);
      } else {
        const previousRole = players[9].role;
        setPlayers((current) => current.map((player, index) => index === 9 ? { ...player, role: null } : player));
        setDealIndex(9);
        setManualRoleSelection(previousRole);
        setStage("manualDeal");
      }
      return;
    }
    if (stage === "nightShot" && nightShotChoice !== null) {
      setNightShotChoice(null);
      setToast("Выбор отстрела сброшен");
      return;
    }
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

  const beginAppDeal = () => {
    const roles = shuffleRoles();
    setPlayers(initialPlayers.map((player, index) => ({ ...player, role: roles[index] })));
    setDealMethod("app");
    setDealIndex(0);
    setAppViewedCount(0);
    setRoleRevealed(false);
    setManualRoleSelection(null);
    setStage("appDeal");
    setToast("Передайте телефон игроку №1");
  };

  const beginManualDeal = () => {
    setPlayers(initialPlayers.map((player) => ({ ...player })));
    setDealMethod("cards");
    setDealIndex(0);
    setAppViewedCount(0);
    setRoleRevealed(false);
    setManualRoleSelection(null);
    setStage("manualDeal");
    setToast("Введите роль игрока №1");
  };

  const advanceAppDeal = () => {
    if (!roleRevealed) {
      setRoleRevealed(true);
      setAppViewedCount((current) => Math.max(current, dealIndex + 1));
      return;
    }
    setRoleRevealed(false);
    if (dealIndex < players.length - 1) {
      setDealIndex((current) => current + 1);
      setToast(`Роль скрыта · передайте телефон игроку №${dealIndex + 2}`);
    } else {
      setStage("dealReady");
      setToast("Все 10 ролей розданы · верните телефон ведущему");
    }
  };

  const confirmManualRole = () => {
    if (!manualRoleSelection) return;
    const assignedRole = manualRoleSelection;
    setPlayers((current) => current.map((player, index) => index === dealIndex ? { ...player, role: assignedRole } : player));
    setManualRoleSelection(null);
    if (dealIndex < players.length - 1) {
      setDealIndex((current) => current + 1);
      setToast(`Роль игрока №${dealIndex + 1} записана · дальше №${dealIndex + 2}`);
    } else {
      setStage("dealReady");
      setToast("Все роли внесены · состав готов");
    }
  };

  const startGame = () => {
    if (players.some((player) => player.role === null)) {
      setToast("Сначала назначьте роли всем десяти игрокам");
      return;
    }
    if (roleOptions.some((role) => assignedRoleCounts[role] !== roleLimits[role])) {
      setToast("Проверьте состав: 6 мирных, 2 мафии, Дон и Шериф");
      return;
    }
    setPlayers((current) => current.map((player) => ({
      ...player,
      fouls: 0,
      nomination: null,
      nominatedBy: null,
      alive: true,
    })));
    setStage("speech");
    setDay(1);
    setRound(1);
    setRoundStarter(1);
    setCurrentSeat(1);
    setSelectedSeat(1);
    setSpokenSeats([]);
    setSeconds(60);
    setRunning(false);
    setVoteState(emptyVoteState);
    setTieSeats([]);
    setTieSpeechIndex(0);
    setLiftDraft([]);
    setNightTarget(1);
    setNightShotChoice(null);
    setNightRecords([]);
    setEventLog(["Круг 1 начался с игрока №1"]);
    setHistory([]);
    setToast("Роли готовы · речь начинает игрок №1");
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
    if (selectedPlayer.nomination !== null) {
      setToast(`Игрок №${selectedSeat} уже выставлен игроком №${selectedPlayer.nominatedBy}`);
      return;
    }
    if (currentNomination) {
      setToast(`Игрок №${currentSeat} уже выставил игрока №${currentNomination.seat}`);
      return;
    }
    remember(`выставление игрока №${selectedSeat} игроком №${currentSeat}`);
    const nextOrder = nominees.length ? Math.max(...nominees.map((player) => player.nomination!)) + 1 : 1;
    setPlayers((current) => current.map((player) => player.seat === selectedSeat
      ? { ...player, nomination: nextOrder, nominatedBy: currentSeat }
      : player));
    const message = `Игрок №${currentSeat} выставил №${selectedSeat} · кандидат ${nextOrder}`;
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
    const activeDon = nightPlayers.find((player) => player.alive && player.role === "Дон");
    const activeSheriff = nightPlayers.find((player) => player.alive && player.role === "Шериф");
    const nextNightStage: Stage = activeBlack.length ? "nightShot" : activeDon ? "nightDon" : activeSheriff ? "nightSheriff" : "nightSummary";
    const firstChecker = activeDon?.seat ?? activeSheriff?.seat ?? 0;
    setStage(nextNightStage);
    setNightTarget(nightPlayers.find((player) => player.alive && player.seat !== firstChecker)?.seat ?? firstChecker);
    setNightShotChoice(null);
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
    remember(`речь игрока №${currentSeat}`);
    setRunning(false);

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
    if (stage === "nightShot") {
      if (nightShotChoice === null) {
        setToast("Выберите отстреленного игрока или промах");
        return;
      }
      remember(nightShotChoice === "miss" ? "промах" : `отстрел игрока №${nightShotChoice}`);
      const record: NightRecord = { type: "shot", target: nightShotChoice === "miss" ? null : nightShotChoice };
      setNightRecords((current) => [...current, record]);
      addLog(nightShotChoice === "miss" ? "Ночь: промах" : `Ночь: отстрелен игрок №${nightShotChoice}`);
      if (don) {
        setStage("nightDon");
        setNightTarget(players.find((player) => player.alive && player.seat !== don.seat)?.seat ?? 1);
        setToast("Отстрел записан · проверка Дона");
      } else if (sheriff) {
        setStage("nightSheriff");
        setNightTarget(players.find((player) => player.alive && player.seat !== sheriff.seat)?.seat ?? 1);
        setToast("Отстрел записан · проверка Шерифа");
      } else {
        setStage("nightSummary");
      }
    } else if (stage === "nightDon") {
      if (!checkActor || nightTarget === checkActor) {
        setToast(nightTarget === checkActor ? "Дон не может проверить себя" : "Дон выбыл");
        return;
      }
      const result: "Шериф" | "Не шериф" = targetRole === "Шериф" ? "Шериф" : "Не шериф";
      remember(`проверка Дона: №${nightTarget} · ${result}`);
      setNightRecords((current) => [...current, { type: "don", target: nightTarget, result }]);
      addLog(`Проверка Дона: №${nightTarget} · ${result}`);
      if (sheriff) {
        setStage("nightSheriff");
        setNightTarget(players.find((player) => player.alive && player.seat !== sheriff.seat)?.seat ?? 1);
        setToast(`${result} · теперь проверка Шерифа`);
      } else {
        setStage("nightSummary");
      }
    } else if (stage === "nightSheriff") {
      if (!checkActor || nightTarget === checkActor) {
        setToast(nightTarget === checkActor ? "Шериф не может проверить себя" : "Шериф выбыл");
        return;
      }
      const result: "Мафия" | "Мирный" = targetRole === "Мафия" || targetRole === "Дон" ? "Мафия" : "Мирный";
      remember(`проверка Шерифа: №${nightTarget} · ${result}`);
      setNightRecords((current) => [...current, { type: "sheriff", target: nightTarget, result }]);
      addLog(`Проверка Шерифа: №${nightTarget} · ${result}`);
      setStage("nightSummary");
      setToast(`${result} · итоги ночи`);
    }
  };

  const beginNextRound = () => {
    remember(`начало круга ${round + 1}`);
    const nextPlayers = players.map((player) => shotResult === player.seat ? { ...player, alive: false } : player);
    const nextStarter = nextAliveAfter(roundStarter, nextPlayers);
    setPlayers(nextPlayers.map((player) => ({ ...player, nomination: null, nominatedBy: null })));
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
    setNightShotChoice(null);
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
      } else if (stage !== "nightShot" && seat === checkActor) {
        setToast(stage === "nightDon" ? "Дон не может проверить себя" : "Шериф не может проверить себя");
      } else if (stage === "nightShot") {
        setNightShotChoice(seat);
      } else {
        setNightTarget(seat);
      }
    }
  };

  const isDealStage = stage === "dealChoice" || stage === "appDeal" || stage === "manualDeal" || stage === "dealReady";
  const undoAvailable = isDealStage
    ? stage !== "dealChoice"
    : history.length > 0
      || ((stage === "vote" || stage === "revote") && voteState.draft.length > 0)
      || (stage === "lift" && liftDraft.length > 0)
      || (stage === "nightShot" && nightShotChoice !== null);

  if (isDealStage) {
    const dealPlayer = players[dealIndex] ?? players[0];
    const dealRole = dealPlayer.role;
    const setupLabel = stage === "dealChoice"
      ? "Подготовка партии"
      : stage === "dealReady"
        ? "Роли готовы"
        : `Игрок ${dealIndex + 1} из 10`;
    const setupNote = stage === "appDeal" ? "Приватный просмотр" : stage === "manualDeal" ? "Ввод с колоды" : "Стандартная десятка";

    return (
      <main className="app-shell">
        <section className={`game-app deal-app stage-${stage}`} aria-label="Раздача ролей Mafia Master">
          <header className="game-header">
            <div className="header-main">
              <button className="undo-button" onClick={undo} disabled={!undoAvailable} aria-label="Вернуться назад">
                <span>↶</span>Назад
              </button>
              <div className="game-heading"><span>MAFIA MASTER · НОВАЯ ИГРА</span><strong>Раздача ролей</strong></div>
              <div className="app-brand">M</div>
            </div>
            <div className="stage-status deal-status" aria-live="polite">
              <span className="stage-dot" />
              <div><small>Сейчас</small><strong>{setupLabel}</strong></div>
              <span>{setupNote}</span>
            </div>
          </header>

          {stage === "dealChoice" && (
            <section className="deal-panel deal-choice">
              <div className="deal-intro">
                <span className="deal-eyebrow">Перед началом игры</span>
                <h1>Как раздать роли?</h1>
                <p>Выберите один способ. После раздачи приложение само поведёт ведущего по всей партии.</p>
              </div>
              <div className="role-composition" aria-label="Состав ролей">
                <span><b>6</b> мирных</span><span><b>2</b> мафии</span><span><b>1</b> Дон</span><span><b>1</b> Шериф</span>
              </div>
              <div className="deal-methods">
                <button onClick={beginAppDeal}>
                  <span className="method-icon">▣</span>
                  <span><small>Без колоды</small><strong>Через приложение</strong><em>Роли перемешаются, игроки посмотрят их по очереди</em></span>
                  <b>→</b>
                </button>
                <button onClick={beginManualDeal}>
                  <span className="method-icon cards">♠</span>
                  <span><small>Свои карты</small><strong>При помощи колоды</strong><em>Ведущий раздаст карты и внесёт каждую роль</em></span>
                  <b>→</b>
                </button>
              </div>
              <div className="deal-footnote"><i>●</i> Роли хранятся только до конца текущей партии</div>
            </section>
          )}

          {stage === "appDeal" && (
            <section className="deal-panel app-deal">
              <div className="deal-progress"><span style={{ width: `${((dealIndex + (roleRevealed ? 1 : 0)) / 10) * 100}%` }} /></div>
              <div className="handoff-copy">
                <span>{roleRevealed ? "Только для вас" : "Передайте телефон"}</span>
                <h2>Игрок №{dealPlayer.seat}</h2>
                <p>{roleRevealed ? "Запомните роль и никому её не показывайте" : "Остальные игроки закрывают глаза и не смотрят на экран"}</p>
              </div>
              <div className={`private-role-card ${roleRevealed && dealRole ? `is-revealed role-${roleClassNames[dealRole]}` : ""}`}>
                <div className="card-corner">M</div>
                {roleRevealed && dealRole ? (
                  <div className="revealed-role"><span>Ваша роль</span><strong>{dealRole}</strong><p>{roleDescriptions[dealRole]}</p></div>
                ) : (
                  <div className="hidden-role"><span>?</span><strong>Роль скрыта</strong><p>Нажмите кнопку, когда экран видит только игрок №{dealPlayer.seat}</p></div>
                )}
                <div className="card-corner bottom">M</div>
              </div>
              <button className="primary-action deal-primary" onClick={advanceAppDeal}>
                <span><small>{roleRevealed ? "После нажатия роль сразу исчезнет" : "Убедитесь, что никто не подсматривает"}</small>{roleRevealed ? dealIndex < 9 ? `Запомнил · передать №${dealIndex + 2}` : "Запомнил · скрыть роль" : "Показать мою роль"}</span>
                <strong>{roleRevealed ? "→" : "⌁"}</strong>
              </button>
            </section>
          )}

          {stage === "manualDeal" && (
            <section className="deal-panel manual-deal">
              <div className="deal-progress"><span style={{ width: `${(dealIndex / 10) * 100}%` }} /></div>
              <div className="handoff-copy">
                <span>Карта из колоды</span>
                <h2>Игрок №{dealPlayer.seat}</h2>
                <p>Какую роль получил игрок? Приложение проследит за правильным составом.</p>
              </div>
              <div className="role-grid">
                {roleOptions.map((role) => {
                  const remaining = roleLimits[role] - assignedRoleCounts[role];
                  const isSelected = manualRoleSelection === role;
                  return (
                    <button
                      key={role}
                      className={`role-option role-${roleClassNames[role]} ${isSelected ? "is-selected" : ""}`}
                      onClick={() => setManualRoleSelection(role)}
                      disabled={remaining <= 0 && !isSelected}
                    >
                      <span>{role === "Мирный" ? "○" : role === "Мафия" ? "●" : role === "Дон" ? "♛" : "✦"}</span>
                      <strong>{role}</strong>
                      <small>{remaining > 0 ? `осталось ${remaining}` : "все назначены"}</small>
                    </button>
                  );
                })}
              </div>
              <div className="manual-balance">{roleOptions.map((role) => <span key={role} className={assignedRoleCounts[role] === roleLimits[role] ? "is-full" : ""}><b>{assignedRoleCounts[role]}</b>/{roleLimits[role]} {role}</span>)}</div>
              <button className="primary-action deal-primary" onClick={confirmManualRole} disabled={!manualRoleSelection}>
                <span><small>{manualRoleSelection ? `Игрок №${dealPlayer.seat} · ${manualRoleSelection}` : "Сначала выберите роль"}</small>{manualRoleSelection ? dealIndex < 9 ? `Записать · дальше №${dealIndex + 2}` : "Записать последнюю роль" : "Выберите роль игрока"}</span>
                <strong>→</strong>
              </button>
            </section>
          )}

          {stage === "dealReady" && (
            <section className="deal-panel deal-ready">
              <div className="ready-seal"><span>✓</span></div>
              <span className="deal-eyebrow">Раздача завершена</span>
              <h1>Все роли готовы</h1>
              <p>{dealMethod === "app" ? "Все десять игроков посмотрели свои роли. Верните телефон ведущему." : "Ведущий внёс все карты. Состав проверен и готов к игре."}</p>
              <div className="ready-composition"><div><strong>6</strong><span>мирных</span></div><div><strong>2</strong><span>мафии</span></div><div><strong>1</strong><span>Дон</span></div><div><strong>1</strong><span>Шериф</span></div></div>
              <div className="first-speaker"><span>Первую речь начинает</span><strong>Игрок №1</strong><small>дальше — только по часовой стрелке</small></div>
              <button className="primary-action deal-primary" onClick={startGame}>
                <span><small>Раздача закроется и роли останутся у ведущего</small>Начать игру · речь №1</span><strong>→</strong>
              </button>
            </section>
          )}

          {toast && <div className="toast" role="status"><span>{toast}</span><button onClick={() => setToast(null)} aria-label="Закрыть сообщение">×</button></div>}
        </section>
      </main>
    );
  }

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
    stageLabel = "Ночь · отстрел";
    stageNote = nightShotChoice === "miss" ? "Выбран промах" : typeof nightShotChoice === "number" ? `Выбывает №${nightShotChoice}` : "Выберите исход";
  } else if (stage === "nightDon") {
    stageLabel = "Ночь · проверка Дона";
    stageNote = currentCheckResult.toUpperCase();
  } else if (stage === "nightSheriff") {
    stageLabel = "Ночь · проверка Шерифа";
    stageNote = currentCheckResult.toUpperCase();
  } else {
    stageLabel = "Итоги ночи";
    stageNote = shotResult ? `Выбывает №${shotResult}` : shotRecord ? "Промах" : "Без отстрела";
  }

  const primaryLabel = stage === "speech"
    ? isLastSpeech
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
            : stage === "nightShot"
              ? nightShotChoice === "miss" ? "Зафиксировать промах" : typeof nightShotChoice === "number" ? `Подтвердить отстрел №${nightShotChoice}` : "Выберите игрока или промах"
              : stage === "nightDon"
                ? sheriff ? `Записать · ${currentCheckResult.toUpperCase()} · к Шерифу` : `Записать · ${currentCheckResult.toUpperCase()}`
                : `Записать · ${currentCheckResult.toUpperCase()} · к итогам`;

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
  const primaryDisabled = stage === "nightShot" && nightShotChoice === null;

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
              <div className="workflow-center night-result"><span>Итог ночи</span><strong>{shotResult ? `№${shotResult}` : shotRecord ? "Промах" : "Без отстрела"}</strong><small>{shotResult ? "покидает стол утром" : "никто не выбывает"}</small></div>
            ) : stage === "nightShot" ? (
              <div className="workflow-center night-shot-choice"><span>Результат отстрела</span><strong>{nightShotChoice === "miss" ? "ПРОМАХ" : typeof nightShotChoice === "number" ? `№${nightShotChoice}` : "—"}</strong><small>выберите игрока на столе или промах</small></div>
            ) : (
              <div className={`workflow-center check-result ${currentCheckResult === "Мафия" ? "is-mafia" : currentCheckResult === "Шериф" ? "is-sheriff" : "is-clear"}`}><span>{stage === "nightDon" ? "Дон проверяет Шерифа" : "Шериф проверяет мафию"} · №{nightTarget}</span><strong>{currentCheckResult.toUpperCase()}</strong><small>тапните другого игрока, чтобы изменить цель</small></div>
            )}
          </div>

          <div className="table-seats">
            {players.map((player) => {
              const lockedCandidate = (stage === "vote" || stage === "revote") ? assignmentFor(player.seat, voteState.confirmed) : null;
              const draftVote = (stage === "vote" || stage === "revote") && voteState.draft.includes(player.seat);
              const liftVote = stage === "lift" && liftDraft.includes(player.seat);
              const isTarget = stage === "nightShot" ? nightShotChoice === player.seat : (stage === "nightDon" || stage === "nightSheriff") && nightTarget === player.seat;
              const isCandidate = (stage === "vote" || stage === "revote") && currentCandidate === player.seat;
              const isSelected = stage === "speech" && selectedSeat === player.seat;
              const marker = lockedCandidate !== null ? `→${lockedCandidate}` : draftVote ? "✓" : liftVote ? "ЗА" : isTarget ? stage === "nightShot" ? "ОТСТРЕЛ" : "ПРОВЕРКА" : null;
              return (
                <button
                  key={player.seat}
                  className={`table-seat seat-${player.seat} ${isSelected ? "is-selected" : ""} ${stage === "speech" && currentSeat === player.seat ? "is-current" : ""} ${player.nomination ? "is-nominated" : ""} ${isCandidate ? "is-candidate" : ""} ${draftVote || liftVote ? "is-draft-vote" : ""} ${isTarget ? "is-night-target" : ""} ${lockedCandidate !== null ? "has-voted" : ""} ${!player.alive ? "is-eliminated" : ""}`}
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
              return <li key={player.seat} className={currentCandidate === player.seat ? "is-current" : confirmedCount !== undefined ? "is-done" : ""}><span>{index + 1}</span><strong>№{player.seat}</strong><small>{confirmedCount !== undefined ? `${confirmedCount} гол.` : `от №${player.nominatedBy}`}</small></li>;
            })}</ol>
          </section>
        )}

        <section className="control-panel">
          {stage === "speech" && (
            <>
              <div className="selected-player">
                <div className="selected-number">{selectedPlayer.seat}</div>
                <div className="selected-copy"><span>{selectedSeat === currentSeat ? "Сейчас говорит" : "Действия с игроком"}</span><strong>{selectedPlayer.name}</strong></div>
                <div className="selected-fouls"><span>{selectedPlayer.fouls} / 4 фола</span><FoulMarks count={selectedPlayer.fouls} /></div>
              </div>
              <div className="quick-actions">
                <button onClick={addFoul} disabled={!selectedPlayer.alive}><span>+</span><strong>Фол №{selectedSeat}</strong></button>
                <button onClick={toggleNomination} disabled={!selectedPlayer.alive}><span>{selectedPlayer.nomination ? "✓" : currentNomination ? "1" : "↓"}</span><strong>{selectedPlayer.nomination ? "Уже в списке" : currentNomination ? `№${currentSeat} → №${currentNomination.seat}` : `Выставить №${selectedSeat}`}</strong></button>
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
          {stage === "nightShot" && <div className="shot-control"><div><span>Отстрел</span><strong>{typeof nightShotChoice === "number" ? `Выбран игрок №${nightShotChoice}` : nightShotChoice === "miss" ? "Выбран промах" : "Коснитесь игрока на столе"}</strong><small>Номер стрелявшего не нужен — фиксируется только результат.</small></div><button className={nightShotChoice === "miss" ? "is-selected" : ""} onClick={() => setNightShotChoice("miss")}><span>×</span><strong>Промах</strong></button></div>}
          {(stage === "nightDon" || stage === "nightSheriff") && <div className={`check-instruction ${currentCheckResult === "Мафия" ? "is-mafia" : currentCheckResult === "Шериф" ? "is-sheriff" : "is-clear"}`}><span>{stage === "nightDon" ? "Проверка Дона" : "Проверка Шерифа"}</span><div><small>Игрок №{nightTarget}</small><strong>{currentCheckResult.toUpperCase()}</strong></div><p>{stage === "nightDon" ? "Приложение показывает: Шериф или не Шериф" : "Приложение показывает: Мафия или Мирный"}</p></div>}
          {stage === "nightSummary" && <div className="night-summary"><span>Ночь записана</span>{nightRecords.map((record, index) => <div key={`${record.type}-${record.target ?? "miss"}-${index}`}><strong>{record.type === "shot" ? "Отстрел" : record.type === "don" ? "Проверка Дона" : "Проверка Шерифа"}</strong><span>{record.type === "shot" ? record.target ? `игрок №${record.target}` : "промах" : `№${record.target} · ${record.result.toUpperCase()}`}</span></div>)}<div className="night-outcome"><strong>Утром</strong><span>{shotResult ? `выбывает №${shotResult}` : "никто не выбывает"}</span></div></div>}

          <button className="primary-action" onClick={onPrimary} disabled={primaryDisabled}>
            <span><small>{stage === "speech" ? "Речи идут по часовой стрелке" : stage === "vote" || stage === "revote" ? `${voteState.draft.length} ${voteWord(voteState.draft.length)} будет зафиксировано` : "Следующий этап откроется автоматически"}</small>{primaryLabel}</span>
            <strong>→</strong>
          </button>
        </section>

        {toast && <div className="toast" role="status"><span>{toast}</span><button onClick={() => setToast(null)} aria-label="Закрыть сообщение">×</button></div>}
      </section>
    </main>
  );
}
