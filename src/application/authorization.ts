import { AppError } from "../domain/appError";
import type { User } from "../domain/types";

export type AdminOnlyOperation =
  | "user-management"
  | "server-configuration";

export function assertAdminOperationAllowed(
  user: Pick<User, "role">,
  _operation: AdminOnlyOperation,
): void {
  if (user.role !== "ADMIN") {
    throw new AppError(
      "AUTH_FORBIDDEN",
      "Apenas administradores podem executar esta a\u00e7\u00e3o.",
    );
  }
}
