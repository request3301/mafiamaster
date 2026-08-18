export const GAME_STATE_STORAGE_KEY = "mafia-master-game-state-v1";
export const GAME_STATE_VERSION = 1 as const;

export type Stage =
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
  | "bestMove"
  | "gameOver";

export type Role = "Мирный" | "Мафия" | "Дон" | "Шериф";
export type DealMethod = "app" | "cards" | null;
export type VoteMap = Record<number, number[]>;
export type EliminationReason = "fouls" | "yellowCards" | "vote" | "shot" | null;

export type FarewellState = {
  seats: number[];
  index: number;
  reason: "vote" | "shot";
  after: "night" | "round";
} | null;

export type Player = {
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

export type NominationRecord = {
  day: number;
  round: number;
  order: number;
  nominatorSeat: number;
  candidateSeat: number;
};

export type VoteState = {
  candidates: number[];
  eligible: number[];
  index: number;
  confirmed: VoteMap;
  draft: number[];
};

export type NightRecord =
  | { type: "shot"; target: number | null }
  | { type: "don"; target: number | null; result: "Шериф" | "Не шериф" | "Пропуск"; checkedEmptySeat: boolean }
  | { type: "sheriff"; target: number | null; result: "Мафия" | "Мирный" | "Пропуск"; checkedEmptySeat: boolean };

export type AppDealHistoryEntry = {
  playerIndex: number;
  cardIndex: number;
  role: Role;
};

export type BestMoveRecord = {
  night: number;
  playerSeat: number;
  selectedSeats: number[];
  skipped: boolean;
};

export type GameSnapshot = {
  players: Player[];
  stage: Stage;
  dealMethod: DealMethod;
  dealIndex: number;
  appRoleDeck: Role[];
  selectedAppCardIndex: number | null;
  appDealHistory: AppDealHistoryEntry[];
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
  pendingBestMoveSeat: number | null;
  bestMoveDraft: number[];
  bestMoveRecords: BestMoveRecord[];
  farewellState: FarewellState;
  nominationRecords: NominationRecord[];
  eventLog: string[];
};

export type UndoEntry = {
  label: string;
  snapshot: GameSnapshot;
};

export type PersistedGameState = {
  version: typeof GAME_STATE_VERSION;
  savedAt: number;
  deadlineAt: number | null;
  snapshot: GameSnapshot;
  history: UndoEntry[];
};

const stages = new Set<Stage>([
  "dealChoice",
  "appDeal",
  "manualDeal",
  "dealReady",
  "agreement",
  "freeSeating",
  "morningReady",
  "speech",
  "farewellSpeech",
  "nominationReview",
  "vote",
  "tieSpeech",
  "revote",
  "lift",
  "nightShot",
  "nightDon",
  "nightSheriff",
  "nightSummary",
  "bestMove",
  "gameOver",
]);
const roles = new Set<Role>(["Мирный", "Мафия", "Дон", "Шериф"]);
const eliminationReasons = new Set<Exclude<EliminationReason, null>>(["fouls", "yellowCards", "vote", "shot"]);
const MAX_PERSISTED_CHARACTERS = 5 * 1024 * 1024;
const MAX_UNDO_ENTRIES = 25;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIntegerBetween(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSeat(value: unknown): value is number {
  return isIntegerBetween(value, 1, 10);
}

function isNullableSeat(value: unknown): value is number | null {
  return value === null || isSeat(value);
}

function isRole(value: unknown): value is Role {
  return typeof value === "string" && roles.has(value as Role);
}

function isSeatList(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isSeat);
}

function isPlayer(value: unknown): value is Player {
  if (!isRecord(value)) return false;
  return isSeat(value.seat)
    && typeof value.name === "string"
    && (value.role === null || isRole(value.role))
    && isIntegerBetween(value.fouls, 0, 4)
    && isIntegerBetween(value.yellowCards, 0, 2)
    && typeof value.shortSpeechPending === "boolean"
    && (value.nomination === null || isIntegerBetween(value.nomination, 1, 10))
    && isNullableSeat(value.nominatedBy)
    && typeof value.alive === "boolean"
    && (value.eliminatedBy === null || (
      typeof value.eliminatedBy === "string"
      && eliminationReasons.has(value.eliminatedBy as Exclude<EliminationReason, null>)
    ));
}

function isPlayerList(value: unknown): value is Player[] {
  if (!Array.isArray(value) || value.length !== 10 || !value.every(isPlayer)) return false;
  return new Set(value.map((player) => player.seat)).size === 10;
}

function isVoteState(value: unknown): value is VoteState {
  if (!isRecord(value)
    || !isSeatList(value.candidates)
    || !isSeatList(value.eligible)
    || !isIntegerBetween(value.index, 0)
    || !isRecord(value.confirmed)
    || !isSeatList(value.draft)) return false;

  return Object.entries(value.confirmed).every(([candidate, voters]) => (
    isSeat(Number(candidate)) && isSeatList(voters)
  ));
}

function isAppDealHistoryEntry(value: unknown): value is AppDealHistoryEntry {
  return isRecord(value)
    && isIntegerBetween(value.playerIndex, 0, 9)
    && isIntegerBetween(value.cardIndex, 0, 9)
    && isRole(value.role);
}

function isNightRecord(value: unknown): value is NightRecord {
  if (!isRecord(value) || !isNullableSeat(value.target)) return false;
  if (value.type === "shot") return true;
  if (value.type === "don") {
    return (value.result === "Шериф" || value.result === "Не шериф" || value.result === "Пропуск")
      && typeof value.checkedEmptySeat === "boolean";
  }
  if (value.type === "sheriff") {
    return (value.result === "Мафия" || value.result === "Мирный" || value.result === "Пропуск")
      && typeof value.checkedEmptySeat === "boolean";
  }
  return false;
}

function isBestMoveRecord(value: unknown): value is BestMoveRecord {
  return isRecord(value)
    && isIntegerBetween(value.night, 0)
    && isSeat(value.playerSeat)
    && isSeatList(value.selectedSeats)
    && typeof value.skipped === "boolean";
}

function isFarewellState(value: unknown): value is FarewellState {
  if (value === null) return true;
  return isRecord(value)
    && isSeatList(value.seats)
    && value.seats.length > 0
    && isIntegerBetween(value.index, 0, value.seats.length - 1)
    && (value.reason === "vote" || value.reason === "shot")
    && (value.after === "night" || value.after === "round");
}

function isNominationRecord(value: unknown): value is NominationRecord {
  return isRecord(value)
    && isIntegerBetween(value.day, 0)
    && isIntegerBetween(value.round, 0)
    && isIntegerBetween(value.order, 1, 10)
    && isSeat(value.nominatorSeat)
    && isSeat(value.candidateSeat);
}

export function isGameSnapshot(value: unknown): value is GameSnapshot {
  if (!isRecord(value)
    || !isPlayerList(value.players)
    || typeof value.stage !== "string"
    || !stages.has(value.stage as Stage)
    || !(value.dealMethod === null || value.dealMethod === "app" || value.dealMethod === "cards")
    || !isIntegerBetween(value.dealIndex, 0, 9)
    || !Array.isArray(value.appRoleDeck)
    || !value.appRoleDeck.every(isRole)
    || !(value.selectedAppCardIndex === null || isIntegerBetween(value.selectedAppCardIndex, 0, 9))
    || !Array.isArray(value.appDealHistory)
    || !value.appDealHistory.every(isAppDealHistoryEntry)
    || typeof value.masterSummaryVisible !== "boolean"
    || !isIntegerBetween(value.day, 0)
    || !isIntegerBetween(value.round, 0)
    || !isSeat(value.roundStarter)
    || !isSeat(value.currentSeat)
    || !isSeat(value.selectedSeat)
    || !isSeatList(value.spokenSeats)
    || !isFiniteNumber(value.seconds)
    || value.seconds < 0
    || !isFiniteNumber(value.timerBaseSeconds)
    || value.timerBaseSeconds <= 0
    || !isFiniteNumber(value.timerTotalSeconds)
    || value.timerTotalSeconds <= 0
    || typeof value.running !== "boolean"
    || !isVoteState(value.voteState)
    || !isSeatList(value.tieSeats)
    || !isIntegerBetween(value.tieSpeechIndex, 0)
    || !isIntegerBetween(value.tieCycle, 0)
    || !isSeatList(value.liftDraft)
    || !isIntegerBetween(value.voteSkips, 0)
    || !isSeat(value.nightTarget)
    || !(value.nightShotChoice === null || value.nightShotChoice === "miss" || isSeat(value.nightShotChoice))
    || !Array.isArray(value.nightRecords)
    || !value.nightRecords.every(isNightRecord)
    || !isNullableSeat(value.pendingBestMoveSeat)
    || !isSeatList(value.bestMoveDraft)
    || !Array.isArray(value.bestMoveRecords)
    || !value.bestMoveRecords.every(isBestMoveRecord)
    || !isFarewellState(value.farewellState)
    || !Array.isArray(value.nominationRecords)
    || !value.nominationRecords.every(isNominationRecord)
    || !Array.isArray(value.eventLog)
    || !value.eventLog.every((entry) => typeof entry === "string")) return false;

  return value.selectedAppCardIndex === null || value.selectedAppCardIndex < value.appRoleDeck.length;
}

function isUndoEntry(value: unknown): value is UndoEntry {
  return isRecord(value) && typeof value.label === "string" && isGameSnapshot(value.snapshot);
}

function isPersistedGameState(value: unknown): value is PersistedGameState {
  if (!isRecord(value)
    || value.version !== GAME_STATE_VERSION
    || !isFiniteNumber(value.savedAt)
    || value.savedAt < 0
    || !(value.deadlineAt === null || (isFiniteNumber(value.deadlineAt) && value.deadlineAt >= 0))
    || !isGameSnapshot(value.snapshot)
    || !Array.isArray(value.history)
    || value.history.length > MAX_UNDO_ENTRIES
    || !value.history.every(isUndoEntry)) return false;

  return value.snapshot.running ? value.deadlineAt !== null : value.deadlineAt === null;
}

export function serializeGameState(state: PersistedGameState): string {
  return JSON.stringify(state);
}

export function parseGameState(serialized: string | null | undefined): PersistedGameState | null {
  if (!serialized || serialized.length > MAX_PERSISTED_CHARACTERS) return null;
  try {
    const parsed: unknown = JSON.parse(serialized);
    return isPersistedGameState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function selectNewestGameState(
  ...states: Array<PersistedGameState | null>
): PersistedGameState | null {
  return states.reduce<PersistedGameState | null>((newest, state) => {
    if (!state) return newest;
    if (!newest || state.savedAt > newest.savedAt) return state;
    return newest;
  }, null);
}

export function resumeGameState(state: PersistedGameState, now: number): PersistedGameState {
  const privateSnapshot: GameSnapshot = {
    ...state.snapshot,
    selectedAppCardIndex: null,
    masterSummaryVisible: false,
  };
  if (!privateSnapshot.running || state.deadlineAt === null) {
    return { ...state, snapshot: privateSnapshot };
  }
  const safeNow = Number.isFinite(now) ? now : state.savedAt;
  const seconds = Math.max(0, Math.ceil((state.deadlineAt - safeNow) / 1000));
  return {
    ...state,
    snapshot: {
      ...privateSnapshot,
      seconds,
      running: seconds > 0,
    },
  };
}
