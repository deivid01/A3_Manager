export type AppErrorCode =
  | "AUTH_INVALID"
  | "AUTH_FORBIDDEN"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "DUPLICATE"
  | "INSUFFICIENT_STOCK"
  | "RENTAL_ALREADY_FINALIZED"
  | "DATABASE_ERROR"
  | "PDF_ERROR";

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
