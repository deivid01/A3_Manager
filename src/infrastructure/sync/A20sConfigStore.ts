import fs from "node:fs";
import path from "node:path";
import { ZodError } from "zod";
import { AppError } from "../../domain/appError";
import {
  a20sSyncConfigSchema,
  type A20sSyncConfigInput,
  type A20sSyncPublicConfig,
} from "../../shared/contracts";

export const defaultA20sBaseUrl = "http://10.155.37.230:3000";
export const defaultA20sDatabase = "a3_manager";

export interface EffectiveA20sConfig {
  baseUrl: string;
  database: string;
  token: string;
}

export interface TokenCodec {
  isAvailable(): boolean;
  encrypt(value: string): string;
  decrypt(value: string): string;
}

interface StoredA20sConfig {
  baseUrl?: string;
  database?: string;
  encryptedToken?: string;
}

export class A20sConfigStore {
  private readonly configPath: string;

  constructor(
    userDataPath: string,
    private readonly tokenCodec: TokenCodec,
  ) {
    this.configPath = path.join(userDataPath, "a20s-sync-config.json");
  }

  getPublicConfig(): A20sSyncPublicConfig {
    const stored = this.readStored();
    return {
      baseUrl: normalizeBaseUrl(
        process.env.A20S_DB_URL ?? stored.baseUrl ?? defaultA20sBaseUrl,
      ),
      database: normalizeDatabaseName(
        process.env.A20S_DB_NAME ?? stored.database ?? defaultA20sDatabase,
      ),
      tokenConfigured: Boolean(process.env.A20S_DB_TOKEN || stored.encryptedToken),
    };
  }

  loadEffectiveConfig(input?: A20sSyncConfigInput): EffectiveA20sConfig {
    const stored = this.readStored();
    const parsed = input ? parseSyncConfigInput(input) : null;
    const baseUrl = normalizeBaseUrl(
      process.env.A20S_DB_URL ??
        parsed?.baseUrl ??
        stored.baseUrl ??
        defaultA20sBaseUrl,
    );
    const database = normalizeDatabaseName(
      process.env.A20S_DB_NAME ??
        parsed?.database ??
        stored.database ??
        defaultA20sDatabase,
    );
    const token =
      process.env.A20S_DB_TOKEN ??
      (parsed?.token?.trim() ? parsed.token.trim() : this.decryptStoredToken(stored));

    if (!token) {
      throw new AppError(
        "A3-SYNC-009",
        "Token da API do servidor de sincronização não configurado.",
      );
    }

    return { baseUrl, database, token };
  }

  save(input: A20sSyncConfigInput): A20sSyncPublicConfig {
    const parsed = parseSyncConfigInput(input);
    const current = this.readStored();
    const next: StoredA20sConfig = {
      baseUrl: normalizeBaseUrl(parsed.baseUrl),
      database: normalizeDatabaseName(parsed.database),
      encryptedToken: current.encryptedToken,
    };

    if (parsed.token.trim()) {
      if (!this.tokenCodec.isAvailable()) {
        throw new AppError(
          "A3-SYNC-009",
          "A proteção local de credenciais não está disponível neste Windows.",
        );
      }
      next.encryptedToken = this.tokenCodec.encrypt(parsed.token.trim());
    }

    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    fs.writeFileSync(this.configPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return this.getPublicConfig();
  }

  private readStored(): StoredA20sConfig {
    if (!fs.existsSync(this.configPath)) {
      return {};
    }

    try {
      return JSON.parse(fs.readFileSync(this.configPath, "utf8")) as StoredA20sConfig;
    } catch {
      throw new AppError(
        "A3-SYNC-009",
        "Configuração local do servidor de sincronização está ilegível.",
      );
    }
  }

  private decryptStoredToken(stored: StoredA20sConfig): string {
    if (!stored.encryptedToken) {
      return "";
    }
    if (!this.tokenCodec.isAvailable()) {
      throw new AppError(
        "A3-SYNC-009",
        "Token salvo não pode ser lido porque a proteção local está indisponível.",
      );
    }
    return this.tokenCodec.decrypt(stored.encryptedToken);
  }
}

export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/$/, "");
}

export function normalizeDatabaseName(value: string): string {
  const database = value.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(database)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Nome do banco remoto inválido. Use apenas letras, números, hífen ou underscore.",
    );
  }
  return database;
}

function parseSyncConfigInput(input: A20sSyncConfigInput): A20sSyncConfigInput {
  try {
    return a20sSyncConfigSchema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new AppError(
        "VALIDATION_ERROR",
        error.issues[0]?.message ?? "Configuração do servidor de sincronização inválida.",
      );
    }
    throw error;
  }
}
