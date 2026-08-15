import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_HOST_SETTINGS,
  MAX_TIMER_SECONDS,
  MIN_TIMER_SECONDS,
  normalizeTimerSeconds,
  parseHostSettings,
} from "../app/host-settings.ts";

test("uses the standard speech and free-seating durations by default", () => {
  assert.deepEqual(parseHostSettings(null), DEFAULT_HOST_SETTINGS);
  assert.deepEqual(parseHostSettings("not-json"), DEFAULT_HOST_SETTINGS);
});

test("restores valid device-local timer settings", () => {
  assert.deepEqual(parseHostSettings(JSON.stringify({
    speechSeconds: 60,
    freeSeatingSeconds: 55,
  })), {
    speechSeconds: 60,
    freeSeatingSeconds: 55,
  });
});

test("normalizes custom durations into a safe whole-second range", () => {
  assert.equal(normalizeTimerSeconds("75.4", 50), 75);
  assert.equal(normalizeTimerSeconds(1, 50), MIN_TIMER_SECONDS);
  assert.equal(normalizeTimerSeconds(5000, 40), MAX_TIMER_SECONDS);
  assert.equal(normalizeTimerSeconds("invalid", 40), 40);
});
