import type { safeStorage } from "electron";
import type { TokenCodec } from "./A20sConfigStore";

export function createElectronSafeStorageTokenCodec(
  storage: typeof safeStorage,
): TokenCodec {
  return {
    isAvailable: () => storage.isEncryptionAvailable(),
    encrypt: (value) => storage.encryptString(value).toString("base64"),
    decrypt: (value) => storage.decryptString(Buffer.from(value, "base64")),
  };
}
