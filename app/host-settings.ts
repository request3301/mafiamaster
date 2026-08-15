export type HostSettings = {
  speechSeconds: number;
  freeSeatingSeconds: number;
};

export const DEFAULT_HOST_SETTINGS: HostSettings = {
  speechSeconds: 50,
  freeSeatingSeconds: 40,
};

export const HOST_SETTINGS_STORAGE_KEY = "mafia-master:host-settings:v1";
export const MIN_TIMER_SECONDS = 10;
export const MAX_TIMER_SECONDS = 600;

export function normalizeTimerSeconds(value: unknown, fallback: number) {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(MAX_TIMER_SECONDS, Math.max(MIN_TIMER_SECONDS, Math.round(numericValue)));
}

export function parseHostSettings(serialized: string | null): HostSettings {
  if (!serialized) return DEFAULT_HOST_SETTINGS;

  try {
    const parsed = JSON.parse(serialized) as Partial<HostSettings>;
    return {
      speechSeconds: normalizeTimerSeconds(parsed.speechSeconds, DEFAULT_HOST_SETTINGS.speechSeconds),
      freeSeatingSeconds: normalizeTimerSeconds(parsed.freeSeatingSeconds, DEFAULT_HOST_SETTINGS.freeSeatingSeconds),
    };
  } catch {
    return DEFAULT_HOST_SETTINGS;
  }
}
