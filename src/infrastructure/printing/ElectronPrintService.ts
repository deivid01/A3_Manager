import fs from "node:fs";
import path from "node:path";
import { BrowserWindow, dialog } from "electron";
import { AppError } from "../../domain/appError";
import type { RentalDetail } from "../../domain/types";
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
    const window = await createHiddenDocumentWindow(rental);
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
    const window = await createHiddenDocumentWindow(rental);
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

async function createHiddenDocumentWindow(rental: RentalDetail): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderRentalDocumentHtml(rental))}`);
  return window;
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "-");
}
