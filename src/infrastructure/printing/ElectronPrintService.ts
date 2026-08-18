import fs from "node:fs";
import path from "node:path";
import { BrowserWindow, dialog } from "electron";
import { AppError } from "../../domain/appError";
import type { RentalDetail } from "../../domain/types";
import type { RentalPrintOrigin } from "../../shared/contracts";
import type { FileLogger } from "../logging/FileLogger";
import {
  selectRentalPrintLayout,
  shouldTryCompactLayout,
  type PrintLayoutMeasurement,
  type RentalPrintLayoutMode,
} from "./printLayoutStrategy";
import { renderRentalDocumentHtml } from "./rentalDocument";

type PrintLogger = Pick<FileLogger, "info" | "error">;

const INTERACTIVE_PRINT_TIMEOUT_MS = 120_000;
const PRINT_ERROR_CODES = [
  "A3-PRINT-001",
  "A3-PRINT-002",
  "A3-PRINT-003",
  "A3-PRINT-004",
  "A3-PRINT-005",
] as const;

type PrintAppErrorCode = (typeof PRINT_ERROR_CODES)[number];

interface PrintOptions {
  origin?: RentalPrintOrigin;
  ownerWindow?: BrowserWindow | null;
}

interface ElectronPrintServiceOptions {
  interactivePrintMethod?: "webContents" | "windowPrint";
  interactivePrintTimeoutMs?: number;
}

interface PrintLogContext {
  origin: RentalPrintOrigin;
  rentalId: string;
  rentalCode: string;
}

interface PreparedPrintWindow {
  window: BrowserWindow;
  layoutMode: RentalPrintLayoutMode;
  normalMeasurement: PrintLayoutMeasurement;
  compactMeasurement?: PrintLayoutMeasurement;
}

interface DocumentWindowOptions {
  parentWindow?: BrowserWindow | null;
}

interface PrintCallbackResult {
  callbackElapsedMs: number;
}

export class ElectronPrintService {
  private interactivePrintActive = false;

  constructor(
    private readonly logger?: PrintLogger | null,
    private readonly serviceOptions: ElectronPrintServiceOptions = {},
  ) {}

  async savePdf(rental: RentalDetail): Promise<string | null> {
    const result = await dialog.showSaveDialog({
      title: "Salvar contrato de locação",
      defaultPath: `${sanitizeFileName(rental.code)}.pdf`,
      filters: [{ name: "PDF", extensions: ["pdf"] }]
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    return this.savePdfToPath(rental, result.filePath);
  }

  async savePdfToPath(rental: RentalDetail, filePath: string): Promise<string> {
    try {
      const pdf = await this.renderPdf(rental);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, pdf);
      return filePath;
    } catch (error) {
      const appError = toPrintAppError(error, "A3-PRINT-003");
      this.logger?.error("pdf_failed", appError, {
        code: "A3-PRINT-003",
        rentalId: rental.id,
        rentalCode: rental.code,
      });
      throw new AppError(
        "A3-PRINT-003",
        "Não foi possível gerar o PDF da locação.",
      );
    }
  }

  async print(rental: RentalDetail, options: PrintOptions = {}): Promise<void> {
    const context = buildPrintContext(rental, options.origin ?? "report");
    const startedAt = Date.now();
    let prepared: PreparedPrintWindow | null = null;
    if (this.interactivePrintActive) {
      throw new AppError(
        "A3-PRINT-002",
        "Já existe uma impressão em andamento.",
      );
    }

    this.interactivePrintActive = true;
    this.logger?.info("print_started", { ...context });

    try {
      prepared = await createAdaptiveDocumentWindow(rental);
      this.logger?.info("print_prepared", {
        ...context,
        layoutMode: prepared.layoutMode,
        normalMeasurement: prepared.normalMeasurement,
        compactMeasurement: prepared.compactMeasurement,
        preparationElapsedMs: elapsedSince(startedAt),
      });
      const interactiveWindow = await createVisibleDocumentWindow(
        rental,
        prepared.layoutMode,
        options.ownerWindow,
      );
      destroyPrintWindow(prepared.window);
      prepared = {
        ...prepared,
        window: interactiveWindow,
      };
      focusInteractivePrintWindow(prepared.window, options.ownerWindow);
      const callbackResult = await this.invokeInteractivePrint(
        prepared,
        context,
        startedAt,
      );
      this.logger?.info("print_completed", {
        ...context,
        layoutMode: prepared.layoutMode,
        callbackElapsedMs: callbackResult.callbackElapsedMs,
        totalElapsedMs: elapsedSince(startedAt),
      });
    } catch (error) {
      const appError = toPrintAppError(error, "A3-PRINT-002");
      this.logger?.error("print_failed", appError, {
        ...context,
        code: appError.code,
        totalElapsedMs: elapsedSince(startedAt),
      });
      throw new AppError(appError.code, printUserMessage(appError));
    } finally {
      this.interactivePrintActive = false;
      destroyPrintWindow(prepared?.window);
    }
  }

  private async renderPdf(rental: RentalDetail): Promise<Buffer> {
    const prepared = await createAdaptiveDocumentWindow(rental);
    try {
      return await prepared.window.webContents.printToPDF({
        pageSize: "A4",
        printBackground: true,
        margins: {
          marginType: "none"
        }
      });
    } finally {
      destroyPrintWindow(prepared.window);
    }
  }

  private async invokeInteractivePrint(
    prepared: PreparedPrintWindow,
    context: PrintLogContext,
    startedAt: number,
  ): Promise<PrintCallbackResult> {
    const timeoutMs = this.resolveInteractivePrintTimeoutMs();
    const printerDiagnostics = await readPrinterDiagnostics(prepared.window);
    const method = this.resolveInteractivePrintMethod();

    this.logger?.info("print_invoking", {
      ...context,
      layoutMode: prepared.layoutMode,
      method,
      timeoutMs,
      totalElapsedMs: elapsedSince(startedAt),
      ...printerDiagnostics,
    });

    if (method === "windowPrint") {
      return this.invokeWindowPrint(prepared, context, timeoutMs);
    }

    return this.invokeWebContentsPrint(prepared, context, timeoutMs);
  }

  private async invokeWebContentsPrint(
    prepared: PreparedPrintWindow,
    context: PrintLogContext,
    timeoutMs: number,
  ): Promise<PrintCallbackResult> {
    const printStartedAt = Date.now();

    return new Promise<PrintCallbackResult>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        finish(() => {
          reject(
            new AppError(
              "A3-PRINT-005",
              `webContents.print não retornou callback em ${timeoutMs}ms.`,
            ),
          );
        });
      }, timeoutMs);
      unrefTimeout(timeout);

      function finish(settle: () => void): void {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        settle();
      }

      try {
        prepared.window.webContents.print(
          { printBackground: true, silent: false },
          (success, failureReason) => {
            const callbackElapsedMs = elapsedSince(printStartedAt);
            const late = settled;
            this.logger?.info("print_callback", {
              ...context,
              layoutMode: prepared.layoutMode,
              success,
              failureReason: failureReason || undefined,
              callbackElapsedMs,
              late: late || undefined,
            });
            finish(() => {
              if (success) {
                resolve({ callbackElapsedMs });
                return;
              }
              reject(toPrintFailureError(failureReason));
            });
          },
        );
      } catch (error) {
        finish(() => {
          reject(toPrintAppError(error, "A3-PRINT-002"));
        });
      }
    });
  }

  private async invokeWindowPrint(
    prepared: PreparedPrintWindow,
    context: PrintLogContext,
    timeoutMs: number,
  ): Promise<PrintCallbackResult> {
    const printStartedAt = Date.now();

    return new Promise<PrintCallbackResult>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        finish(() => {
          reject(
            new AppError(
              "A3-PRINT-005",
              `window.print não retornou afterprint em ${timeoutMs}ms.`,
            ),
          );
        });
      }, timeoutMs);
      unrefTimeout(timeout);

      function finish(settle: () => void): void {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        settle();
      }

      prepared.window.webContents
        .executeJavaScript(
          `(() => new Promise((resolve, reject) => {
            const startedAt = Date.now();
            let settled = false;
            const finish = () => {
              if (settled) {
                return;
              }
              settled = true;
              window.removeEventListener("afterprint", finish);
              resolve({ callbackElapsedMs: Date.now() - startedAt });
            };
            window.addEventListener("afterprint", finish, { once: true });
            try {
              window.focus();
              window.print();
            } catch (error) {
              window.removeEventListener("afterprint", finish);
              reject(error);
            }
          }))()`,
          true,
        )
        .then((result) => {
          const callbackElapsedMs =
            typeof result === "object" &&
            result !== null &&
            "callbackElapsedMs" in result &&
            typeof result.callbackElapsedMs === "number"
              ? result.callbackElapsedMs
              : elapsedSince(printStartedAt);
          const late = settled;
          this.logger?.info("print_callback", {
            ...context,
            layoutMode: prepared.layoutMode,
            source: "window.afterprint",
            success: true,
            callbackElapsedMs,
            late: late || undefined,
          });
          finish(() => resolve({ callbackElapsedMs }));
        })
        .catch((error: unknown) => {
          finish(() => {
            reject(toPrintAppError(error, "A3-PRINT-002"));
          });
        });
    });
  }

  private resolveInteractivePrintTimeoutMs(): number {
    return Math.max(
      1,
      this.serviceOptions.interactivePrintTimeoutMs ??
        INTERACTIVE_PRINT_TIMEOUT_MS,
    );
  }

  private resolveInteractivePrintMethod(): "webContents" | "windowPrint" {
    return (
      this.serviceOptions.interactivePrintMethod ??
      (process.platform === "win32" ? "windowPrint" : "webContents")
    );
  }
}

async function createAdaptiveDocumentWindow(
  rental: RentalDetail,
  options: DocumentWindowOptions = {},
): Promise<PreparedPrintWindow> {
  let normalWindow: BrowserWindow | null = null;
  let compactWindow: BrowserWindow | null = null;

  try {
    normalWindow = await createHiddenDocumentWindow(
      rental,
      "NORMAL",
      options.parentWindow,
    );
    const normalMeasurement = await safeMeasurePrintLayout(normalWindow);

    if (!shouldTryCompactLayout(normalMeasurement)) {
      const selectedWindow = normalWindow;
      normalWindow = null;
      return {
        window: selectedWindow,
        layoutMode: "NORMAL",
        normalMeasurement,
      };
    }

    compactWindow = await createHiddenDocumentWindow(
      rental,
      "COMPACT",
      options.parentWindow,
    );
    const compactMeasurement = await safeMeasurePrintLayout(compactWindow);
    const selectedMode = selectRentalPrintLayout(
      normalMeasurement,
      compactMeasurement,
    );

    if (selectedMode === "COMPACT") {
      destroyPrintWindow(normalWindow);
      normalWindow = null;
      const selectedWindow = compactWindow;
      compactWindow = null;
      return {
        window: selectedWindow,
        layoutMode: "COMPACT",
        normalMeasurement,
        compactMeasurement,
      };
    }

    destroyPrintWindow(compactWindow);
    compactWindow = null;
    const selectedWindow = normalWindow;
    normalWindow = null;
    return {
      window: selectedWindow,
      layoutMode: "NORMAL",
      normalMeasurement,
      compactMeasurement,
    };
  } catch (error) {
    destroyPrintWindow(normalWindow);
    destroyPrintWindow(compactWindow);
    throw error;
  }
}

async function createHiddenDocumentWindow(
  rental: RentalDetail,
  layoutMode: RentalPrintLayoutMode,
  parentWindow?: BrowserWindow | null,
): Promise<BrowserWindow> {
  let window: BrowserWindow | null = null;
  const html = renderDocumentHtml(rental, layoutMode);
  try {
    window = new BrowserWindow({
      height: 1123,
      show: false,
      skipTaskbar: true,
      parent:
        parentWindow && !parentWindow.isDestroyed() ? parentWindow : undefined,
      title: "Contrato de locação",
      width: 794,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    await loadDocumentHtml(window, html);
    return window;
  } catch (error) {
    destroyPrintWindow(window);
    throw toPrintAppError(error, "A3-PRINT-004");
  }
}

async function createVisibleDocumentWindow(
  rental: RentalDetail,
  layoutMode: RentalPrintLayoutMode,
  parentWindow?: BrowserWindow | null,
): Promise<BrowserWindow> {
  let window: BrowserWindow | null = null;
  const html = renderDocumentHtml(rental, layoutMode);
  try {
    window = new BrowserWindow({
      height: 1123,
      parent:
        parentWindow && !parentWindow.isDestroyed() ? parentWindow : undefined,
      show: true,
      title: "Contrato de locação",
      width: 794,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    await loadDocumentHtml(window, html);
    window.show();
    window.focus();
    return window;
  } catch (error) {
    destroyPrintWindow(window);
    throw toPrintAppError(error, "A3-PRINT-004");
  }
}

function focusInteractivePrintWindow(
  printWindow: BrowserWindow,
  ownerWindow?: BrowserWindow | null,
): void {
  if (ownerWindow && !ownerWindow.isDestroyed()) {
    if (ownerWindow.isMinimized()) {
      ownerWindow.restore();
    }
    if (!ownerWindow.isVisible()) {
      ownerWindow.show();
    }
    ownerWindow.focus();
  }

  if (!printWindow.isVisible()) {
    printWindow.show();
  }
  printWindow.focus();
}

function renderDocumentHtml(
  rental: RentalDetail,
  layoutMode: RentalPrintLayoutMode,
): string {
  try {
    return renderRentalDocumentHtml(rental, layoutMode);
  } catch (error) {
    throw toPrintAppError(error, "A3-PRINT-001");
  }
}

async function loadDocumentHtml(
  window: BrowserWindow,
  html: string,
): Promise<void> {
  await window.loadURL("about:blank");
  await window.webContents.executeJavaScript(
    `(() => {
      document.open();
      document.write(${JSON.stringify(html)});
      document.close();
      return true;
    })()`,
    true,
  );
}

async function safeMeasurePrintLayout(
  window: BrowserWindow,
): Promise<PrintLayoutMeasurement> {
  try {
    return await measurePrintLayout(window);
  } catch (error) {
    throw toPrintAppError(error, "A3-PRINT-001");
  }
}

async function measurePrintLayout(
  window: BrowserWindow,
): Promise<PrintLayoutMeasurement> {
  return window.webContents.executeJavaScript(
    `(() => {
      const cssPxPerMm = 96 / 25.4;
      const pageHeight = 297 * cssPxPerMm;
      const marginValue = getComputedStyle(document.documentElement)
        .getPropertyValue("--page-margin")
        .trim();
      const marginMm = Number.parseFloat(marginValue) || 12;
      const main = document.querySelector("main");
      const contentHeight = Math.ceil(
        main ? main.getBoundingClientRect().height : document.documentElement.scrollHeight
      );
      return {
        contentHeight,
        usablePageHeight: Math.floor(pageHeight - marginMm * 2 * cssPxPerMm)
      };
    })()`,
    true,
  ) as Promise<PrintLayoutMeasurement>;
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "-");
}

async function readPrinterDiagnostics(
  window: BrowserWindow,
): Promise<Record<string, unknown>> {
  try {
    const printers = await window.webContents.getPrintersAsync();
    const defaultPrinter = printers.find((printer) => printer.isDefault);
    return {
      printerCount: printers.length,
      hasDefaultPrinter: Boolean(defaultPrinter),
    };
  } catch (error) {
    return {
      printerDiagnosticsUnavailable: true,
      printerDiagnosticsMessage:
        error instanceof Error ? error.message : String(error),
    };
  }
}

function buildPrintContext(
  rental: RentalDetail,
  origin: RentalPrintOrigin,
): PrintLogContext {
  return {
    origin,
    rentalId: rental.id,
    rentalCode: rental.code,
  };
}

function toPrintAppError(
  error: unknown,
  fallbackCode: PrintAppErrorCode,
): AppError {
  if (
    error instanceof AppError &&
    PRINT_ERROR_CODES.includes(
      error.code as PrintAppErrorCode,
    )
  ) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new AppError(fallbackCode, message);
}

function toPrintFailureError(failureReason?: string): AppError {
  return new AppError(
    "A3-PRINT-002",
    failureReason || "webContents.print retornou falha sem motivo informado.",
  );
}

function printUserMessage(error: AppError): string {
  if (error.code === "A3-PRINT-001" || error.code === "A3-PRINT-004") {
    return "Não foi possível preparar a impressão da locação.";
  }
  if (error.code === "A3-PRINT-005") {
    return "A impressão demorou demais para responder.";
  }
  if (isPrintCancellationReason(error.message)) {
    return "Impressão cancelada.";
  }
  if (isInvalidPrinterSettingsReason(error.message)) {
    return "Configuração da impressora inválida. Verifique a impressora selecionada e tente novamente.";
  }
  return "Não foi possível imprimir a locação.";
}

function isPrintCancellationReason(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("cancel") ||
    normalized.includes("cancelado") ||
    normalized.includes("cancelada")
  );
}

function isInvalidPrinterSettingsReason(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("invalid printer settings") ||
    normalized.includes("configuração da impressora inválida") ||
    normalized.includes("configurações de impressora inválidas")
  );
}

function destroyPrintWindow(window?: BrowserWindow | null): void {
  if (window && !window.isDestroyed()) {
    window.destroy();
  }
}

function elapsedSince(startedAt: number): number {
  return Date.now() - startedAt;
}

function unrefTimeout(timeout: ReturnType<typeof setTimeout>): void {
  if (typeof timeout === "object" && "unref" in timeout) {
    timeout.unref();
  }
}
