export function createId(): string {
  const cryptoLike = globalThis.crypto as
    | {
        randomUUID?: () => `${string}-${string}-${string}-${string}-${string}`;
        getRandomValues?: <T extends Uint8Array>(array: T) => T;
      }
    | undefined;

  if (cryptoLike?.randomUUID) {
    return cryptoLike.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (!cryptoLike?.getRandomValues) {
    throw new Error("Gerador seguro de identificadores indisponível.");
  }
  cryptoLike.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}
