export type Winner = "red" | "black";
export type TieOutcome = "night" | "farewell" | "repeat" | "lift";

export type NominationPair = {
  order: number;
  nominatorSeat: number;
  candidateSeat: number;
};

type RulePlayer = {
  alive: boolean;
  role: "Мирный" | "Мафия" | "Дон" | "Шериф" | null;
};

export function getWinner(players: RulePlayer[]): Winner | null {
  const alivePlayers = players.filter((player) => player.alive);
  const blackCount = alivePlayers.filter((player) => player.role === "Мафия" || player.role === "Дон").length;
  const redCount = alivePlayers.length - blackCount;

  if (blackCount === 0) return "red";
  if (blackCount >= redCount) return "black";
  return null;
}

export function sameSeatSet(left: number[], right: number[]) {
  if (left.length !== right.length) return false;
  const rightSeats = new Set(right);
  return left.every((seat) => rightSeats.has(seat));
}

export function resolveTieOutcome(previousTie: number[], leaders: number[]): TieOutcome {
  if (leaders.length === 0) return "night";
  if (leaders.length === 1) return "farewell";
  return sameSeatSet(previousTie, leaders) ? "lift" : "repeat";
}

export function normalizeNominationPairs(pairs: NominationPair[]): NominationPair[] {
  return pairs.map((pair, index) => ({ ...pair, order: index + 1 }));
}

export function orderNominationPairsBySpeech(pairs: NominationPair[], speechOrder: number[]): NominationPair[] {
  const rank = new Map(speechOrder.map((seat, index) => [seat, index]));
  return normalizeNominationPairs(pairs
    .filter((pair) => rank.has(pair.nominatorSeat))
    .sort((left, right) => rank.get(left.nominatorSeat)! - rank.get(right.nominatorSeat)!));
}

export function canSaveNominationPair(
  pairs: NominationPair[],
  pair: Pick<NominationPair, "nominatorSeat" | "candidateSeat">,
  speechOrder: number[],
  editingOrder: number | null = null,
) {
  return speechOrder.includes(pair.nominatorSeat) && !pairs.some((current) => current.order !== editingOrder && (
    current.nominatorSeat === pair.nominatorSeat || current.candidateSeat === pair.candidateSeat
  ));
}

export function updateNominationForSpeaker(
  pairs: NominationPair[],
  speechOrder: number[],
  nominatorSeat: number,
  candidateSeat: number | null,
): NominationPair[] | null {
  if (!speechOrder.includes(nominatorSeat)) return null;
  if (candidateSeat !== null && pairs.some((pair) => (
    pair.nominatorSeat !== nominatorSeat && pair.candidateSeat === candidateSeat
  ))) return null;

  const remaining = pairs.filter((pair) => pair.nominatorSeat !== nominatorSeat);
  if (candidateSeat === null) return orderNominationPairsBySpeech(remaining, speechOrder);

  return orderNominationPairsBySpeech([
    ...remaining,
    { order: pairs.length + 1, nominatorSeat, candidateSeat },
  ], speechOrder);
}

export function canPerformNightCheck(aliveAtNightStart: boolean, shotThisNight: boolean) {
  return aliveAtNightStart || shotThisNight;
}

export function shouldEndFarewellForPenalty(fouls: number, yellowCards: number) {
  return fouls >= 4 || yellowCards >= 2;
}

export function nextNightStageAfterSkip(checker: "don" | "sheriff", sheriffAvailable: boolean) {
  return checker === "don" && sheriffAvailable ? "nightSheriff" as const : "nightSummary" as const;
}
