import assert from "node:assert/strict";
import test from "node:test";

import {
  GAME_STATE_VERSION,
  parseGameState,
  resumeGameState,
  selectNewestGameState,
  serializeGameState,
} from "../app/game-state.ts";

function makePlayers() {
  const roles = ["Мирный", "Мирный", "Мирный", "Мирный", "Мирный", "Мирный", "Мафия", "Мафия", "Дон", "Шериф"];
  return Array.from({ length: 10 }, (_, index) => ({
    seat: index + 1,
    name: `Игрок ${index + 1}`,
    role: roles[index],
    fouls: 0,
    yellowCards: 0,
    shortSpeechPending: false,
    nomination: null,
    nominatedBy: null,
    alive: true,
    eliminatedBy: null,
  }));
}

function makeSnapshot(overrides = {}) {
  return {
    players: makePlayers(),
    stage: "speech",
    dealMethod: "cards",
    dealIndex: 9,
    appRoleDeck: [],
    selectedAppCardIndex: null,
    appDealHistory: [],
    masterSummaryVisible: false,
    day: 1,
    round: 1,
    roundStarter: 1,
    currentSeat: 3,
    selectedSeat: 3,
    spokenSeats: [1, 2],
    seconds: 0,
    timerBaseSeconds: 50,
    timerTotalSeconds: 50,
    running: true,
    voteState: {
      candidates: [],
      eligible: [],
      index: 0,
      confirmed: {},
      draft: [],
    },
    tieSeats: [],
    tieSpeechIndex: 0,
    tieCycle: 0,
    liftDraft: [],
    voteSkips: 0,
    nightTarget: 1,
    nightShotChoice: null,
    nightRecords: [],
    pendingBestMoveSeat: null,
    bestMoveDraft: [],
    bestMoveRecords: [],
    farewellState: null,
    nominationRecords: [],
    eventLog: ["Речь игрока 3"],
    ...overrides,
  };
}

function makeState(overrides = {}) {
  return {
    version: GAME_STATE_VERSION,
    savedAt: 5_000,
    deadlineAt: 11_000,
    snapshot: makeSnapshot(),
    history: [],
    ...overrides,
  };
}

test("game state survives a serialized storage round trip", () => {
  const state = makeState();
  assert.deepEqual(parseGameState(serializeGameState(state)), state);
});

test("invalid or incompatible saved state is ignored", () => {
  assert.equal(parseGameState("not json"), null);
  assert.equal(parseGameState(JSON.stringify({ ...makeState(), version: 2 })), null);
  assert.equal(parseGameState(JSON.stringify({ ...makeState(), deadlineAt: null })), null);
  assert.equal(parseGameState(JSON.stringify({
    ...makeState(),
    snapshot: { ...makeSnapshot(), players: makePlayers().slice(1) },
  })), null);
  assert.equal(parseGameState(JSON.stringify({
    ...makeState(),
    snapshot: makeSnapshot({ stage: "appDeal", dealMethod: "cards", appRoleDeck: [], appDealHistory: [] }),
  })), null);
  assert.equal(parseGameState(JSON.stringify({
    ...makeState(),
    snapshot: { ...makeSnapshot(), voteState: { ...makeSnapshot().voteState, candidates: [1], eligible: [1], index: 1 } },
  })), null);
  assert.equal(parseGameState(JSON.stringify({
    ...makeState(),
    snapshot: makeSnapshot({ stage: "vote" }),
  })), null);
  assert.equal(parseGameState(JSON.stringify({
    ...makeState(),
    snapshot: makeSnapshot({ stage: "farewellSpeech" }),
  })), null);
});

test("the newest valid storage copy wins", () => {
  const older = makeState({ savedAt: 1_000 });
  const newer = makeState({ savedAt: 2_000, snapshot: makeSnapshot({ currentSeat: 7 }) });

  assert.equal(selectNewestGameState(older, null, newer), newer);
  assert.equal(selectNewestGameState(null, older), older);
  assert.equal(selectNewestGameState(null, null), null);
});

test("a running timer reflects time elapsed while the app was closed", () => {
  const state = makeState();
  const resumed = resumeGameState(state, 7_500);

  assert.equal(resumed.snapshot.seconds, 4);
  assert.equal(resumed.snapshot.running, true);
  assert.equal(resumeGameState(state, 11_001).snapshot.seconds, 0);
  assert.equal(resumeGameState(state, 11_001).snapshot.running, false);
});

test("a paused timer keeps its saved value", () => {
  const state = makeState({
    deadlineAt: null,
    snapshot: makeSnapshot({ running: false, seconds: 23 }),
  });

  const resumed = resumeGameState(state, 50_000);
  assert.equal(resumed.snapshot.seconds, 23);
  assert.equal(resumed.snapshot.running, false);
});

test("role-reveal UI is closed when a saved game reopens", () => {
  const roles = ["Мирный", "Мирный", "Мирный", "Мирный", "Мирный", "Мирный", "Мафия", "Мафия", "Дон"];
  const state = makeState({
    deadlineAt: null,
    snapshot: makeSnapshot({
      stage: "appDeal",
      dealMethod: "app",
      dealIndex: 9,
      players: makePlayers().map((player, index) => ({ ...player, role: index < 9 ? roles[index] : null })),
      appRoleDeck: ["Шериф"],
      appDealHistory: roles.map((role, index) => ({ playerIndex: index, cardIndex: 0, role })),
      selectedAppCardIndex: 0,
      masterSummaryVisible: true,
      running: false,
      seconds: 50,
    }),
  });
  assert.deepEqual(parseGameState(serializeGameState(state)), state);
  const completedState = makeState({
    deadlineAt: null,
    snapshot: makeSnapshot({
      stage: "dealReady",
      dealMethod: "app",
      dealIndex: 9,
      players: makePlayers(),
      appRoleDeck: [],
      selectedAppCardIndex: null,
      appDealHistory: [...roles, "Шериф"].map((role, index) => ({ playerIndex: index, cardIndex: 0, role })),
      masterSummaryVisible: true,
      running: false,
    }),
  });
  assert.deepEqual(parseGameState(serializeGameState(completedState)), completedState);
  assert.equal(parseGameState(serializeGameState({
    ...completedState,
    snapshot: {
      ...completedState.snapshot,
      appDealHistory: completedState.snapshot.appDealHistory.map((entry, index) => index === 9 ? { ...entry, cardIndex: 1 } : entry),
    },
  })), null);
  const resumed = resumeGameState(state, 50_000);

  assert.equal(resumed.snapshot.selectedAppCardIndex, null);
  assert.equal(resumed.snapshot.masterSummaryVisible, false);
});

test("undo history timers also account for time spent closed", () => {
  const state = makeState({
    history: [{
      label: "речь",
      deadlineAt: 9_000,
      snapshot: makeSnapshot({ seconds: 8, running: true }),
    }],
  });
  const parsed = parseGameState(serializeGameState(state));
  assert.ok(parsed);
  const resumed = resumeGameState(parsed, 7_500);

  assert.equal(resumed.history[0].snapshot.seconds, 2);
  assert.equal(resumed.history[0].snapshot.running, true);
  assert.equal(resumed.history[0].deadlineAt, 9_000);
});

test("legacy running undo timers migrate from the save timestamp", () => {
  const state = makeState({
    history: [{
      label: "речь",
      snapshot: makeSnapshot({ seconds: 8, running: true }),
    }],
  });
  const parsed = parseGameState(serializeGameState(state));
  assert.ok(parsed);
  const resumed = resumeGameState(parsed, 7_500);

  assert.equal(resumed.history[0].snapshot.seconds, 6);
  assert.equal(resumed.history[0].snapshot.running, true);
  assert.equal(resumed.history[0].deadlineAt, 13_000);
});
