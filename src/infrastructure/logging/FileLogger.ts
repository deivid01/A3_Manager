import fs from "node:fs";
import path from "node:path";

type LogLevel = "info" | "error";

const seedPasswordPattern = new RegExp(["_", "int", "@", "383"].join(""), "g");
const databaseUrlPattern = new RegExp(`${["DATABASE", "_URL"].join("")}=([^\\s]+)`, "gi");
const postgresUrlPattern = new RegExp("postgres(?:ql)?://[^\\s\"']+", "gi");

export class FileLogger {
  constructor(private readonly logPath: string) {}

  static open(userDataPath: string): FileLogger {
    const logsDir = path.join(userDataPath, "logs");
    fs.mkdirSync(logsDir, { recursive: true });
    return new FileLogger(path.join(logsDir, "a3-manager.log.jsonl"));
  }

  info(event: string, details: Record<string, unknown> = {}): void {
    this.write("info", event, details);
  }

  error(event: string, error: unknown, details: Record<string, unknown> = {}): void {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : "";
    this.write("error", event, {
      ...details,
      message: sanitizeLogMessage(message),
      stack: stack ? sanitizeLogMessage(stack) : undefined
    });
  }

  private write(level: LogLevel, event: string, details: Record<string, unknown>): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      details
    };
    fs.appendFileSync(this.logPath, `${JSON.stringify(entry)}\n`, "utf8");
  }
}

export function sanitizeLogMessage(value: string): string {
  return value
    .replace(seedPasswordPattern, "[REDACTED]")
    .replace(databaseUrlPattern, "database-url=[REDACTED]")
    .replace(postgresUrlPattern, "database-url=[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/token["']?\s*[:=]\s*["']?[^"',\s}]+/gi, "token=[REDACTED]")
    .replace(/password["']?\s*[:=]\s*["']?[^"',\s}]+/gi, "password=[REDACTED]")
    .replace(/senha["']?\s*[:=]\s*["']?[^"',\s}]+/gi, "senha=[REDACTED]");
}
