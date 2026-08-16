import { describe, expect, it } from "vitest";
import {
  buildDraftKey,
  clearStoredDraftsForUser,
  readStoredDraft,
  removeStoredDraft,
  writeStoredDraft,
  type DraftStorage,
} from "../src/renderer/lib/formDrafts";

class MemoryDraftStorage implements DraftStorage {
  private readonly entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  key(index: number): string | null {
    return Array.from(this.entries.keys())[index] ?? null;
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }
}

interface SimpleDraft {
  value: string;
}

function isSimpleDraft(value: unknown): value is SimpleDraft {
  return Boolean(
    value &&
      typeof value === "object" &&
      "value" in value &&
      typeof value.value === "string",
  );
}

describe("rascunhos de formulários em sessão", () => {
  it("grava, restaura e remove rascunhos versionados por usuário", () => {
    const storage = new MemoryDraftStorage();
    const key = buildDraftKey("user-1", "rental-launch");

    writeStoredDraft(storage, key, { value: "conteúdo" }, true);

    expect(readStoredDraft(storage, key, isSimpleDraft)).toEqual({
      value: "conteúdo",
    });

    removeStoredDraft(storage, key);

    expect(readStoredDraft(storage, key, isSimpleDraft)).toBeNull();
  });

  it("remove apenas rascunhos do usuário autenticado", () => {
    const storage = new MemoryDraftStorage();
    const userKey = buildDraftKey("user-1", "customers:create");
    const otherUserKey = buildDraftKey("user-2", "customers:create");
    const unrelatedKey = "a3-manager:appearance";

    writeStoredDraft(storage, userKey, { value: "cliente" }, true);
    writeStoredDraft(storage, otherUserKey, { value: "outro" }, true);
    storage.setItem(unrelatedKey, "dark");

    clearStoredDraftsForUser(storage, "user-1");

    expect(storage.getItem(userKey)).toBeNull();
    expect(storage.getItem(otherUserKey)).not.toBeNull();
    expect(storage.getItem(unrelatedKey)).toBe("dark");
  });

  it("não mantém rascunho sem conteúdo significativo", () => {
    const storage = new MemoryDraftStorage();
    const key = buildDraftKey("user-1", "users:create");

    writeStoredDraft(storage, key, { value: "" }, true);
    writeStoredDraft(storage, key, { value: "" }, false);

    expect(storage.getItem(key)).toBeNull();
  });
});
