import { randomUUID } from "node:crypto";
import { AppError } from "../../domain/appError";
import { normalizeUsername } from "../../domain/normalization";
import type { User } from "../../domain/types";
import type { SqlJsDatabase } from "../../infrastructure/database/SqlJsDatabase";
import {
  loginSchema,
  userInputSchema,
  type LoginInput,
  type UserInput,
} from "../../shared/contracts";
import { mapUser } from "../rowMappers";
import { hashPassword, verifyPassword } from "../security";
import { systemUser } from "../seeders";
import {
  duplicateOrDatabaseError,
  mustFind,
  parseInput,
} from "../serviceHelpers";

export class AuthApplicationService {
  constructor(private readonly db: SqlJsDatabase) {}

  async initialize(): Promise<void> {
    const row = this.db.queryOne(
      "SELECT COUNT(*) AS total FROM users WHERE role = 'ADMIN'",
    );
    if (Number(row?.total ?? 0) === 0) {
      await this.createUser(systemUser);
    }
  }

  async login(input: LoginInput): Promise<User> {
    const data = parseInput(loginSchema, input);
    const usernameNormalized = normalizeUsername(data.username);
    const row = this.db.queryOne(
      "SELECT * FROM users WHERE username_normalized = ? AND active = 1 LIMIT 1",
      [usernameNormalized],
    );

    if (!row || typeof row.password_hash !== "string") {
      throw new AppError("AUTH_INVALID", "Usuário ou senha inválidos.");
    }

    if (!(await verifyPassword(data.password, row.password_hash))) {
      throw new AppError("AUTH_INVALID", "Usuário ou senha inválidos.");
    }
    return mapUser(row);
  }

  listUsers(): User[] {
    return this.db
      .queryAll("SELECT * FROM users ORDER BY username_normalized ASC")
      .map(mapUser);
  }

  async createUser(input: UserInput): Promise<User> {
    const data = parseInput(userInputSchema, input);
    const now = new Date().toISOString();
    const id = randomUUID();
    const username = normalizeUsername(data.username);
    const passwordHash = await hashPassword(data.password);

    try {
      this.db.execute(
        `INSERT INTO users
          (id, username, username_normalized, password_hash, role, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
        [id, username, username, passwordHash, data.role, now, now],
      );
    } catch (error) {
      throw duplicateOrDatabaseError(
        error,
        "Já existe um usuário com esse nome.",
      );
    }
    return mapUser(mustFind(this.db, "users", id));
  }
}
