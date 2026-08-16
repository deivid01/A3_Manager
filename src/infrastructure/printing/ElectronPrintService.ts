import fs from "node:fs";
import path from "node:path";
import { BrowserWindow, dialog } from "electron";
import { AppError } from "../../domain/appError";
import type { RentalDetail } from "../../domain/types";
import {
  selectRentalPrintLayout,
  shouldTryCompactLayout,
  type PrintLayoutMeasurement,
  type RentalPrintLayoutMode,
} from "./printLayoutStrategy";
import { renderRentalDocumentHtml } from "./rentalDocument";

export class ElectronPrintService {
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
    } catch {
      throw new AppError("PDF_ERROR", "Não foi possível gerar o PDF da locação.");
    }
  }

  async print(rental: RentalDetail): Promise<void> {
    const window = await createAdaptiveDocumentWindow(rental);
    try {
      await new Promise<void>((resolve, reject) => {
        window.webContents.print({ printBackground: true }, (success, failureReason) => {
          if (success) {
            resolve();
          } else {
            reject(new AppError("PDF_ERROR", failureReason || "Não foi possível enviar o documento para impressão."));
          }
        });
      });
    } finally {
      window.destroy();
    }
  }

  private async renderPdf(rental: RentalDetail): Promise<Buffer> {
    const window = await createAdaptiveDocumentWindow(rental);
    try {
      return await window.webContents.printToPDF({
        pageSize: "A4",
        printBackground: true,
        margins: {
          marginType: "none"
        }
      });
    } finally {
      window.destroy();
    }
  }
}

async function createAdaptiveDocumentWindow(rental: RentalDetail): Promise<BrowserWindow> {
  const normalWindow = await createHiddenDocumentWindow(rental, "NORMAL");
  const normalMeasurement = await measurePrintLayout(normalWindow);

  if (!shouldTryCompactLayout(normalMeasurement)) {
    return normalWindow;
  }

  const compactWindow = await createHiddenDocumentWindow(rental, "COMPACT");
  const compactMeasurement = await measurePrintLayout(compactWindow);
  const selectedMode = selectRentalPrintLayout(
    normalMeasurement,
    compactMeasurement,
  );

  if (selectedMode === "COMPACT") {
    normalWindow.destroy();
    return compactWindow;
  }

  compactWindow.destroy();
  return normalWindow;
}

async function createHiddenDocumentWindow(
  rental: RentalDetail,
  layoutMode: RentalPrintLayoutMode,
): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    height: 1123,
    show: false,
    width: 794,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderRentalDocumentHtml(rental, layoutMode))}`);
  return window;
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
