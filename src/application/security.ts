import { scrypt } from "scrypt-js";

const keyLength = 64;
const scryptCost = 16_384;
const scryptBlockSize = 8;
const scryptParallelization = 1;

export async function hashPassword(password: string): Promise<string> {
  const salt = bytesToHex(randomBytes(16));
  const derived = await deriveScrypt(password, salt, keyLength);
  return `scrypt:${salt}:${bytesToHex(derived)}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, salt, hash] = storedHash.split(":");
  if (algorithm !== "scrypt" || !salt || !hash) {
    return false;
  }

  const expected = hexToBytes(hash);
  const derived = await deriveScrypt(password, salt, expected.length);
  return timingSafeEqual(expected, derived);
}

async function deriveScrypt(
  password: string,
  salt: string,
  length: number,
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  return scrypt(
    encoder.encode(password),
    encoder.encode(salt),
    scryptCost,
    scryptBlockSize,
    scryptParallelization,
    length,
  );
}

function randomBytes(size: number): Uint8Array {
  const cryptoLike = globalThis.crypto as
    | { getRandomValues?: <T extends Uint8Array>(array: T) => T }
    | undefined;
  if (!cryptoLike?.getRandomValues) {
    throw new Error("Gerador seguro de bytes indisponível.");
  }
  const bytes = new Uint8Array(size);
  cryptoLike.getRandomValues(bytes);
  return bytes;
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string): Uint8Array {
  if (value.length % 2 !== 0 || /[^a-f0-9]/i.test(value)) {
    return new Uint8Array();
  }
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}
