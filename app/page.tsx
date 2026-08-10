"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  canPerformNightCheck,
  canSaveNominationPair,
  getWinner,
  nextNightStageAfterSkip,
  normalizeNominationPairs,
  orderNominationPairsBySpeech,
  resolveTieOutcome,
  shouldEndFarewellForPenalty,
  type NominationPair,
  type Winner,
} from "./game-rules";

type Stage =
  | "dealChoice"
  | "appDeal"
  | "manualDeal"
  | "dealReady"
  | "agreement"
  | "freeSeating"
  | "morningReady"
  | "speech"
  | "farewellSpeech"
  | "nominationReview"
  | "vote"
  | "tieSpeech"
  | "revote"
  | "lift"
  | "nightShot"
  | "nightDon"
  | "nightSheriff"
  | "nightSummary"
  | "gameOver";

type Role = "Мирный" | "Мафия" | "Дон" | "Шериф";
type DealMethod = "app" | "cards" | null;
type VoteMap = Record<number, number[]>;
type EliminationReason = "fouls" | "yellowCards" | "vote" | "shot" | null;
type FarewellState = {
  seats: number[];
  index: number;
  reason: "vote" | "shot";
  after: "night" | "round";
} | null;

type Player = {
  seat: number;
  name: string;
  role: Role | null;
  fouls: number;
  yellowCards: number;
  shortSpeechPending: boolean;
  nomination: number | null;
  nominatedBy: number | null;
  alive: boolean;
  eliminatedBy: EliminationReason;
};

type NominationRecord = {
  day: number;
  round: number;
  order: number;
  nominatorSeat: number;
  candidateSeat: number;
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
  | { type: "don"; target: number | null; result: "Шериф" | "Не шериф" | "Пропуск"; checkedEmptySeat: boolean }
  | { type: "sheriff"; target: number | null; result: "Мафия" | "Мирный" | "Пропуск"; checkedEmptySeat: boolean };

type GameSnapshot = {
  players: Player[];
  stage: Stage;
  dealMethod: DealMethod;
  dealIndex: number;
  appViewedCount: number;
  roleRevealed: boolean;
  masterSummaryVisible: boolean;
  day: number;
  round: number;
  roundStarter: number;
  currentSeat: number;
  selectedSeat: number;
  spokenSeats: number[];
  seconds: number;
  timerBaseSeconds: number;
  timerTotalSeconds: number;
  running: boolean;
  voteState: VoteState;
  tieSeats: number[];
  tieSpeechIndex: number;
  tieCycle: number;
  liftDraft: number[];
  voteSkips: number;
  nightTarget: number;
  nightShotChoice: number | "miss" | null;
  nightRecords: NightRecord[];
  farewellState: FarewellState;
  nominationRecords: NominationRecord[];
  eventLog: string[];
};

type UndoEntry = {
  label: string;
  snapshot: GameSnapshot;
};

type TelegramWebApp = {
  ready: () => void;
  expand: () => void;
  isVersionAtLeast?: (version: string) => boolean;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const initialPlayers: Player[] = [
  { seat: 1, name: "Анна", role: null, fouls: 0, yellowCards: 0, shortSpeechPending: false, nomination: null, nominatedBy: null, alive: true, eliminatedBy: null },
  { seat: 2, name: "Борис", role: null, fouls: 0, yellowCards: 0, shortSpeechPending: false, nomination: null, nominatedBy: null, alive: true, eliminatedBy: null },
  { seat: 3, name: "Вика", role: null, fouls: 0, yellowCards: 0, shortSpeechPending: false, nomination: null, nominatedBy: null, alive: true, eliminatedBy: null },
  { seat: 4, name: "Глеб", role: null, fouls: 0, yellowCards: 0, shortSpeechPending: false, nomination: null, nominatedBy: null, alive: true, eliminatedBy: null },
  { seat: 5, name: "Дана", role: null, fouls: 0, yellowCards: 0, shortSpeechPending: false, nomination: null, nominatedBy: null, alive: true, eliminatedBy: null },
  { seat: 6, name: "Егор", role: null, fouls: 0, yellowCards: 0, shortSpeechPending: false, nomination: null, nominatedBy: null, alive: true, eliminatedBy: null },
  { seat: 7, name: "Жанна", role: null, fouls: 0, yellowCards: 0, shortSpeechPending: false, nomination: null, nominatedBy: null, alive: true, eliminatedBy: null },
  { seat: 8, name: "Илья", role: null, fouls: 0, yellowCards: 0, shortSpeechPending: false, nomination: null, nominatedBy: null, alive: true, eliminatedBy: null },
  { seat: 9, name: "Кира", role: null, fouls: 0, yellowCards: 0, shortSpeechPending: false, nomination: null, nominatedBy: null, alive: true, eliminatedBy: null },
  { seat: 10, name: "Лев", role: null, fouls: 0, yellowCards: 0, shortSpeechPending: false, nomination: null, nominatedBy: null, alive: true, eliminatedBy: null },
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

function YellowMarks({ count }: { count: number }) {
  return (
    <span className="yellow-marks" aria-label={`Жёлтых карточек: ${count}`}>
      {[0, 1].map((card) => <span key={card} className={card < count ? "is-filled" : ""} />)}
    </span>
  );
}

function RoleGlyph({ role, className = "" }: { role: Role; className?: string }) {
  return <span className={`role-glyph role-${roleClassNames[role]} ${className}`} role="img" aria-label={role}><i className="role-icon" aria-hidden="true" /></span>;
}

function RoleMiniMap({ players, currentSeat, title = "Карта ролей" }: { players: Player[]; currentSeat?: number; title?: string }) {
  return (
    <section className="role-mini-map" aria-label={title}>
      <div className="mini-map-core"><span>M</span><small>{title}</small></div>
      {players.map((player) => (
        <div
          key={player.seat}
          className={`mini-role-seat mini-seat-${player.seat} ${player.role ? `has-role role-${roleClassNames[player.role]}` : ""} ${currentSeat === player.seat ? "is-current" : ""}`}
          aria-label={`Игрок №${player.seat}${player.role ? `, ${player.role}` : ", роль не внесена"}`}
        >
          <b>{player.seat}</b>
          {player.role ? <RoleGlyph role={player.role} className="mini-role-glyph" /> : <span className="mini-role-placeholder" aria-hidden="true">·</span>}
        </div>
      ))}
    </section>
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

function firstCheckTarget(actorSeat: number, players: Player[]) {
  return players.find((player) => player.alive && player.seat !== actorSeat)?.seat
    ?? players.find((player) => player.seat !== actorSeat)?.seat
    ?? actorSeat;
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

function roleForCheckResult(result: "Шериф" | "Не шериф" | "Мафия" | "Мирный" | "Пропуск"): Role | null {
  if (result === "Шериф" || result === "Мафия" || result === "Мирный") return result;
  return null;
}

export default function Home() {
  const [players, setPlayers] = useState(initialPlayers);
  const [stage, setStage] = useState<Stage>("dealChoice");
  const [dealMethod, setDealMethod] = useState<DealMethod>(null);
  const [dealIndex, setDealIndex] = useState(0);
  const [appViewedCount, setAppViewedCount] = useState(0);
  const [roleRevealed, setRoleRevealed] = useState(false);
  const [masterSummaryVisible, setMasterSummaryVisible] = useState(false);
  const [rolesVisible, setRolesVisible] = useState(false);
  const [day, setDay] = useState(1);
  const [round, setRound] = useState(1);
  const [roundStarter, setRoundStarter] = useState(1);
  const [currentSeat, setCurrentSeat] = useState(1);
  const [selectedSeat, setSelectedSeat] = useState(1);
  const [spokenSeats, setSpokenSeats] = useState<number[]>([]);
  const [seconds, setSeconds] = useState(60);
  const [timerBaseSeconds, setTimerBaseSeconds] = useState(60);
  const [timerTotalSeconds, setTimerTotalSeconds] = useState(60);
  const [running, setRunning] = useState(false);
  const [voteState, setVoteState] = useState<VoteState>(emptyVoteState);
  const [tieSeats, setTieSeats] = useState<number[]>([]);
  const [tieSpeechIndex, setTieSpeechIndex] = useState(0);
  const [tieCycle, setTieCycle] = useState(0);
  const [liftDraft, setLiftDraft] = useState<number[]>([]);
  const [voteSkips, setVoteSkips] = useState(0);
  const [nightTarget, setNightTarget] = useState(6);
  const [nightShotChoice, setNightShotChoice] = useState<number | "miss" | null>(null);
  const [nightRecords, setNightRecords] = useState<NightRecord[]>([]);
  const [farewellState, setFarewellState] = useState<FarewellState>(null);
  const [nominationRecords, setNominationRecords] = useState<NominationRecord[]>([]);
  const [eventLog, setEventLog] = useState<string[]>(["Выберите способ раздачи ролей"]);
  const [history, setHistory] = useState<UndoEntry[]>([]);
  const [penaltyPanelOpen, setPenaltyPanelOpen] = useState(false);
  const [editingNominationOrder, setEditingNominationOrder] = useState<number | null>(null);
  const [draftNominator, setDraftNominator] = useState(1);
  const [draftCandidate, setDraftCandidate] = useState(2);
  const [, setToast] = useState<string | null>(null);
  const deadlineRef = useRef(0);
  const manualAssignLockRef = useRef(false);

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;

    if (webApp.isVersionAtLeast?.("6.1") ?? true) {
      webApp.setHeaderColor?.("#090b08");
      webApp.setBackgroundColor?.("#090b08");
    }
    if (webApp.isVersionAtLeast?.("7.10") ?? true) webApp.setBottomBarColor?.("#090b08");
    webApp.expand();
    webApp.ready();
  }, []);

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;
    if (!(webApp.isVersionAtLeast?.("6.2") ?? true)) return;

    if (stage === "dealChoice") webApp.disableClosingConfirmation?.();
    else webApp.enableClosingConfirmation?.();
  }, [stage]);

  const selectedPlayer = players.find((player) => player.seat === selectedSeat) ?? players[0];
  const currentPlayer = players.find((player) => player.seat === currentSeat) ?? players[0];
  const alivePlayers = players.filter((player) => player.alive);
  const aliveBlackCount = alivePlayers.filter((player) => player.role === "Мафия" || player.role === "Дон").length;
  const aliveRedCount = alivePlayers.length - aliveBlackCount;
  const winner: Winner | null = stage === "gameOver" ? getWinner(players) : null;
  const nominees = useMemo(
    () => players.filter((player) => player.alive && player.nomination !== null).sort((a, b) => a.nomination! - b.nomination!),
    [players],
  );
  const nominationPairs = useMemo<NominationPair[]>(
    () => players
      .filter((player) => player.nomination !== null && player.nominatedBy !== null)
      .map((player) => ({ order: player.nomination!, nominatorSeat: player.nominatedBy!, candidateSeat: player.seat }))
      .sort((left, right) => left.order - right.order),
    [players],
  );
  const currentNomination = players.find((player) => player.nominatedBy === currentSeat) ?? null;
  const speechOrder = orderedAliveFrom(roundStarter, players);
  const remainingSpeechSeats = speechOrder.filter((seat) => !spokenSeats.includes(seat) && seat !== currentSeat);
  const nextSpeechSeat = remainingSpeechSeats[0] ?? null;
  const isLastSpeech = nextSpeechSeat === null;
  const currentCandidate = voteState.candidates[voteState.index] ?? null;
  const lockedVoters = Object.values(voteState.confirmed).flat();
  const isVotingSequence = stage === "vote" || stage === "tieSpeech" || stage === "revote" || stage === "lift";
  const penaltyAvailable = stage === "speech" || stage === "tieSpeech";
  const isNightCheckStage = stage === "nightDon" || stage === "nightSheriff";
  const isTimedStage = stage === "agreement" || stage === "freeSeating" || stage === "speech" || stage === "tieSpeech" || stage === "farewellSpeech" || isNightCheckStage;
  const timerLimit = timerBaseSeconds;
  const timerProgress = Math.max(0, Math.min(100, (seconds / Math.max(1, timerTotalSeconds)) * 100));
  const isWarning = isTimedStage && seconds <= 10;
  const shotRecord = nightRecords.find((record) => record.type === "shot");
  const shotResult = shotRecord?.type === "shot" ? shotRecord.target : null;
  const don = players.find((player) => player.role === "Дон" && canPerformNightCheck(player.alive, shotResult === player.seat));
  const sheriff = players.find((player) => player.role === "Шериф" && canPerformNightCheck(player.alive, shotResult === player.seat));
  const checkActor = stage === "nightDon" ? don?.seat ?? 0 : sheriff?.seat ?? 0;
  const targetPlayer = players.find((player) => player.seat === nightTarget);
  const targetRole = targetPlayer?.role;
  const currentCheckResult = stage === "nightDon"
    ? targetRole === "Шериф" ? "Шериф" : "Не шериф"
    : targetRole === "Мафия" || targetRole === "Дон" ? "Мафия" : "Мирный";
  const currentCheckRole = roleForCheckResult(currentCheckResult);
  const currentCheckClass = currentCheckRole ? `role-${roleClassNames[currentCheckRole]}` : "is-neutral";
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
    masterSummaryVisible,
    day,
    round,
    roundStarter,
    currentSeat,
    selectedSeat,
    spokenSeats,
    seconds,
    timerBaseSeconds,
    timerTotalSeconds,
    running,
    voteState,
    tieSeats,
    tieSpeechIndex,
    tieCycle,
    liftDraft,
    voteSkips,
    nightTarget,
    nightShotChoice,
    nightRecords,
    farewellState,
    nominationRecords,
    eventLog,
  });

  const startCountdown = (value: number) => {
    // Countdown setup runs only from user actions or effects, where reading the wall clock is intentional.
    // eslint-disable-next-line react-hooks/purity
    deadlineRef.current = Date.now() + value * 1000;
    setTimerBaseSeconds(value);
    setTimerTotalSeconds(value);
    setSeconds(value);
    setRunning(true);
  };

  const startNormalSpeech = (seat: number, roster: Player[] = players) => {
    const shortSpeech = roster.find((player) => player.seat === seat)?.shortSpeechPending ?? false;
    const duration = shortSpeech ? 30 : 50;
    setPlayers(roster.map((player) => player.seat === seat ? { ...player, shortSpeechPending: false } : player));
    setCurrentSeat(seat);
    setStage("speech");
    startCountdown(duration);
    return duration;
  };

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

  useEffect(() => {
    manualAssignLockRef.current = false;
  }, [dealIndex, stage]);

  const remember = (label: string) => {
    const entry = { label, snapshot: captureSnapshot() };
    setHistory((current) => [...current.slice(-24), entry]);
  };

  const addLog = (entry: string) => setEventLog((current) => [entry, ...current].slice(0, 12));

  const finishGameIfNeeded = (roster: Player[]) => {
    const result = getWinner(roster);
    if (!result) return false;

    const winnerLabel = result === "red" ? "красных" : "чёрных";
    setPlayers(roster);
    setFarewellState(null);
    setRunning(false);
    setStage("gameOver");
    setRolesVisible(true);
    setPenaltyPanelOpen(false);
    addLog(`Игра завершена · победа ${winnerLabel}`);
    setToast(`Победа ${winnerLabel}`);
    return true;
  };

  const restoreSnapshot = (snapshot: GameSnapshot) => {
    setPenaltyPanelOpen(false);
    setEditingNominationOrder(null);
    setPlayers(snapshot.players);
    setStage(snapshot.stage);
    setDealMethod(snapshot.dealMethod);
    setDealIndex(snapshot.dealIndex);
    setAppViewedCount(snapshot.appViewedCount);
    setRoleRevealed(snapshot.roleRevealed);
    setMasterSummaryVisible(snapshot.masterSummaryVisible);
    setDay(snapshot.day);
    setRound(snapshot.round);
    setRoundStarter(snapshot.roundStarter);
    setCurrentSeat(snapshot.currentSeat);
    setSelectedSeat(snapshot.selectedSeat);
    setSpokenSeats(snapshot.spokenSeats);
    setSeconds(snapshot.seconds);
    setTimerBaseSeconds(snapshot.timerBaseSeconds);
    setTimerTotalSeconds(snapshot.timerTotalSeconds);
    setVoteState(snapshot.voteState);
    setTieSeats(snapshot.tieSeats);
    setTieSpeechIndex(snapshot.tieSpeechIndex);
    setTieCycle(snapshot.tieCycle);
    setLiftDraft(snapshot.liftDraft);
    setVoteSkips(snapshot.voteSkips);
    setNightTarget(snapshot.nightTarget);
    setNightShotChoice(snapshot.nightShotChoice);
    setNightRecords(snapshot.nightRecords);
    setFarewellState(snapshot.farewellState);
    setNominationRecords(snapshot.nominationRecords);
    setEventLog(snapshot.eventLog);
    if (snapshot.running && snapshot.seconds > 0) {
      deadlineRef.current = Date.now() + snapshot.seconds * 1000;
      setRunning(true);
    } else {
      setRunning(false);
    }
  };

  const undo = () => {
    if (stage === "gameOver") setRolesVisible(false);
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
      if (dealIndex > 0) {
        const previousIndex = dealIndex - 1;
        setPlayers((current) => current.map((player, index) => index === previousIndex ? { ...player, role: null } : player));
        setDealIndex(previousIndex);
        setToast(`Роль игрока №${previousIndex + 1} отменена`);
      } else {
        setPlayers(initialPlayers);
        setDealMethod(null);
        setStage("dealChoice");
      }
      return;
    }
    if (stage === "dealReady") {
      if (dealMethod === "app") {
        if (masterSummaryVisible) {
          setMasterSummaryVisible(false);
          setToast("Карта ролей снова скрыта");
          return;
        }
        setStage("appDeal");
        setDealIndex(9);
        setRoleRevealed(false);
      } else {
        setPlayers((current) => current.map((player, index) => index === 9 ? { ...player, role: null } : player));
        setDealIndex(9);
        setStage("manualDeal");
      }
      return;
    }
    if (stage === "agreement") {
      setRunning(false);
      setTimerBaseSeconds(60);
      setTimerTotalSeconds(60);
      setSeconds(60);
      setMasterSummaryVisible(false);
      setStage("dealReady");
      setToast("Карта ролей скрыта · подтвердите, что экран у ведущего");
      return;
    }
    if (stage === "freeSeating") {
      const previous = history[history.length - 1];
      if (previous) {
        restoreSnapshot(previous.snapshot);
        setHistory((current) => current.slice(0, -1));
        setToast("Возврат к договорке");
      }
      return;
    }
    if (stage === "morningReady") {
      const previous = history[history.length - 1];
      if (previous) {
        restoreSnapshot(previous.snapshot);
        setHistory((current) => current.slice(0, -1));
        setToast("Возврат к свободной посадке");
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

  const startNewGame = () => {
    deadlineRef.current = 0;
    manualAssignLockRef.current = false;
    setPlayers(initialPlayers.map((player) => ({ ...player })));
    setStage("dealChoice");
    setDealMethod(null);
    setDealIndex(0);
    setAppViewedCount(0);
    setRoleRevealed(false);
    setMasterSummaryVisible(false);
    setRolesVisible(false);
    setDay(1);
    setRound(1);
    setRoundStarter(1);
    setCurrentSeat(1);
    setSelectedSeat(1);
    setSpokenSeats([]);
    setSeconds(60);
    setTimerBaseSeconds(60);
    setTimerTotalSeconds(60);
    setRunning(false);
    setVoteState(emptyVoteState);
    setTieSeats([]);
    setTieSpeechIndex(0);
    setTieCycle(0);
    setLiftDraft([]);
    setVoteSkips(0);
    setNightTarget(1);
    setNightShotChoice(null);
    setNightRecords([]);
    setFarewellState(null);
    setNominationRecords([]);
    setEventLog(["Выберите способ раздачи ролей"]);
    setHistory([]);
    setPenaltyPanelOpen(false);
    setEditingNominationOrder(null);
    setDraftNominator(1);
    setDraftCandidate(2);
    setToast(null);
  };

  const beginAppDeal = () => {
    const roles = shuffleRoles();
    setPlayers(initialPlayers.map((player, index) => ({ ...player, role: roles[index] })));
    setDealMethod("app");
    setDealIndex(0);
    setAppViewedCount(0);
    setRoleRevealed(false);
    setMasterSummaryVisible(false);
    setStage("appDeal");
    setToast("Передайте телефон игроку №1");
  };

  const beginManualDeal = () => {
    setPlayers(initialPlayers.map((player) => ({ ...player })));
    setDealMethod("cards");
    setDealIndex(0);
    setAppViewedCount(0);
    setRoleRevealed(false);
    setMasterSummaryVisible(true);
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
      setMasterSummaryVisible(false);
      setStage("dealReady");
      setToast("Все 10 ролей розданы · верните телефон ведущему");
    }
  };

  const assignManualRole = (assignedRole: Role) => {
    if (manualAssignLockRef.current || assignedRoleCounts[assignedRole] >= roleLimits[assignedRole]) return;
    manualAssignLockRef.current = true;
    setPlayers((current) => current.map((player, index) => index === dealIndex ? { ...player, role: assignedRole } : player));
    if (dealIndex < players.length - 1) {
      setDealIndex((current) => current + 1);
      setToast(`№${dealIndex + 1} · ${assignedRole} · дальше игрок №${dealIndex + 2}`);
    } else {
      setMasterSummaryVisible(true);
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
      yellowCards: 0,
      shortSpeechPending: false,
      nomination: null,
      nominatedBy: null,
      alive: true,
      eliminatedBy: null,
    })));
    setStage("agreement");
    setDay(1);
    setRound(1);
    setRoundStarter(1);
    setCurrentSeat(1);
    setSelectedSeat(1);
    setSpokenSeats([]);
    setVoteState(emptyVoteState);
    setTieSeats([]);
    setTieSpeechIndex(0);
    setTieCycle(0);
    setLiftDraft([]);
    setVoteSkips(0);
    setNightTarget(1);
    setNightShotChoice(null);
    setNightRecords([]);
    setFarewellState(null);
    setNominationRecords([]);
    setRolesVisible(false);
    setEventLog(["Первая ночь · договорка 60 секунд"]);
    setHistory([]);
    setPenaltyPanelOpen(false);
    setEditingNominationOrder(null);
    setDraftNominator(1);
    setDraftCandidate(2);
    startCountdown(60);
    setToast("Просыпается мафия · договорка началась");
  };

  const beginFreeSeating = () => {
    remember("начало свободной посадки");
    setStage("freeSeating");
    startCountdown(40);
    addLog("Свободная посадка · 40 секунд");
    setToast("Мафия засыпает · свободная посадка");
  };

  const enterMorningReady = () => {
    remember(seconds > 0 ? "пропуск свободной посадки" : "переход к утру");
    setRunning(false);
    setTimerBaseSeconds(50);
    setTimerTotalSeconds(50);
    setSeconds(50);
    setStage("morningReady");
    addLog(seconds > 0 ? "Свободная посадка пропущена · утро" : "В городе утро");
    setToast("Речь игрока №1 ждёт команды ведущего");
  };

  const beginFirstSpeech = () => {
    remember("начало речи игрока №1");
    setSpokenSeats([]);
    const duration = startNormalSpeech(1);
    addLog(`Утро · круг 1 начинает игрок №1 · ${duration} секунд`);
    setToast(`Речь игрока №1 началась · ${duration} секунд`);
  };

  const toggleTimer = () => {
    if (running) {
      setSeconds(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)));
      setRunning(false);
      return;
    }
    const nextSeconds = seconds === 0 ? timerLimit : seconds;
    setSeconds(nextSeconds);
    if (seconds === 0) setTimerTotalSeconds(timerLimit);
    deadlineRef.current = Date.now() + nextSeconds * 1000;
    setRunning(true);
  };

  const resetTimer = () => {
    setRunning(false);
    setSeconds(timerLimit);
    setTimerTotalSeconds(timerLimit);
    setToast(`Таймер сброшен на ${timerLimit} секунд`);
  };

  const addFoul = () => {
    if (!selectedPlayer.alive || selectedPlayer.fouls >= 4) return;
    remember(`фол игроку №${selectedSeat}`);
    const nextFouls = selectedPlayer.fouls + 1;
    const isFarewellPenalty = stage === "farewellSpeech" && selectedSeat === currentSeat;
    const nextPlayers = players.map((player) => player.seat === selectedSeat
      ? {
        ...player,
        fouls: nextFouls,
        shortSpeechPending: !isFarewellPenalty && nextFouls === 3 ? true : player.shortSpeechPending,
        alive: isFarewellPenalty ? player.alive : nextFouls < 4,
        eliminatedBy: isFarewellPenalty ? player.eliminatedBy : nextFouls === 4 ? "fouls" : player.eliminatedBy,
      }
      : player);
    setPlayers(nextPlayers);
    if (selectedSeat === currentSeat && nextFouls === 4) setRunning(false);
    const message = nextFouls === 4
      ? `Игрок №${selectedSeat} покидает стол: 4-й фол`
      : nextFouls === 3
        ? `Игрок №${selectedSeat}: 3 фола · следующая речь 30 секунд`
        : `Игроку №${selectedSeat} добавлен ${nextFouls}-й фол`;
    addLog(message);
    setToast(message);
    if (nextFouls === 4) {
      if (isFarewellPenalty && shouldEndFarewellForPenalty(nextFouls, selectedPlayer.yellowCards)) completeFarewell(nextPlayers, false, "4-й фол завершил прощальную речь");
      else handlePenaltyRemoval(nextPlayers, selectedSeat);
    }
  };

  const removeFoul = () => {
    if (!selectedPlayer.alive || selectedPlayer.fouls <= 0) return;
    remember(`снятие фола у игрока №${selectedSeat}`);
    const nextFouls = selectedPlayer.fouls - 1;
    setPlayers((current) => current.map((player) => {
      if (player.seat !== selectedSeat) return player;
      const revivesPlayer = player.eliminatedBy === "fouls" && nextFouls < 4;
      return {
        ...player,
        fouls: nextFouls,
        shortSpeechPending: nextFouls < 3 ? false : player.shortSpeechPending,
        alive: revivesPlayer ? true : player.alive,
        eliminatedBy: revivesPlayer ? null : player.eliminatedBy,
      };
    }));
    const message = `У игрока №${selectedSeat} снят фол · осталось ${nextFouls}`;
    addLog(message);
    setToast(message);
  };

  const addYellowCard = () => {
    if (!selectedPlayer.alive || selectedPlayer.yellowCards >= 2) return;
    remember(`жёлтая карточка игроку №${selectedSeat}`);
    const nextCards = selectedPlayer.yellowCards + 1;
    const isFarewellPenalty = stage === "farewellSpeech" && selectedSeat === currentSeat;
    const nextPlayers = players.map((player) => player.seat === selectedSeat
      ? {
        ...player,
        yellowCards: nextCards,
        alive: isFarewellPenalty ? player.alive : nextCards < 2,
        eliminatedBy: isFarewellPenalty ? player.eliminatedBy : nextCards === 2 ? "yellowCards" : player.eliminatedBy,
      }
      : player);
    setPlayers(nextPlayers);
    if (selectedSeat === currentSeat && nextCards === 2) setRunning(false);
    const message = nextCards === 2
      ? `Игрок №${selectedSeat} удалён: две жёлтые карточки`
      : `Игроку №${selectedSeat} показана жёлтая карточка`;
    addLog(message);
    setToast(message);
    if (nextCards === 2) {
      if (isFarewellPenalty && shouldEndFarewellForPenalty(selectedPlayer.fouls, nextCards)) completeFarewell(nextPlayers, false, "вторая жёлтая завершила прощальную речь");
      else handlePenaltyRemoval(nextPlayers, selectedSeat);
    }
  };

  const toggleNomination = () => {
    if (!selectedPlayer.alive) return;
    if (selectedPlayer.nomination !== null) {
      setToast(`Игрок №${selectedSeat} уже в списке кандидатов`);
      return;
    }
    if (currentNomination) {
      setToast("В этой речи кандидат уже выставлен");
      return;
    }
    remember(`выставление кандидата №${selectedSeat}`);
    const existingNominations = players.filter((player) => player.nomination !== null);
    const nextOrder = existingNominations.length ? Math.max(...existingNominations.map((player) => player.nomination!)) + 1 : 1;
    setPlayers((current) => current.map((player) => player.seat === selectedSeat
      ? { ...player, nomination: nextOrder, nominatedBy: currentSeat }
      : player));
    setNominationRecords((current) => [...current, {
      day,
      round,
      order: nextOrder,
      nominatorSeat: currentSeat,
      candidateSeat: selectedSeat,
    }]);
    const message = `Игрок №${currentSeat} выставил №${selectedSeat} · кандидат ${nextOrder}`;
    addLog(message);
    setToast(`Игрок №${selectedSeat} добавлен в список кандидатов`);
  };

  const syncNominationPairs = (pairs: NominationPair[]) => {
    const normalized = orderNominationPairsBySpeech(pairs, speechOrder);
    setPlayers((current) => current.map((player) => {
      const pair = normalized.find((entry) => entry.candidateSeat === player.seat);
      return pair
        ? { ...player, nomination: pair.order, nominatedBy: pair.nominatorSeat }
        : { ...player, nomination: null, nominatedBy: null };
    }));
    setNominationRecords((current) => [
      ...current.filter((record) => record.day !== day || record.round !== round),
      ...normalized.map((pair) => ({ ...pair, day, round })),
    ]);
  };

  const resetNominationDraft = (pairs: NominationPair[] = nominationPairs) => {
    const usedNominators = new Set(pairs.map((pair) => pair.nominatorSeat));
    const usedCandidates = new Set(pairs.map((pair) => pair.candidateSeat));
    setEditingNominationOrder(null);
    setDraftNominator(speechOrder.find((seat) => !usedNominators.has(seat)) ?? speechOrder[0] ?? 1);
    setDraftCandidate(seatOrder.find((seat) => !usedCandidates.has(seat) && players.some((player) => player.seat === seat && player.alive)) ?? 1);
  };

  const saveNominationDraft = () => {
    if (!speechOrder.includes(draftNominator)) {
      setToast(`Игрок №${draftNominator} не входит в очередь речей`);
      return;
    }
    const candidate = players.find((player) => player.seat === draftCandidate);
    if (!candidate?.alive) {
      setToast(`Игрок №${draftCandidate} уже вне игры и не участвует в голосовании`);
      return;
    }
    if (!canSaveNominationPair(nominationPairs, { nominatorSeat: draftNominator, candidateSeat: draftCandidate }, speechOrder, editingNominationOrder)) {
      setToast("Этот игрок уже выставлял или кандидат уже есть в списке");
      return;
    }

    remember(editingNominationOrder === null ? "добавление выставления" : "исправление выставления");
    const nextPairs = editingNominationOrder === null
      ? [...nominationPairs, { order: nominationPairs.length + 1, nominatorSeat: draftNominator, candidateSeat: draftCandidate }]
      : nominationPairs.map((pair) => pair.order === editingNominationOrder
        ? { ...pair, nominatorSeat: draftNominator, candidateSeat: draftCandidate }
        : pair);
    syncNominationPairs(nextPairs);
    resetNominationDraft(nextPairs);
    addLog(`Выставления проверены: №${draftNominator} → №${draftCandidate}`);
  };

  const editNominationPair = (pair: NominationPair) => {
    setEditingNominationOrder(pair.order);
    setDraftNominator(pair.nominatorSeat);
    setDraftCandidate(pair.candidateSeat);
  };

  const deleteNominationPair = (order: number) => {
    remember("удаление выставления");
    const nextPairs = normalizeNominationPairs(nominationPairs.filter((pair) => pair.order !== order));
    syncNominationPairs(nextPairs);
    resetNominationDraft(nextPairs);
  };

  const enterNominationReview = () => {
    const validPairs = orderNominationPairsBySpeech(nominationPairs, speechOrder);
    setRunning(false);
    setStage("nominationReview");
    syncNominationPairs(validPairs);
    resetNominationDraft(validPairs);
    addLog("Проверка выставлений перед голосованием");
  };

  const buyTime = () => {
    if (!currentPlayer.alive) return;
    remember(`покупка 30 секунд игроком №${currentSeat}`);
    const nextFouls = Math.min(4, currentPlayer.fouls + 2);
    const isFarewellPenalty = stage === "farewellSpeech";
    const nextPlayers = players.map((player) => player.seat === currentSeat
      ? {
        ...player,
        fouls: nextFouls,
        shortSpeechPending: !isFarewellPenalty && player.fouls < 3 && nextFouls >= 3 && nextFouls < 4 ? true : player.shortSpeechPending,
        alive: isFarewellPenalty ? player.alive : nextFouls < 4,
        eliminatedBy: isFarewellPenalty ? player.eliminatedBy : nextFouls === 4 ? "fouls" : player.eliminatedBy,
      }
      : player);
    setPlayers(nextPlayers);
    setSeconds((current) => current + 30);
    setTimerTotalSeconds((current) => current + 30);
    if (running) deadlineRef.current += 30_000;
    if (nextFouls === 4) setRunning(false);
    const message = `Игрок №${currentSeat}: +30 секунд и +2 фола`;
    addLog(message);
    setToast(message);
    if (nextFouls === 4) {
      if (isFarewellPenalty) completeFarewell(nextPlayers, false, "покупка времени дала 4-й фол");
      else handlePenaltyRemoval(nextPlayers, currentSeat);
    }
  };

  const beginNight = (nightPlayers: Player[] = players) => {
    const activeBlack = nightPlayers.filter((player) => player.alive && (player.role === "Мафия" || player.role === "Дон"));
    const activeDon = nightPlayers.find((player) => player.alive && player.role === "Дон");
    const activeSheriff = nightPlayers.find((player) => player.alive && player.role === "Шериф");
    const nextNightStage: Stage = activeBlack.length ? "nightShot" : activeDon ? "nightDon" : activeSheriff ? "nightSheriff" : "nightSummary";
    const firstChecker = activeDon?.seat ?? activeSheriff?.seat ?? 0;
    setStage(nextNightStage);
    setNightTarget(firstCheckTarget(firstChecker, nightPlayers));
    setNightShotChoice(null);
    setNightRecords([]);
    if (nextNightStage === "nightDon" || nextNightStage === "nightSheriff") {
      startCountdown(15);
    } else {
      setRunning(false);
    }
  };

  const handlePenaltyRemoval = (roster: Player[], removedSeat: number) => {
    setPenaltyPanelOpen(false);
    if (finishGameIfNeeded(roster)) return;

    if (isVotingSequence) {
      setVoteState(emptyVoteState);
      setTieSeats([]);
      setTieSpeechIndex(0);
      setTieCycle(0);
      setLiftDraft([]);
      beginNight(roster);
      addLog(`Удаление №${removedSeat} заменило голосование · начинается ночь`);
      setToast(`Игрок №${removedSeat} удалён · голосование отменено`);
      return;
    }

    setVoteSkips((current) => current + 1);
    addLog(`Удаление №${removedSeat} · одно голосование будет пропущено`);

    if (stage === "nightDon" && roster.find((player) => player.alive && player.role === "Дон") === undefined) {
      const activeSheriff = roster.find((player) => player.alive && player.role === "Шериф");
      if (activeSheriff) {
        setStage("nightSheriff");
        setNightTarget(firstCheckTarget(activeSheriff.seat, roster));
        startCountdown(15);
      } else {
        setStage("nightSummary");
        setRunning(false);
      }
      return;
    }

    if (stage === "nightSheriff" && roster.find((player) => player.alive && player.role === "Шериф") === undefined) {
      setStage("nightSummary");
      setRunning(false);
      return;
    }

    if (stage === "nightShot" && nightShotChoice === removedSeat) setNightShotChoice(null);
    if ((stage === "nightDon" || stage === "nightSheriff") && nightTarget === removedSeat) {
      const activeActor = roster.find((player) => player.alive && player.role === (stage === "nightDon" ? "Дон" : "Шериф"));
      setNightTarget(firstCheckTarget(activeActor?.seat ?? 0, roster));
    }
  };

  const beginFarewell = (seats: number[], reason: "vote" | "shot", after: "night" | "round", roster: Player[] = players) => {
    const queue = [...new Set(seats)].filter((seat) => roster.some((player) => player.seat === seat && player.alive));
    if (!queue.length) {
      if (after === "night") {
        beginNight(roster);
      } else {
        setNightRecords([]);
        setNightShotChoice(null);
        const duration = startNormalSpeech(roundStarter, roster);
        setToast(`Речь игрока №${roundStarter} началась · ${duration} секунд`);
      }
      return;
    }
    setPlayers(roster);
    setFarewellState({ seats: queue, index: 0, reason, after });
    setCurrentSeat(queue[0]);
    setSelectedSeat(queue[0]);
    setStage("farewellSpeech");
    startCountdown(60);
    const label = reason === "shot" ? "Убитый игрок" : "Заголосованный игрок";
    addLog(`${label} №${queue[0]} · прощальная речь 60 секунд`);
    setToast(`${label} №${queue[0]} · 60 секунд`);
  };

  const completeFarewell = (roster: Player[] = players, shouldRemember = true, earlyReason?: string) => {
    if (!farewellState) return;
    if (shouldRemember) remember(`прощальная речь игрока №${currentSeat}`);
    setRunning(false);
    if (earlyReason) addLog(`Игрок №${currentSeat}: ${earlyReason}`);
    if (farewellState.index < farewellState.seats.length - 1) {
      const nextIndex = farewellState.index + 1;
      const nextSeat = farewellState.seats[nextIndex];
      setPlayers(roster);
      setFarewellState({ ...farewellState, index: nextIndex });
      setCurrentSeat(nextSeat);
      setSelectedSeat(nextSeat);
      startCountdown(60);
      addLog(`Прощальная речь игрока №${nextSeat} · 60 секунд`);
      setToast(`Следующая прощальная речь · игрок №${nextSeat}`);
      return;
    }

    const nextPlayers = roster.map((player) => farewellState.seats.includes(player.seat)
      ? { ...player, alive: false, eliminatedBy: farewellState.reason as EliminationReason }
      : player);
    setFarewellState(null);
    if (finishGameIfNeeded(nextPlayers)) return;
    if (farewellState.after === "night") {
      setPlayers(nextPlayers);
      beginNight(nextPlayers);
      setToast("Прощальная речь закончена · начинается ночь");
    } else {
      setNightRecords([]);
      setNightShotChoice(null);
      setSpokenSeats([]);
      const duration = startNormalSpeech(roundStarter, nextPlayers);
      const message = `Круг ${round} начинается с игрока №${roundStarter}`;
      addLog(`${message} · ${duration} секунд`);
      setToast(`${message} · таймер запущен`);
    }
  };

  const advanceFarewell = () => completeFarewell();

  const beginVoting = () => {
    if (voteSkips > 0) {
      const remainingSkips = voteSkips - 1;
      setVoteSkips(remainingSkips);
      setVoteState(emptyVoteState);
      setTieSeats([]);
      setTieSpeechIndex(0);
      setTieCycle(0);
      setLiftDraft([]);
      beginNight();
      addLog(`Голосование пропущено: удаление вместо съёма${remainingSkips > 0 ? ` · осталось ${remainingSkips}` : ""}`);
      setToast(remainingSkips > 0 ? `Голосование пропущено · ещё без голосования: ${remainingSkips}` : "Голосование пропущено · начинается ночь");
      return;
    }
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
    setTieCycle(0);
    setEditingNominationOrder(null);
    setStage("vote");
    setRunning(false);
    setToast(`Речи закончены · голосование за игрока №${candidateSeats[0]}`);
  };

  const confirmNominationReview = () => {
    remember(nominationPairs.length ? "подтверждение выставлений" : "переход к ночи без выставлений");
    beginVoting();
  };

  const advanceSpeech = () => {
    remember(`речь игрока №${currentSeat}`);
    setRunning(false);

    const nextSpoken = spokenSeats.includes(currentSeat) ? spokenSeats : [...spokenSeats, currentSeat];
    const next = speechOrder.find((seat) => !nextSpoken.includes(seat));
    setSpokenSeats(nextSpoken);
    if (next) {
      const duration = startNormalSpeech(next);
      addLog(`Началась речь игрока №${next} · ${duration} секунд`);
      setToast(`Следующий игрок №${next} · ${duration} секунд`);
    } else {
      if (voteSkips > 0) beginVoting();
      else enterNominationReview();
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
      setTieCycle(1);
      setCurrentSeat(leaders[0]);
      startCountdown(30);
      setStage("tieSpeech");
      setToast(`Попил: ${leaders.map((seat) => `№${seat}`).join(" и ")} · по 30 секунд`);
    } else {
      setToast(`Игрок №${leaders[0]} заголосован · прощальная речь`);
      beginFarewell(leaders, "vote", "night");
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
      startCountdown(30);
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
    const outcome = resolveTieOutcome(tieSeats, leaders);
    setVoteState((current) => ({ ...current, confirmed: nextConfirmed, draft: [] }));
    if (outcome === "lift") {
      setLiftDraft([]);
      setStage("lift");
      setToast(`Те же игроки снова в попиле · голосуем за подъём ${leaders.map((seat) => `№${seat}`).join(" и ")}`);
    } else if (outcome === "repeat") {
      setTieSeats(leaders);
      setTieSpeechIndex(0);
      setTieCycle((current) => current + 1);
      setCurrentSeat(leaders[0]);
      startCountdown(30);
      setStage("tieSpeech");
      setToast(`Попил продолжается: ${leaders.map((seat) => `№${seat}`).join(" и ")} · по 30 секунд`);
    } else if (outcome === "farewell") {
      setToast(`Игрок №${leaders[0]} заголосован · прощальная речь`);
      beginFarewell(leaders, "vote", "night");
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
      setToast("Большинство за · прощальные речи по 60 секунд");
      beginFarewell(tieSeats, "vote", "night");
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
        setNightTarget(firstCheckTarget(don.seat, players));
        startCountdown(15);
        setToast("Отстрел записан · проверка Дона");
      } else if (sheriff) {
        setStage("nightSheriff");
        setNightTarget(firstCheckTarget(sheriff.seat, players));
        startCountdown(15);
        setToast("Отстрел записан · проверка Шерифа");
      } else {
        setStage("nightSummary");
        setRunning(false);
      }
    } else if (stage === "nightDon") {
      if (!checkActor || nightTarget === checkActor) {
        setToast(nightTarget === checkActor ? "Дон не может проверить себя" : "Дон выбыл");
        return;
      }
      const result: "Шериф" | "Не шериф" = targetRole === "Шериф" ? "Шериф" : "Не шериф";
      remember(`проверка Дона: №${nightTarget} · ${result}`);
      const checkedEmptySeat = targetPlayer?.alive === false;
      setNightRecords((current) => [...current, { type: "don", target: nightTarget, result, checkedEmptySeat }]);
      addLog(`Проверка Дона: ${checkedEmptySeat ? "стул " : ""}№${nightTarget} · ${result}`);
      if (sheriff) {
        setStage("nightSheriff");
        setNightTarget(firstCheckTarget(sheriff.seat, players));
        startCountdown(15);
        setToast(`${result} · теперь проверка Шерифа`);
      } else {
        setStage("nightSummary");
        setRunning(false);
      }
    } else if (stage === "nightSheriff") {
      if (!checkActor || nightTarget === checkActor) {
        setToast(nightTarget === checkActor ? "Шериф не может проверить себя" : "Шериф выбыл");
        return;
      }
      const result: "Мафия" | "Мирный" = targetRole === "Мафия" || targetRole === "Дон" ? "Мафия" : "Мирный";
      remember(`проверка Шерифа: №${nightTarget} · ${result}`);
      const checkedEmptySeat = targetPlayer?.alive === false;
      setNightRecords((current) => [...current, { type: "sheriff", target: nightTarget, result, checkedEmptySeat }]);
      addLog(`Проверка Шерифа: ${checkedEmptySeat ? "стул " : ""}№${nightTarget} · ${result}`);
      setStage("nightSummary");
      setRunning(false);
      setToast(`${result} · итоги ночи`);
    }
  };

  const skipNightCheck = () => {
    if (stage !== "nightDon" && stage !== "nightSheriff") return;
    const roleLabel = stage === "nightDon" ? "Дон" : "Шериф";
    remember(`${roleLabel} пропустил проверку`);
    setNightRecords((current) => [...current, {
      type: stage === "nightDon" ? "don" : "sheriff",
      target: null,
      result: "Пропуск",
      checkedEmptySeat: false,
    } as NightRecord]);
    addLog(`${roleLabel}: проверка пропущена`);
    const nextStage = nextNightStageAfterSkip(stage === "nightDon" ? "don" : "sheriff", Boolean(sheriff));
    if (nextStage === "nightSheriff" && sheriff) {
      setStage("nightSheriff");
      setNightTarget(firstCheckTarget(sheriff.seat, players));
      startCountdown(15);
      setToast("Дон пропустил проверку · теперь Шериф");
    } else {
      setStage("nightSummary");
      setRunning(false);
      setToast(`${roleLabel} пропустил проверку · итоги ночи`);
    }
  };

  const beginNextRound = () => {
    remember(`начало круга ${round + 1}`);
    const previewPlayers = players.map((player) => shotResult === player.seat ? { ...player, alive: false as const } : player);
    const nextStarter = nextAliveAfter(roundStarter, previewPlayers);
    const roundPlayers = players.map((player) => ({ ...player, nomination: null, nominatedBy: null }));
    setDay((current) => current + 1);
    setRound((current) => current + 1);
    setRoundStarter(nextStarter);
    setSpokenSeats([]);
    setVoteState(emptyVoteState);
    setTieSeats([]);
    setTieCycle(0);
    setLiftDraft([]);
    setNightShotChoice(null);
    if (shotResult) {
      beginFarewell([shotResult], "shot", "round", roundPlayers);
    } else {
      setNightRecords([]);
      const duration = startNormalSpeech(nextStarter, roundPlayers);
      const message = `Круг ${round + 1} начинается с игрока №${nextStarter}`;
      addLog(`${message} · ${duration} секунд`);
      setToast(`${message} · таймер запущен`);
    }
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
      if (stage === "nightShot" && !player?.alive) {
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

  const isDealStage = stage === "dealChoice" || stage === "appDeal" || stage === "manualDeal" || stage === "dealReady" || stage === "agreement" || stage === "freeSeating" || stage === "morningReady";
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
        : stage === "agreement"
          ? "Договорка"
          : stage === "freeSeating"
            ? "Свободная посадка"
            : stage === "morningReady"
              ? "Утро"
            : `Игрок ${dealIndex + 1} из 10`;
    const setupNote = stage === "appDeal" ? "Приватный просмотр" : stage === "manualDeal" ? "Ввод с колоды" : stage === "agreement" ? "60 секунд · можно пропустить" : stage === "freeSeating" ? "40 секунд · можно пропустить" : stage === "morningReady" ? "Ожидание ведущего" : "Стандартная десятка";

    return (
      <main className="app-shell">
        <section className={`game-app deal-app stage-${stage} ${isWarning ? "is-warning" : ""}`} aria-label="Раздача ролей Mafia Master">
          <header className="game-header">
            <div className="header-main">
              <button className="undo-button" onClick={undo} disabled={!undoAvailable} aria-label="Вернуться назад">
                <span>↶</span>Назад
              </button>
              <div className="game-heading"><span>MAFIA MASTER · НОВАЯ ИГРА</span><strong>{stage === "agreement" || stage === "freeSeating" ? "Первая ночь" : stage === "morningReady" ? "День 1" : "Раздача ролей"}</strong></div>
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
                {roleOptions.map((role) => <span key={role} className={`role-${roleClassNames[role]}`}><RoleGlyph role={role} /><b>{roleLimits[role]}</b><small>{role}</small></span>)}
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
                  <div className="revealed-role"><span>Ваша роль</span><RoleGlyph role={dealRole} className="card-role-glyph" /><strong>{dealRole}</strong><p>{roleDescriptions[dealRole]}</p></div>
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
                <p>Тап по роли сразу сохранит её и откроет следующего игрока.</p>
              </div>
              <RoleMiniMap players={players} currentSeat={dealPlayer.seat} title="Роли за столом" />
              <div className="role-grid">
                {roleOptions.map((role) => {
                  const remaining = roleLimits[role] - assignedRoleCounts[role];
                  return (
                    <button
                      key={role}
                      className={`role-option role-${roleClassNames[role]}`}
                      onClick={() => assignManualRole(role)}
                      disabled={remaining <= 0}
                    >
                      <RoleGlyph role={role} />
                      <strong>{role}</strong>
                      <small>{remaining > 0 ? `осталось ${remaining}` : "все назначены"}</small>
                    </button>
                  );
                })}
              </div>
              <div className="manual-balance">{roleOptions.map((role) => <span key={role} className={`role-${roleClassNames[role]} ${assignedRoleCounts[role] === roleLimits[role] ? "is-full" : ""}`}><b>{assignedRoleCounts[role]}</b>/{roleLimits[role]} {role}</span>)}</div>
            </section>
          )}

          {stage === "dealReady" && (
            <section className="deal-panel deal-ready">
              {!masterSummaryVisible ? (
                <>
                  <div className="ready-seal"><span>✓</span></div>
                  <span className="deal-eyebrow">Карта ролей скрыта</span>
                  <h1>{dealMethod === "app" ? "Верните телефон ведущему" : "Экран только для ведущего"}</h1>
                  <p>На следующем экране будет полная карта ролей. Игроки не должны её видеть.</p>
                  <button className="primary-action deal-primary master-unlock" onClick={() => setMasterSummaryVisible(true)}>
                    <span><small>Только для ведущего</small>Я ведущий · открыть карту ролей</span><strong>→</strong>
                  </button>
                </>
              ) : (
                <>
                  <span className="deal-eyebrow">Раздача завершена</span>
                  <h1>Карта ролей готова</h1>
                  <p>Эту схему видит только ведущий. Цвет и знак роли используются дальше во всех проверках.</p>
                  <RoleMiniMap players={players} title="Все роли" />
                  <div className="ready-composition">{roleOptions.map((role) => <div key={role} className={`role-${roleClassNames[role]}`}><RoleGlyph role={role} /><strong>{roleLimits[role]}</strong><span>{role}</span></div>)}</div>
                  <div className="first-speaker"><span>Первая ночь</span><strong>Договорка · 60 секунд</strong><small>затем посадка · речь №1 запускает ведущий</small></div>
                  <button className="primary-action deal-primary" onClick={startGame}>
                    <span><small>Мафия просыпается, таймер включится сразу</small>Начать договорку · 60</span><strong>→</strong>
                  </button>
                </>
              )}
            </section>
          )}

          {(stage === "agreement" || stage === "freeSeating") && (
            <section className="deal-panel preparation-timer">
              <div className="prep-copy">
                <span>{stage === "agreement" ? "Первая ночь" : "После договорки"}</span>
                <h1>{stage === "agreement" ? "Договорка" : "Свободная посадка"}</h1>
                <p>{stage === "agreement" ? "Просыпаются Дон и мафия. У команды 60 секунд на бесшумный план игры." : "Мафия спит. Дон и Шериф обозначаются ведущему, затем игроки принимают удобную посадку на 40 секунд."}</p>
              </div>
              <div className="prep-privacy-note">
                <span aria-hidden="true">{stage === "agreement" ? "○" : "↠"}</span>
                <div><strong>{stage === "agreement" ? "Роли скрыты · этап можно пропустить" : "Этот этап можно пропустить"}</strong><small>{stage === "agreement" ? "Шериф и другие роли здесь не показываются" : "Переход к утру доступен в любой момент"}</small></div>
              </div>
              <button
                className="timer-orbit prep-timer-orbit"
                onClick={toggleTimer}
                style={{ background: `conic-gradient(var(--timer-accent) ${Math.max(0, Math.min(100, (seconds / timerLimit) * 100))}%, rgba(255,255,255,.075) 0)` }}
                aria-label={`${running ? "Поставить на паузу" : "Продолжить"} таймер`}
              >
                <span className="timer-face"><time aria-live={seconds <= 10 ? "assertive" : "off"}>{seconds}</time><small>секунд · {seconds === 0 ? "время вышло" : running ? "таймер идёт" : "пауза"}</small></span>
              </button>
              <button className="timer-reset prep-reset" onClick={resetTimer}>↺ Сбросить</button>
              <button className="primary-action deal-primary" onClick={stage === "agreement" ? beginFreeSeating : enterMorningReady}>
                <span><small>{stage === "agreement" ? seconds > 0 ? "Остановить договорку и перейти дальше" : "Таймер посадки запустится автоматически" : seconds > 0 ? "Остановить отсчёт и перейти дальше" : "Речь №1 пока не запустится"}</small>{stage === "agreement" ? seconds > 0 ? "Пропустить · посадка 40" : "Свободная посадка · 40" : seconds > 0 ? "Пропустить · в город утро" : "В город утро"}</span><strong>→</strong>
              </button>
            </section>
          )}

          {stage === "morningReady" && (
            <section className="deal-panel morning-ready">
              <div className="morning-mark"><span aria-hidden="true">1</span></div>
              <span className="deal-eyebrow">В городе утро</span>
              <h1>Речь игрока №1</h1>
              <p>Таймер ещё не запущен. Начните речь только когда стол и ведущий готовы.</p>
              <div className="speech-rule-card"><span>Обычная речь</span><strong>50 секунд</strong><small>после трёх фолов следующая речь — 30 секунд</small></div>
              <button className="primary-action deal-primary" onClick={beginFirstSpeech}>
                <span><small>Таймер запустится по команде ведущего</small>Начать речь №1 · 50</span><strong>→</strong>
              </button>
            </section>
          )}

        </section>
      </main>
    );
  }

  let stageLabel = "";
  let stageNote = "";
  if (stage === "gameOver") {
    stageLabel = "Игра завершена";
    stageNote = winner === "red" ? "Победа красных" : "Победа чёрных";
  } else if (stage === "speech") {
    stageLabel = `Речь ${Math.min(spokenSeats.length + 1, speechOrder.length)} из ${speechOrder.length}`;
    stageNote = voteSkips > 0
      ? `Без голосования: ${voteSkips}`
      : timerBaseSeconds === 30 ? "3 фола · 30 секунд" : `Круг начал №${roundStarter}`;
  } else if (stage === "farewellSpeech") {
    stageLabel = farewellState?.reason === "shot" ? "Речь убитого игрока" : "Речь заголосованного";
    stageNote = farewellState ? `${farewellState.index + 1} из ${farewellState.seats.length} · 60 секунд` : "60 секунд";
  } else if (stage === "nominationReview") {
    stageLabel = "Проверка выставлений";
    stageNote = nominationPairs.length ? `${nominationPairs.length} в очереди` : "Список пуст";
  } else if (stage === "vote") {
    stageLabel = `Голосование ${voteState.index + 1} из ${voteState.candidates.length}`;
    stageNote = `Кандидат №${currentCandidate}`;
  } else if (stage === "tieSpeech") {
    stageLabel = `Попил ${tieCycle} · речь ${tieSpeechIndex + 1} из ${tieSeats.length}`;
    stageNote = `${tieSeats.length} игроков · по 30 секунд`;
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
    stageNote = `15 секунд · ${currentCheckResult.toUpperCase()}`;
  } else if (stage === "nightSheriff") {
    stageLabel = "Ночь · проверка Шерифа";
    stageNote = `15 секунд · ${currentCheckResult.toUpperCase()}`;
  } else {
    stageLabel = "Итоги ночи";
    stageNote = shotResult ? `Выбывает №${shotResult}` : shotRecord ? "Промах" : "Без отстрела";
  }

  const primaryLabel = stage === "gameOver"
    ? "Новая игра"
    : stage === "speech"
    ? isLastSpeech
      ? voteSkips > 0 ? "К ночи · без голосования" : "Проверить выставления"
      : `Следующий: игрок №${nextSpeechSeat}`
    : stage === "nominationReview"
      ? nominationPairs.length ? `Начать голосование · ${nominationPairs.length}` : "К ночи · кандидатов нет"
    : stage === "vote" || stage === "revote"
      ? voteState.index < voteState.candidates.length - 1
        ? `Зафиксировать · дальше №${voteState.candidates[voteState.index + 1]}`
        : "Зафиксировать и подвести итог"
      : stage === "tieSpeech"
        ? tieSpeechIndex < tieSeats.length - 1 ? `Следующая речь: №${tieSeats[tieSpeechIndex + 1]}` : "К переголосованию"
        : stage === "farewellSpeech"
          ? farewellState && farewellState.index < farewellState.seats.length - 1
            ? `Следующая речь: №${farewellState.seats[farewellState.index + 1]}`
            : farewellState?.after === "night" ? "Закончить речь · к ночи" : `К речи игрока №${roundStarter}`
        : stage === "lift"
          ? "Зафиксировать решение"
          : stage === "nightSummary"
            ? shotResult ? `Речь убитого №${shotResult} · 60` : `Начать круг ${round + 1}`
            : stage === "nightShot"
              ? nightShotChoice === "miss" ? "Зафиксировать промах" : typeof nightShotChoice === "number" ? `Подтвердить отстрел №${nightShotChoice}` : "Выберите игрока или промах"
              : stage === "nightDon"
                ? sheriff ? `Записать · ${currentCheckResult.toUpperCase()} · к Шерифу` : `Записать · ${currentCheckResult.toUpperCase()}`
                : `Записать · ${currentCheckResult.toUpperCase()} · к итогам`;

  const onPrimary = stage === "gameOver"
    ? startNewGame
    : stage === "speech"
    ? advanceSpeech
    : stage === "farewellSpeech"
      ? advanceFarewell
    : stage === "nominationReview"
      ? confirmNominationReview
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

  const timedLabel = stage === "speech"
    ? `Говорит игрок №${currentSeat}${timerBaseSeconds === 30 ? " · 3 фола" : ""}`
    : stage === "farewellSpeech"
      ? `${farewellState?.reason === "shot" ? "Убит" : "Заголосован"} · игрок №${currentSeat}`
      : stage === "nightDon"
        ? `Дон · ${targetPlayer?.alive === false ? "стул" : "проверка игрока"} №${nightTarget}`
        : stage === "nightSheriff"
          ? `Шериф · ${targetPlayer?.alive === false ? "стул" : "проверка игрока"} №${nightTarget}`
          : `Попил · игрок №${currentSeat}`;
  const timerStatus = seconds === 0 ? "Время вышло" : running ? "таймер идёт" : "готов к старту";
  const winnerClass = winner ? `winner-${winner}` : "";

  return (
    <main className="app-shell">
      <section className={`game-app stage-${stage} ${winnerClass} ${isWarning ? "is-warning" : ""}`} aria-label="Пульт ведущего Mafia Master">
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
            <div className="header-tools">
              <button
                className={`roles-toggle ${rolesVisible ? "is-active" : ""}`}
                type="button"
                aria-pressed={rolesVisible}
                aria-label={rolesVisible ? "Скрыть роли игроков" : "Показать роли игроков"}
                onClick={() => setRolesVisible((current) => !current)}
              >
                <span className="roles-eye" aria-hidden="true" />
                <strong>Роли</strong>
              </button>
              <button
                className={`penalty-toggle ${penaltyPanelOpen ? "is-active" : ""}`}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={penaltyPanelOpen}
                aria-controls="penalty-panel"
                aria-label="Открыть фолы и удаления"
                disabled={!penaltyAvailable}
                onClick={() => setPenaltyPanelOpen((current) => !current)}
              >
                <span aria-hidden="true">!</span>
                <strong>Фол</strong>
                {voteSkips > 0 && <b aria-label={`Будет пропущено голосований: ${voteSkips}`}>{voteSkips}</b>}
              </button>
            </div>
          </div>
          <div className="stage-status" aria-live="polite">
            <span className="stage-dot" />
            <div><small>Сейчас</small><strong>{stageLabel}</strong></div>
            <span>{stageNote}</span>
          </div>
        </header>

        {stage !== "nominationReview" && (
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
            ) : stage === "gameOver" ? (
              <div className="workflow-center game-over-center">
                <span>Игра завершена</span>
                <strong>{winner === "red" ? "КРАСНЫЕ" : "ЧЁРНЫЕ"}</strong>
                <small>победа команды</small>
              </div>
            ) : stage === "nightSummary" ? (
              <div className="workflow-center night-result"><span>Итог ночи</span><strong>{shotResult ? `№${shotResult}` : shotRecord ? "Промах" : "Без отстрела"}</strong><small>{shotResult ? "покидает стол утром" : "никто не выбывает"}</small></div>
            ) : stage === "nightShot" ? (
              <div className="workflow-center night-shot-choice"><span>Результат отстрела</span><strong>{nightShotChoice === "miss" ? "ПРОМАХ" : typeof nightShotChoice === "number" ? `№${nightShotChoice}` : "—"}</strong><small>выберите игрока на столе или промах</small></div>
            ) : (
              <div className={`workflow-center check-result ${currentCheckClass}`}>
                <span>{stage === "nightDon" ? "Дон проверяет Шерифа" : "Шериф проверяет мафию"} · {targetPlayer?.alive === false ? "стул " : ""}№{nightTarget}</span>
                <div className="check-result-value">{currentCheckRole && <RoleGlyph role={currentCheckRole} />}<strong>{currentCheckResult.toUpperCase()}</strong></div>
                <small>{targetPlayer?.alive === false ? "проверяется сохранённая роль выбывшего" : "тапните другого игрока, чтобы изменить цель"}</small>
              </div>
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
              const isCurrentSpeaker = (stage === "speech" || stage === "farewellSpeech") && currentSeat === player.seat;
              const marker = lockedCandidate !== null ? `→${lockedCandidate}` : draftVote ? "✓" : liftVote ? "ЗА" : isTarget ? stage === "nightShot" ? "ОТСТРЕЛ" : "ПРОВЕРКА" : null;
              return (
                <button
                  key={player.seat}
                  className={`table-seat seat-${player.seat} ${isSelected ? "is-selected" : ""} ${isCurrentSpeaker ? "is-current" : ""} ${player.nomination && stage !== "gameOver" ? "is-nominated" : ""} ${isCandidate ? "is-candidate" : ""} ${draftVote || liftVote ? "is-draft-vote" : ""} ${isTarget ? "is-night-target" : ""} ${lockedCandidate !== null ? "has-voted" : ""} ${!player.alive ? "is-eliminated" : ""}`}
                  aria-disabled={lockedCandidate !== null || (!player.alive && stage !== "speech" && stage !== "nightDon" && stage !== "nightSheriff")}
                  onClick={() => handleSeatClick(player.seat)}
                  aria-label={`Игрок №${player.seat}, ${player.name}${rolesVisible && player.role ? `, роль ${player.role}` : ""}${lockedCandidate !== null ? `, голос за игрока №${lockedCandidate} зафиксирован` : ""}`}
                >
                  {marker && <span className={`seat-state ${lockedCandidate !== null ? "is-locked" : ""}`}>{marker}</span>}
                  <span className="seat-number-row">
                    <strong>{player.seat}</strong>
                    {rolesVisible && player.role && <span aria-hidden="true"><RoleGlyph role={player.role} className="seat-role-glyph" /></span>}
                  </span>
                  <span className="seat-name">{player.name}</span>
                  {!player.alive ? <span className="out-label">вне игры</span> : <span className="seat-penalties"><FoulMarks count={player.fouls} />{player.yellowCards > 0 && <YellowMarks count={player.yellowCards} />}</span>}
                </button>
              );
            })}
          </div>

          <div className="master-seat" aria-label="Место ведущего"><span className="master-line" /><span className="master-avatar">M</span><span className="master-copy"><strong>Ведущий</strong><small>ваше место</small></span></div>
        </section>
        )}

        {nominees.length > 0 && !stage.startsWith("night") && stage !== "farewellSpeech" && stage !== "nominationReview" && stage !== "gameOver" && (
          <section className="candidate-queue" aria-label="Очередь кандидатур">
            <div><span>Кандидаты</span></div>
            <ol>{nominees.map((player) => {
              const confirmedCount = voteState.confirmed[player.seat]?.length;
              return <li key={player.seat} className={currentCandidate === player.seat ? "is-current" : confirmedCount !== undefined ? "is-done" : ""}><strong>{player.seat}</strong></li>;
            })}</ol>
          </section>
        )}

        <section className={`control-panel${stage === "nominationReview" ? " nomination-review-stage" : ""}`}>
          {stage === "speech" && (
            <>
              <div className="selected-player">
                <div className="selected-number">{selectedPlayer.seat}</div>
                <div className="selected-copy"><span>{selectedSeat === currentSeat ? "Сейчас говорит" : "Действия с игроком"}</span><strong>{selectedPlayer.name}</strong></div>
                <div className="selected-fouls"><span>{selectedPlayer.fouls} / 4 фола</span><FoulMarks count={selectedPlayer.fouls} /><small>ЖК {selectedPlayer.yellowCards} / 2</small></div>
              </div>
              <div className="quick-actions">
                <div className="foul-stepper">
                  <button onClick={removeFoul} disabled={!selectedPlayer.alive || selectedPlayer.fouls === 0} aria-label={`Снять фол у игрока №${selectedSeat}`}><span>−</span></button>
                  <div><small>Фолы · №{selectedSeat}</small><strong>{selectedPlayer.fouls} / 4</strong></div>
                  <button onClick={addFoul} disabled={!selectedPlayer.alive || selectedPlayer.fouls >= 4} aria-label={`Добавить фол игроку №${selectedSeat}`}><span>+</span></button>
                </div>
                <button onClick={toggleNomination} disabled={!selectedPlayer.alive || selectedPlayer.nomination !== null || Boolean(currentNomination)}><span>{selectedPlayer.nomination || currentNomination ? "✓" : "↓"}</span><strong>{selectedPlayer.nomination ? "Уже в списке" : currentNomination ? "Кандидат выставлен" : `Выставить №${selectedSeat}`}</strong></button>
                <button className="yellow-action" onClick={addYellowCard} disabled={!selectedPlayer.alive || selectedPlayer.yellowCards >= 2}><span>▰</span><strong>Жёлтая · {selectedPlayer.yellowCards}/2</strong></button>
                <button className="buy-time-action" onClick={buyTime} disabled={!currentPlayer.alive}><span>+30</span><strong>Речь №{currentSeat} · 2 фола</strong></button>
              </div>
            </>
          )}

          {stage === "farewellSpeech" && (
            <div className="farewell-controls">
              <div className="simple-instruction farewell-instruction"><span>{farewellState?.reason === "shot" ? "Убитый игрок" : "По результату голосования"}</span><strong>Игрок №{currentSeat} · 60 секунд</strong><small>4-й фол или вторая жёлтая сразу завершат эту речь</small></div>
              <div className="farewell-penalties">
                <div className="foul-stepper">
                  <button onClick={removeFoul} disabled={currentPlayer.fouls === 0} aria-label={`Снять фол у уходящего игрока №${currentSeat}`}><span>−</span></button>
                  <div><small>Фолы · №{currentSeat}</small><strong>{currentPlayer.fouls} / 4</strong></div>
                  <button onClick={addFoul} disabled={currentPlayer.fouls >= 4} aria-label={`Добавить фол уходящему игроку №${currentSeat}`}><span>+</span></button>
                </div>
                <button className="yellow-action" onClick={addYellowCard} disabled={currentPlayer.yellowCards >= 2}><span>▰</span><strong>Жёлтая · {currentPlayer.yellowCards}/2</strong></button>
                <button className="buy-time-action" onClick={buyTime}><span>+30</span><strong>30 секунд · 2 фола</strong></button>
              </div>
            </div>
          )}

          {stage === "nominationReview" && (
            <div className="nomination-review-panel">
              <div className="nomination-review-head"><div><span>Перед голосованием</span><strong>Кто кого выставил</strong></div><b>{nominationPairs.length}</b></div>
              {nominationPairs.length > 0 ? (
                <ol className="nomination-pair-list">
                  {nominationPairs.map((pair, index) => (
                    <li key={pair.order} className={editingNominationOrder === pair.order ? "is-editing" : ""}>
                      <button className="nomination-pair-main" type="button" onClick={() => editNominationPair(pair)} aria-label={`Исправить выставление: игрок №${pair.nominatorSeat} выставил №${pair.candidateSeat}`}>
                        <small>{index + 1}</small><strong>№{pair.nominatorSeat}</strong><span>→</span><strong>№{pair.candidateSeat}</strong>
                      </button>
                      <div className="nomination-pair-actions">
                        <button type="button" className="is-delete" onClick={() => deleteNominationPair(pair.order)} aria-label="Удалить выставление">×</button>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : <div className="nomination-empty">Пока никто не выставлен. Можно добавить пару или перейти к ночи.</div>}
              <div className="nomination-editor">
                <label><span>Кто</span><select value={draftNominator} onChange={(event) => setDraftNominator(Number(event.target.value))}>{speechOrder.map((seat) => {
                  const usedByAnother = nominationPairs.some((pair) => pair.order !== editingNominationOrder && pair.nominatorSeat === seat);
                  return <option key={seat} value={seat} disabled={usedByAnother}>№{seat}</option>;
                })}</select></label>
                <span aria-hidden="true">→</span>
                <label><span>Кого</span><select value={draftCandidate} onChange={(event) => setDraftCandidate(Number(event.target.value))}>{players.map((player) => {
                  const usedByAnother = nominationPairs.some((pair) => pair.order !== editingNominationOrder && pair.candidateSeat === player.seat);
                  return <option key={player.seat} value={player.seat} disabled={usedByAnother || !player.alive}>№{player.seat}{!player.alive ? " · вне игры" : ""}</option>;
                })}</select></label>
                <button type="button" onClick={saveNominationDraft}><strong>{editingNominationOrder === null ? "Добавить" : "Сохранить"}</strong><small>{editingNominationOrder === null ? "по очереди речей" : "порядок по речи"}</small></button>
                {editingNominationOrder !== null && <button type="button" className="nomination-cancel" onClick={() => resetNominationDraft()}>Отмена</button>}
              </div>
            </div>
          )}

          {(stage === "vote" || stage === "revote") && (
            <div className="vote-panel">
              <div className="vote-instruction"><div><span>Тапните номера голосующих</span><strong>Против игрока №{currentCandidate}</strong></div><b>{voteState.draft.length}</b></div>
              <div className="vote-summary"><span>Сейчас: {voteState.draft.length ? voteState.draft.map((seat) => `№${seat}`).join(", ") : "никто не выбран"}</span><strong>Зафиксировано: {lockedVoters.length} из {voteState.eligible.length}</strong></div>
              <div className="vote-legend"><span><i className="draft" />Выбран сейчас</span><span><i className="locked" />Голос уже отдан</span></div>
            </div>
          )}

          {stage === "tieSpeech" && <div className="simple-instruction"><span>Попил {tieCycle}</span><strong>Игрок №{currentSeat} получает 30 секунд</strong><small>Подъём появится, только если тот же состав снова разделит голоса</small></div>}
          {stage === "lift" && <div className="simple-instruction"><span>Финальное голосование</span><strong>Кто за подъём {tieSeats.map((seat) => `№${seat}`).join(" и ")}?</strong><small>Тапните номера голосующих «за». Остальные считаются «против».</small></div>}
          {stage === "nightShot" && <div className="shot-control"><div><span>Отстрел</span><strong>{typeof nightShotChoice === "number" ? `Выбран игрок №${nightShotChoice}` : nightShotChoice === "miss" ? "Выбран промах" : "Коснитесь игрока на столе"}</strong><small>Номер стрелявшего не нужен — фиксируется только результат.</small></div><button className={nightShotChoice === "miss" ? "is-selected" : ""} onClick={() => setNightShotChoice("miss")}><span>×</span><strong>Промах</strong></button></div>}
          {(stage === "nightDon" || stage === "nightSheriff") && <div className="check-stage-panel"><div className={`check-instruction ${currentCheckClass}`}><span>{stage === "nightDon" ? "Проверка Дона" : "Проверка Шерифа"}</span><div><small>{targetPlayer?.alive === false ? "Стул" : "Игрок"} №{nightTarget}</small><span className="check-result-value">{currentCheckRole && <RoleGlyph role={currentCheckRole} />}<strong>{currentCheckResult.toUpperCase()}</strong></span></div><p>{targetPlayer?.alive === false ? "Выбран номер ранее выбывшего игрока" : stage === "nightDon" ? "Приложение показывает: Шериф или не Шериф" : "Приложение показывает: Мафия или Мирный"}</p></div><button type="button" className="skip-check" onClick={skipNightCheck}><span>×</span><strong>Пропустить проверку</strong></button></div>}
          {stage === "nightSummary" && <div className="night-summary"><span>Ночь записана</span>{nightRecords.map((record, index) => {
            const resultRole = record.type === "shot" ? null : roleForCheckResult(record.result);
            return <div key={`${record.type}-${record.target ?? "skip"}-${index}`} className={resultRole ? `role-${roleClassNames[resultRole]}` : ""}><strong>{record.type === "shot" ? "Отстрел" : record.type === "don" ? "Проверка Дона" : "Проверка Шерифа"}</strong><span className="night-record-value">{resultRole && <RoleGlyph role={resultRole} />}{record.type === "shot" ? record.target ? `игрок №${record.target}` : "промах" : record.result === "Пропуск" ? "пропуск" : `${record.checkedEmptySeat ? "стул " : ""}№${record.target} · ${record.result.toUpperCase()}`}</span></div>;
          })}<div className="night-outcome"><strong>Утром</strong><span>{shotResult ? `выбывает №${shotResult}` : "никто не выбывает"}</span></div></div>}

          {stage === "gameOver" && (
            <div className="game-over-panel">
              <span>Финальный результат</span>
              <strong>Победа {winner === "red" ? "красных" : "чёрных"}</strong>
              <div className="game-over-score" aria-label={`Осталось красных: ${aliveRedCount}, чёрных: ${aliveBlackCount}`}>
                <span className="red"><b>{aliveRedCount}</b> красных</span>
                <span className="black"><b>{aliveBlackCount}</b> чёрных</span>
              </div>
              <small>{winner === "red" ? "Все игроки чёрной команды покинули стол" : "Чёрных стало не меньше, чем красных"}</small>
            </div>
          )}

          <button className="primary-action" onClick={onPrimary} disabled={primaryDisabled}>
            <span><small>{stage === "gameOver" ? "Роли раскрыты · результат зафиксирован" : stage === "speech" ? "Речи идут по часовой стрелке" : stage === "farewellSpeech" ? "Прощальная речь длится 60 секунд" : stage === "nominationReview" ? "Порядок выставлений зафиксирован" : stage === "vote" || stage === "revote" ? `${voteState.draft.length} ${voteWord(voteState.draft.length)} будет зафиксировано` : isNightCheckStage ? "На проверку отведено 15 секунд" : "Следующий этап откроется автоматически"}</small>{primaryLabel}</span>
            <strong>{stage === "gameOver" ? "↻" : "→"}</strong>
          </button>
        </section>

        {penaltyPanelOpen && penaltyAvailable && (
          <div className="penalty-overlay" onClick={() => setPenaltyPanelOpen(false)}>
            <section id="penalty-panel" className="penalty-sheet" role="dialog" aria-modal="true" aria-labelledby="penalty-title" onClick={(event) => event.stopPropagation()}>
              <div className="penalty-sheet-head">
                <div><span>Не останавливает таймер</span><strong id="penalty-title">Фолы и удаления</strong></div>
                <button type="button" onClick={() => setPenaltyPanelOpen(false)} aria-label="Закрыть фолы">×</button>
              </div>
              <div className="penalty-seat-picker" aria-label="Выберите игрока">
                {players.map((player) => (
                  <button
                    key={player.seat}
                    type="button"
                    className={`${selectedSeat === player.seat ? "is-selected" : ""} ${!player.alive ? "is-out" : ""}`}
                    onClick={() => setSelectedSeat(player.seat)}
                    disabled={!player.alive}
                    aria-pressed={selectedSeat === player.seat}
                    aria-label={`Игрок №${player.seat}: ${player.fouls} фолов, ${player.yellowCards} жёлтых карточек${player.alive ? "" : ", вне игры"}`}
                  >
                    <strong>{player.seat}</strong>
                    <span><FoulMarks count={player.fouls} />{player.yellowCards > 0 && <YellowMarks count={player.yellowCards} />}</span>
                  </button>
                ))}
              </div>
              <div className="penalty-selected">
                <div className="selected-number">{selectedPlayer.seat}</div>
                <div><span>Игрок</span><strong>{selectedPlayer.name}</strong></div>
                <div><span>Жёлтые</span><strong>{selectedPlayer.yellowCards} / 2</strong></div>
              </div>
              <div className="penalty-actions">
                <div className="foul-stepper">
                  <button onClick={removeFoul} disabled={!selectedPlayer.alive || selectedPlayer.fouls === 0} aria-label={`Снять фол у игрока №${selectedSeat}`}><span>−</span></button>
                  <div><small>Фолы · №{selectedSeat}</small><strong>{selectedPlayer.fouls} / 4</strong></div>
                  <button onClick={addFoul} disabled={!selectedPlayer.alive || selectedPlayer.fouls >= 4} aria-label={`Добавить фол игроку №${selectedSeat}`}><span>+</span></button>
                </div>
                <button className="yellow-action" onClick={addYellowCard} disabled={!selectedPlayer.alive || selectedPlayer.yellowCards >= 2}><span>▰</span><strong>Жёлтая карточка · {selectedPlayer.yellowCards}/2</strong></button>
              </div>
              <div className={`penalty-rule ${voteSkips > 0 ? "has-skips" : ""}`}>
                <span aria-hidden="true">↷</span>
                <div><strong>{voteSkips > 0 ? `Без голосования: ${voteSkips}` : "Удаление вместо съёма"}</strong><small>Каждое удаление отменяет одно голосование — текущее или ближайшее.</small></div>
              </div>
            </section>
          </div>
        )}

      </section>
    </main>
  );
}
