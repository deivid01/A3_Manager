import { useEffect } from "react";

export interface DraftStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const DRAFT_PREFIX = "a3-manager:draft:v1";
const WRITE_DELAY_MS = 250;

export function buildDraftKey(userId: string, scope: string): string {
  return `${DRAFT_PREFIX}:${userId}:${scope}`;
}

export function readStoredDraft<T>(
  storage: DraftStorage | null,
  key: string,
  guard: (value: unknown) => value is T,
): T | null {
  if (!storage) return null;
  const raw = storage.getItem(key);
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as unknown;
    if (guard(value)) return value;
  } catch {
    storage.removeItem(key);
    return null;
  }

  storage.removeItem(key);
  return null;
}

export function writeStoredDraft<T>(
  storage: DraftStorage | null,
  key: string,
  value: T,
  meaningful: boolean,
): void {
  if (!storage) return;
  if (!meaningful) {
    storage.removeItem(key);
    return;
  }
  storage.setItem(key, JSON.stringify(value));
}

export function removeStoredDraft(storage: DraftStorage | null, key: string): void {
  storage?.removeItem(key);
}

export function clearStoredDraftsForUser(
  storage: DraftStorage | null,
  userId: string,
): void {
  if (!storage) return;
  const userPrefix = `${DRAFT_PREFIX}:${userId}:`;
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(userPrefix)) keys.push(key);
  }
  keys.forEach((key) => storage.removeItem(key));
}

export function getSessionDraftStorage(): DraftStorage | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

export function useStoredDraft<T>({
  key,
  value,
  meaningful,
}: {
  key: string;
  value: T;
  meaningful: boolean;
}): void {
  useEffect(() => {
    const storage = getSessionDraftStorage();
    const handle = window.setTimeout(() => {
      writeStoredDraft(storage, key, value, meaningful);
    }, WRITE_DELAY_MS);

    return () => window.clearTimeout(handle);
  }, [key, meaningful, value]);
}
