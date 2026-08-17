import { AppError } from "../../domain/appError";

export interface A20sDbClientOptions {
  baseUrl: string;
  token: string;
  database: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface A20sHealthResponse {
  ok: true;
  service: string;
  uptime: number;
  timestamp: string;
}

export interface A20sDatabaseInfo {
  name: string;
  file: string;
  bytes: number;
  modifiedAt: string;
}

export interface A20sQueryResponse<T> {
  ok: true;
  rows: T[];
  count: number;
  durationMs: number;
}

export interface A20sExecuteResponse {
  ok: true;
  changes: number | string;
  lastInsertRowid: number | string;
  durationMs: number;
}

export interface A20sDbClientLike {
  health(): Promise<A20sHealthResponse>;
  listDatabases(): Promise<{ databases: A20sDatabaseInfo[] }>;
  query<T>(sql: string, params?: unknown[]): Promise<A20sQueryResponse<T>>;
  execute(sql: string, params?: unknown[]): Promise<A20sExecuteResponse>;
  script(sql: string): Promise<{ ok: true; durationMs: number }>;
}

export class A20sDbClient implements A20sDbClientLike {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly database: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: A20sDbClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
    this.database = options.database;
    this.timeoutMs = options.timeoutMs ?? 3000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async health(): Promise<A20sHealthResponse> {
    return this.request<A20sHealthResponse>("/health", { authenticated: false });
  }

  async listDatabases(): Promise<{ databases: A20sDatabaseInfo[] }> {
    return this.request<{ databases: A20sDatabaseInfo[] }>("/v1/databases", {
      authenticated: true,
    });
  }

  async query<T>(
    sql: string,
    params: unknown[] = [],
  ): Promise<A20sQueryResponse<T>> {
    return this.request<A20sQueryResponse<T>>(
      `/v1/${encodeURIComponent(this.database)}/query`,
      {
        authenticated: true,
        init: {
          method: "POST",
          body: JSON.stringify({ sql, params }),
        },
      },
    );
  }

  async execute(
    sql: string,
    params: unknown[] = [],
  ): Promise<A20sExecuteResponse> {
    return this.request<A20sExecuteResponse>(
      `/v1/${encodeURIComponent(this.database)}/execute`,
      {
        authenticated: true,
        init: {
          method: "POST",
          body: JSON.stringify({ sql, params }),
        },
      },
    );
  }

  async script(sql: string): Promise<{ ok: true; durationMs: number }> {
    return this.request<{ ok: true; durationMs: number }>(
      `/v1/${encodeURIComponent(this.database)}/script`,
      {
        authenticated: true,
        init: {
          method: "POST",
          body: JSON.stringify({ sql }),
        },
      },
    );
  }

  private async request<T>(
    path: string,
    options: { authenticated: boolean; init?: RequestInit },
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...options.init,
        signal: controller.signal,
        headers: {
          ...(options.authenticated ? { Authorization: `Bearer ${this.token}` } : {}),
          ...(options.init?.body ? { "Content-Type": "application/json" } : {}),
          ...options.init?.headers,
        },
      });
      const text = await response.text();
      const payload = text ? safeJsonParse(text) : null;

      if (!response.ok) {
        const message =
          typeof payload?.error === "string"
            ? payload.error
            : `A20s DB API HTTP ${response.status}`;
        throw new AppError(
          response.status === 401 || response.status === 403
            ? "A3-SYNC-002"
            : "A3-SYNC-001",
          sanitizeRemoteMessage(message),
        );
      }

      return payload as T;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      const aborted =
        error instanceof Error && error.name === "AbortError"
          ? "Tempo limite excedido ao conectar ao A20s."
          : "Servidor A20s indisponível.";
      throw new AppError("A3-SYNC-001", aborted);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function safeJsonParse(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function sanitizeRemoteMessage(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/token["']?\s*[:=]\s*["']?[^"',\s}]+/gi, "token=[REDACTED]");
}
