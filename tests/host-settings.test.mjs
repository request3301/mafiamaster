import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_HOST_SETTINGS,
  normalizeTimerSeconds,
  parseHostSettings,
  HOST_SETTINGS_STORAGE_KEY,
  LEGACY_HOST_SETTINGS_STORAGE_KEY,
  readLocalHostSettings,
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

test("uses a Telegram-compatible key and migrates legacy local settings", () => {
  assert.match(HOST_SETTINGS_STORAGE_KEY, /^[A-Za-z0-9_-]+$/);

  const values = new Map([
    [LEGACY_HOST_SETTINGS_STORAGE_KEY, JSON.stringify({ speechSeconds: 65, freeSeatingSeconds: 55 })],
  ]);
  const writes = [];
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      writes.push([key, value]);
      values.set(key, value);
    },
  };

  assert.deepEqual(readLocalHostSettings(storage), {
    serialized: JSON.stringify({ speechSeconds: 65, freeSeatingSeconds: 55 }),
    settings: { speechSeconds: 65, freeSeatingSeconds: 55 },
  });
  assert.deepEqual(writes, [[HOST_SETTINGS_STORAGE_KEY, JSON.stringify({ speechSeconds: 65, freeSeatingSeconds: 55 })]]);
});
