export type AppErrorCode =
  | "AUTH_INVALID"
  | "AUTH_FORBIDDEN"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "DUPLICATE"
  | "INSUFFICIENT_STOCK"
  | "RENTAL_ALREADY_FINALIZED"
  | "DATABASE_ERROR"
  | "PDF_ERROR"
  | "A3-PRINT-001"
  | "A3-PRINT-002"
  | "A3-PRINT-003"
  | "A3-PRINT-004"
  | "A3-PRINT-005"
  | "A3-SYNC-001"
  | "A3-SYNC-002"
  | "A3-SYNC-003"
  | "A3-SYNC-004"
  | "A3-SYNC-005"
  | "A3-SYNC-006"
  | "A3-SYNC-007"
  | "A3-SYNC-008"
  | "A3-SYNC-009";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function toSafeError(error: unknown): { code: AppErrorCode; message: string } {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message };
  }

  return {
    code: "DATABASE_ERROR",
    message: "Não foi possível concluir a operação. Tente novamente ou consulte o suporte técnico."
  };
}
