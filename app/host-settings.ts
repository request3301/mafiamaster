export type HostSettings = {
  speechSeconds: number;
  freeSeatingSeconds: number;
};

export const DEFAULT_HOST_SETTINGS: HostSettings = {
  speechSeconds: 50,
  freeSeatingSeconds: 40,
};

export const HOST_SETTINGS_STORAGE_KEY = "mafia-master:host-settings:v1";

export function normalizeTimerSeconds(value: unknown, fallback: number) {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return fallback;
  return Math.max(1, Math.round(numericValue));
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
