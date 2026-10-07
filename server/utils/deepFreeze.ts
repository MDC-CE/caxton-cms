/** Shared cached values are frozen outside production so any write throws where it happens. */
export const FREEZE_SHARED_CACHE = process.env.NODE_ENV !== "production";

export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value as Record<string, unknown>)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

export function freezeShared<T>(value: T): T {
  return FREEZE_SHARED_CACHE ? deepFreeze(value) : value;
}
