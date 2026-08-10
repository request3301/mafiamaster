import assert from "node:assert/strict";
import test from "node:test";
import {
  canPerformNightCheck,
  canSaveNominationPair,
  getWinner,
  nextNightStageAfterSkip,
  normalizeNominationPairs,
  orderNominationPairsBySpeech,
  resolveTieOutcome,
  sameSeatSet,
  shouldEndFarewellForPenalty,
  updateNominationForSpeaker,
} from "../app/game-rules.ts";

test("continues changing tie groups and lifts only the same repeated group", () => {
  assert.equal(resolveTieOutcome([1, 2, 3, 4, 5], [1, 2, 3]), "repeat");
  assert.equal(resolveTieOutcome([1, 2, 3], [1, 2]), "repeat");
  assert.equal(resolveTieOutcome([1, 2], [2, 1]), "lift");
  assert.equal(resolveTieOutcome([1, 2], [2]), "farewell");
  assert.equal(resolveTieOutcome([1, 2], []), "night");
  assert.equal(sameSeatSet([5, 3, 2], [2, 5, 3]), true);
});

test("keeps nomination order while enforcing one nominator and one candidate", () => {
  const pairs = [
    { order: 1, nominatorSeat: 5, candidateSeat: 2 },
    { order: 2, nominatorSeat: 3, candidateSeat: 7 },
  ];
  const speechOrder = [5, 6, 7, 8, 9, 10, 2, 3, 4];
  assert.equal(canSaveNominationPair(pairs, { nominatorSeat: 5, candidateSeat: 8 }, speechOrder), false);
  assert.equal(canSaveNominationPair(pairs, { nominatorSeat: 8, candidateSeat: 7 }, speechOrder), false);
  assert.equal(canSaveNominationPair(pairs, { nominatorSeat: 8, candidateSeat: 9 }, speechOrder), true);
  assert.equal(canSaveNominationPair(pairs, { nominatorSeat: 5, candidateSeat: 8 }, speechOrder, 1), true);
  assert.equal(canSaveNominationPair(pairs, { nominatorSeat: 1, candidateSeat: 9 }, speechOrder), false);
  assert.deepEqual(normalizeNominationPairs([pairs[1], pairs[0]]).map((pair) => pair.order), [1, 2]);
  assert.deepEqual(
    orderNominationPairsBySpeech([pairs[1], { order: 3, nominatorSeat: 1, candidateSeat: 8 }, pairs[0]], speechOrder)
      .map(({ order, nominatorSeat }) => ({ order, nominatorSeat })),
    [{ order: 1, nominatorSeat: 5 }, { order: 2, nominatorSeat: 3 }],
  );

  const added = updateNominationForSpeaker(pairs, speechOrder, 8, 9);
  assert.deepEqual(added?.map((pair) => [pair.nominatorSeat, pair.candidateSeat]), [[5, 2], [8, 9], [3, 7]]);
  const replaced = updateNominationForSpeaker(added ?? [], speechOrder, 8, 4);
  assert.deepEqual(replaced?.map((pair) => [pair.nominatorSeat, pair.candidateSeat]), [[5, 2], [8, 4], [3, 7]]);
  const removed = updateNominationForSpeaker(replaced ?? [], speechOrder, 8, null);
  assert.deepEqual(removed?.map((pair) => [pair.nominatorSeat, pair.candidateSeat]), [[5, 2], [3, 7]]);
  assert.equal(updateNominationForSpeaker(pairs, speechOrder, 8, 7), null);
});

test("a role shot this night still checks, while a daytime departure does not", () => {
  assert.equal(canPerformNightCheck(true, false), true);
  assert.equal(canPerformNightCheck(false, true), true);
  assert.equal(canPerformNightCheck(false, false), false);
});

test("skipping checks follows the night order", () => {
  assert.equal(nextNightStageAfterSkip("don", true), "nightSheriff");
  assert.equal(nextNightStageAfterSkip("don", false), "nightSummary");
  assert.equal(nextNightStageAfterSkip("sheriff", true), "nightSummary");
});

test("farewell penalties end the speech only at a removal threshold", () => {
  assert.equal(shouldEndFarewellForPenalty(3, 1), false);
  assert.equal(shouldEndFarewellForPenalty(4, 1), true);
  assert.equal(shouldEndFarewellForPenalty(1, 2), true);
});

test("winner rules remain intact", () => {
  assert.equal(getWinner([{ alive: true, role: "Мирный" }]), "red");
  assert.equal(getWinner([
    { alive: true, role: "Мафия" },
    { alive: true, role: "Мирный" },
  ]), "black");
});
