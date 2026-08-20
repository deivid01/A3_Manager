import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import type { RentalDetail } from "../src/domain/types";
import { ElectronPrintService } from "../src/infrastructure/printing/ElectronPrintService";
import { createTestService, validCustomer, validEquipment } from "./helpers";

type PrintCallback = (success: boolean, failureReason?: string) => void;

const electronMock = vi.hoisted(() => ({
  constructorOptions: [] as unknown[],
  destroy: vi.fn(),
  executeJavaScript: vi.fn(),
  focus: vi.fn(),
  getPrintersAsync: vi.fn(),
  isMinimized: vi.fn(),
  isDestroyed: vi.fn(),
  isVisible: vi.fn(),
  loadURL: vi.fn(),
  print: vi.fn(),
  printToPDF: vi.fn(),
  restore: vi.fn(),
  show: vi.fn(),
  showSaveDialog: vi.fn(),
}));

vi.mock("electron", () => ({
  BrowserWindow: class {
    constructor(options: unknown) {
      electronMock.constructorOptions.push(options);
    }

    readonly webContents = {
      executeJavaScript: electronMock.executeJavaScript,
      getPrintersAsync: electronMock.getPrintersAsync,
      print: electronMock.print,
      printToPDF: electronMock.printToPDF,
    };

    destroy(): void {
      electronMock.destroy();
    }

    isDestroyed(): boolean {
      return electronMock.isDestroyed();
    }

    isMinimized(): boolean {
      return electronMock.isMinimized();
    }

    isVisible(): boolean {
      return electronMock.isVisible();
    }

    focus(): void {
      electronMock.focus();
    }

    loadURL(url: string): Promise<void> {
      return electronMock.loadURL(url);
    }

    restore(): void {
      electronMock.restore();
    }

    show(): void {
      electronMock.show();
    }
  },
  dialog: {
    showSaveDialog: electronMock.showSaveDialog,
  },
}));

describe("serviço de impressão Electron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    electronMock.constructorOptions.length = 0;
    electronMock.isDestroyed.mockReturnValue(false);
    electronMock.isMinimized.mockReturnValue(false);
    electronMock.isVisible.mockReturnValue(true);
    electronMock.loadURL.mockResolvedValue(undefined);
    electronMock.executeJavaScript.mockResolvedValue({
      contentHeight: 400,
      usablePageHeight: 1000,
    });
    electronMock.getPrintersAsync.mockResolvedValue([{ isDefault: true }]);
    electronMock.printToPDF.mockResolvedValue(Buffer.from("pdf"));
  });

  it("registra início, preparo, invocação, callback e conclusão com origem do lançamento", async () => {
    const rental = await createRentalDetail();
    const logger = new FakePrintLogger();
    const ownerWindow = createOwnerWindow();
    electronMock.print.mockImplementation(
      (_options: unknown, callback: PrintCallback) => callback(true),
    );

    await new ElectronPrintService(logger, {
      interactivePrintMethod: "webContents",
    }).print(rental, {
      origin: "launch",
      ownerWindow,
    });

    expect(logger.infos.map((entry) => entry.event)).toEqual([
      "print_started",
      "print_prepared",
      "print_invoking",
      "print_callback",
      "print_completed",
    ]);
    expect(logger.infos[0]?.details).toMatchObject({
      origin: "launch",
      rentalId: rental.id,
      rentalCode: rental.code,
    });
    expect(logger.infos[2]?.details).toMatchObject({
      method: "webContents",
      printerCount: 1,
      hasDefaultPrinter: true,
      timeoutMs: 120_000,
    });
    expect(logger.infos[3]?.details).toMatchObject({
      success: true,
      callbackElapsedMs: expect.any(Number),
    });
    expect(electronMock.print).toHaveBeenCalledTimes(1);
    expect(electronMock.show).toHaveBeenCalledTimes(1);
    expect(electronMock.focus).toHaveBeenCalledTimes(2);
    expect(ownerWindow.focus).toHaveBeenCalledTimes(1);
    expect(electronMock.constructorOptions[0]).toMatchObject({
      show: false,
      skipTaskbar: true,
    });
    expect(electronMock.constructorOptions[1]).toMatchObject({
      show: true,
      parent: ownerWindow,
    });
    expect(electronMock.destroy).toHaveBeenCalledTimes(2);
  });

  it("registra callback falso como A3-PRINT-002 e devolve mensagem curta", async () => {
    const rental = await createRentalDetail();
    const logger = new FakePrintLogger();
    electronMock.print.mockImplementation(
      (_options: unknown, callback: PrintCallback) =>
        callback(false, "spooler indisponível"),
    );

    await expect(
      new ElectronPrintService(logger, {
        interactivePrintMethod: "webContents",
      }).print(rental, { origin: "report" }),
    ).rejects.toMatchObject({
      code: "A3-PRINT-002",
      message: "Não foi possível imprimir a locação.",
    });

    expect(logger.infos.map((entry) => entry.event)).toEqual([
      "print_started",
      "print_prepared",
      "print_invoking",
      "print_callback",
    ]);
    expect(logger.errors[0]).toMatchObject({
      event: "print_failed",
      details: {
        origin: "report",
        rentalId: rental.id,
        rentalCode: rental.code,
        code: "A3-PRINT-002",
      },
    });
    expect(electronMock.destroy).toHaveBeenCalledTimes(2);
  });

  it("trata cancelamento do diálogo sem deixar loading pendente", async () => {
    const rental = await createRentalDetail();
    const logger = new FakePrintLogger();
    electronMock.print.mockImplementation(
      (_options: unknown, callback: PrintCallback) =>
        callback(false, "cancelled"),
    );

    await expect(
      new ElectronPrintService(logger, {
        interactivePrintMethod: "webContents",
      }).print(rental, { origin: "report" }),
    ).rejects.toMatchObject({
      code: "A3-PRINT-002",
      message: "Impressão cancelada.",
    });

    expect(logger.infos.map((entry) => entry.event)).toEqual([
      "print_started",
      "print_prepared",
      "print_invoking",
      "print_callback",
    ]);
    expect(logger.errors[0]?.details).toMatchObject({
      origin: "report",
      code: "A3-PRINT-002",
    });
    expect(electronMock.destroy).toHaveBeenCalledTimes(2);
  });

  it("trata erro síncrono de configuração de impressora", async () => {
    const rental = await createRentalDetail();
    const logger = new FakePrintLogger();
    electronMock.print.mockImplementation(() => {
      throw new Error("Invalid printer settings");
    });

    await expect(
      new ElectronPrintService(logger, {
        interactivePrintMethod: "webContents",
      }).print(rental, { origin: "report" }),
    ).rejects.toMatchObject({
      code: "A3-PRINT-002",
      message:
        "Configuração da impressora inválida. Verifique a impressora selecionada e tente novamente.",
    });

    expect(logger.errors[0]?.details).toMatchObject({
      origin: "report",
      code: "A3-PRINT-002",
    });
    expect(electronMock.destroy).toHaveBeenCalledTimes(2);
  });

  it("rejeita com A3-PRINT-005 quando o callback de impressão não retorna", async () => {
    const rental = await createRentalDetail();
    const logger = new FakePrintLogger();
    electronMock.print.mockImplementation(() => undefined);

    const result = await settleWithin(
      new ElectronPrintService(logger, {
        interactivePrintMethod: "webContents",
        interactivePrintTimeoutMs: 10,
      }).print(rental, { origin: "report" }),
      100,
    );

    expect(result).toMatchObject({
      state: "rejected",
      error: {
        code: "A3-PRINT-005",
        message: "A impressão demorou demais para responder.",
      },
    });
    expect(logger.infos.map((entry) => entry.event)).toEqual([
      "print_started",
      "print_prepared",
      "print_invoking",
    ]);
    expect(logger.errors[0]?.details).toMatchObject({
      origin: "report",
      code: "A3-PRINT-005",
    });
    expect(electronMock.destroy).toHaveBeenCalledTimes(2);
  });

  it("usa window.print com afterprint no fluxo interativo do Windows", async () => {
    const rental = await createRentalDetail();
    const logger = new FakePrintLogger();
    electronMock.executeJavaScript.mockImplementation((script: string) => {
      if (script.includes("window.print")) {
        return Promise.resolve({ callbackElapsedMs: 8 });
      }
      if (script.includes("document.open")) {
        return Promise.resolve(true);
      }
      return Promise.resolve({
        contentHeight: 400,
        usablePageHeight: 1000,
      });
    });

    await new ElectronPrintService(logger, {
      interactivePrintMethod: "windowPrint",
    }).print(rental, { origin: "launch" });

    expect(electronMock.print).not.toHaveBeenCalled();
    expect(logger.infos.map((entry) => entry.event)).toEqual([
      "print_started",
      "print_prepared",
      "print_invoking",
      "print_callback",
      "print_completed",
    ]);
    expect(logger.infos[2]?.details).toMatchObject({
      method: "windowPrint",
      printerCount: 1,
      hasDefaultPrinter: true,
    });
    expect(logger.infos[3]?.details).toMatchObject({
      source: "window.afterprint",
      success: true,
      callbackElapsedMs: 8,
    });
    expect(electronMock.destroy).toHaveBeenCalledTimes(2);
  });

  it("rejeita com A3-PRINT-005 quando window.print não retorna afterprint", async () => {
    const rental = await createRentalDetail();
    const logger = new FakePrintLogger();
    electronMock.executeJavaScript.mockImplementation((script: string) => {
      if (script.includes("window.print")) {
        return new Promise(() => undefined);
      }
      if (script.includes("document.open")) {
        return Promise.resolve(true);
      }
      return Promise.resolve({
        contentHeight: 400,
        usablePageHeight: 1000,
      });
    });

    const result = await settleWithin(
      new ElectronPrintService(logger, {
        interactivePrintMethod: "windowPrint",
        interactivePrintTimeoutMs: 10,
      }).print(rental, { origin: "launch" }),
      100,
    );

    expect(result).toMatchObject({
      state: "rejected",
      error: {
        code: "A3-PRINT-005",
        message: "A impressão demorou demais para responder.",
      },
    });
    expect(logger.infos.map((entry) => entry.event)).toEqual([
      "print_started",
      "print_prepared",
      "print_invoking",
    ]);
    expect(logger.infos[2]?.details).toMatchObject({
      method: "windowPrint",
      origin: "launch",
    });
    expect(logger.errors[0]?.details).toMatchObject({
      origin: "launch",
      code: "A3-PRINT-005",
    });
    expect(electronMock.destroy).toHaveBeenCalledTimes(2);
  });

  it("bloqueia uma segunda impressão enquanto a primeira ainda está ativa", async () => {
    const rental = await createRentalDetail();
    const logger = new FakePrintLogger();
    const service = new ElectronPrintService(logger, {
      interactivePrintMethod: "webContents",
      interactivePrintTimeoutMs: 10,
    });
    electronMock.print.mockImplementation(() => undefined);

    const firstPrint = service.print(rental, { origin: "report" });

    await expect(
      service.print(rental, { origin: "launch" }),
    ).rejects.toMatchObject({
      code: "A3-PRINT-002",
      message: "Já existe uma impressão em andamento.",
    });
    await expect(firstPrint).rejects.toMatchObject({
      code: "A3-PRINT-005",
    });
    expect(logger.infos.map((entry) => entry.event)).toEqual([
      "print_started",
      "print_prepared",
      "print_invoking",
    ]);
    expect(electronMock.print).toHaveBeenCalledTimes(1);
    expect(electronMock.destroy).toHaveBeenCalledTimes(2);
  });

  it("mantém geração de PDF via printToPDF sem abrir impressão interativa", async () => {
    const rental = await createRentalDetail();
    const logger = new FakePrintLogger();
    const filePath = path.join(
      os.tmpdir(),
      `a3-manager-print-service-${Date.now()}.pdf`,
    );

    try {
      await expect(
        new ElectronPrintService(logger).savePdfToPath(rental, filePath),
      ).resolves.toBe(filePath);

      expect(fs.readFileSync(filePath)).toEqual(Buffer.from("pdf"));
      expect(electronMock.printToPDF).toHaveBeenCalledTimes(1);
      expect(electronMock.print).not.toHaveBeenCalled();
      expect(electronMock.show).not.toHaveBeenCalled();
      expect(electronMock.destroy).toHaveBeenCalledTimes(1);
    } finally {
      fs.rmSync(filePath, { force: true });
    }
  });
});

async function createRentalDetail(): Promise<RentalDetail> {
  const { service } = await createTestService();
  const user = await service.login({ username: "SYSTEM DEV", password: "_int@383" });
  const customer = service.createCustomer(validCustomer);
  const equipment = service.createEquipment(validEquipment);
  return service.launchRental(
    {
      customerId: customer.id,
      period: "MONTHLY",
      startDate: "2026-08-17",
      items: [{ equipmentId: equipment.id, quantity: 1 }],
      deliveryStreet: "",
      deliveryNeighborhood: "",
      deliveryNumber: "",
      deliveryCep: "",
      deliveryCity: "",
      deliveryState: "",
      paymentMethod: "PIX",
      installments: null,
    },
    user.id,
  );
}

class FakePrintLogger {
  readonly infos: Array<{ event: string; details: Record<string, unknown> }> = [];
  readonly errors: Array<{
    event: string;
    error: unknown;
    details: Record<string, unknown>;
  }> = [];

  info(event: string, details: Record<string, unknown> = {}): void {
    this.infos.push({ event, details });
  }

  error(
    event: string,
    error: unknown,
    details: Record<string, unknown> = {},
  ): void {
    this.errors.push({ event, error, details });
  }
}

function createOwnerWindow(): BrowserWindow {
  return {
    focus: vi.fn(),
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    restore: vi.fn(),
    show: vi.fn(),
  } as unknown as BrowserWindow;
}

async function settleWithin<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<
  | { state: "resolved" }
  | { state: "rejected"; error: unknown }
  | { state: "pending" }
> {
  return Promise.race([
    promise.then(
      () => ({ state: "resolved" as const }),
      (error) => ({ state: "rejected" as const, error }),
    ),
    new Promise<{ state: "pending" }>((resolve) => {
      setTimeout(() => resolve({ state: "pending" }), timeoutMs);
    }),
  ]);
}
