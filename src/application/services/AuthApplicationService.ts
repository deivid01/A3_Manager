import { AppError } from "../../domain/appError";
import { normalizeUsername } from "../../domain/normalization";
import type { User } from "../../domain/types";
import type { SqlJsDatabase } from "../../infrastructure/database/SqlJsDatabase";
import {
  loginSchema,
  userInputSchema,
  userUpdateInputSchema,
  type LoginInput,
  type UserInput,
  type UserUpdateInput,
} from "../../shared/contracts";
import { mapUser } from "../rowMappers";
import { hashPassword, verifyPassword } from "../security";
import { systemUser } from "../seeders";
import {
  duplicateOrDatabaseError,
  mustFind,
  parseInput,
} from "../serviceHelpers";
import { createId } from "../ids";

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
    const id = createId();
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

  async updateUser(
    id: string,
    input: UserUpdateInput,
    actorUserId: string,
  ): Promise<User> {
    const data = parseInput(userUpdateInputSchema, input);
    const username = normalizeUsername(data.username);
    const passwordHash = data.password ? await hashPassword(data.password) : null;

    return this.db.transaction(() => {
      const current = mapUser(mustFind(this.db, "users", id));
      const actor = mapUser(mustFind(this.db, "users", actorUserId));
      this.assertSystemUserEditAllowed(current, actor, data);
      this.assertKeepsActiveAdmin(current, data.role, data.active);

      try {
        if (passwordHash) {
          this.db.execute(
            `UPDATE users
             SET username = ?, username_normalized = ?, password_hash = ?,
                 role = ?, active = ?, updated_at = ?
             WHERE id = ?`,
            [
              username,
              username,
              passwordHash,
              data.role,
              data.active ? 1 : 0,
              new Date().toISOString(),
              id,
            ],
          );
        } else {
          this.db.execute(
            `UPDATE users
             SET username = ?, username_normalized = ?, role = ?,
                 active = ?, updated_at = ?
             WHERE id = ?`,
            [
              username,
              username,
              data.role,
              data.active ? 1 : 0,
              new Date().toISOString(),
              id,
            ],
          );
        }
      } catch (error) {
        throw duplicateOrDatabaseError(
          error,
          "Já existe um usuário com esse nome.",
        );
      }

      return mapUser(mustFind(this.db, "users", id));
    });
  }

  private assertSystemUserEditAllowed(
    current: User,
    actor: User,
    next: Pick<UserUpdateInput, "username" | "role" | "active">,
  ): void {
    if (!isSystemUser(current)) {
      return;
    }

    if (actor.id !== current.id) {
      throw new AppError(
        "AUTH_FORBIDDEN",
        "Somente o próprio SYSTEM DEV pode editar esta conta.",
      );
    }

    const username = normalizeUsername(next.username);
    if (
      username !== systemUsername ||
      next.role !== current.role ||
      next.active !== current.active
    ) {
      throw new AppError(
        "AUTH_FORBIDDEN",
        "A conta SYSTEM DEV permite apenas alterar a própria senha.",
      );
    }
  }

  private assertKeepsActiveAdmin(
    current: User,
    nextRole: User["role"],
    nextActive: boolean,
  ): void {
    if (!current.active || current.role !== "ADMIN") {
      return;
    }
    if (nextRole === "ADMIN" && nextActive) {
      return;
    }

    const row = this.db.queryOne(
      "SELECT COUNT(*) AS total FROM users WHERE role = 'ADMIN' AND active = 1",
    );
    if (Number(row?.total ?? 0) <= 1) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Não é possível deixar o sistema sem um administrador ativo.",
      );
    }
  }
}

const systemUsername = normalizeUsername(systemUser.username);

function isSystemUser(user: Pick<User, "username">): boolean {
  return normalizeUsername(user.username) === systemUsername;
}
