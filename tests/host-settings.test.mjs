import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_HOST_SETTINGS,
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

test("normalizes arbitrary positive custom durations to whole seconds", () => {
  assert.equal(normalizeTimerSeconds("75.4", 50), 75);
  assert.equal(normalizeTimerSeconds(1, 50), 1);
  assert.equal(normalizeTimerSeconds(5000, 40), 5000);
  assert.equal(normalizeTimerSeconds("invalid", 40), 40);
});
