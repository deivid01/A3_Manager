import fs from "node:fs";
import { BrowserWindow, dialog } from "electron";
import type { RentalDetail } from "../../domain/types";
import { renderRentalDocumentHtml } from "./rentalDocument";

export class ElectronPrintService {
  async savePdf(rental: RentalDetail): Promise<string | null> {
    const pdf = await this.renderPdf(rental);
    const result = await dialog.showSaveDialog({
      title: "Salvar contrato de locação",
      defaultPath: `${sanitizeFileName(rental.code)}.pdf`,
      filters: [{ name: "PDF", extensions: ["pdf"] }]
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    fs.writeFileSync(result.filePath, pdf);
    return result.filePath;
  }

  async print(rental: RentalDetail): Promise<void> {
    const window = await createHiddenDocumentWindow(rental);
    try {
      await new Promise<void>((resolve, reject) => {
        window.webContents.print({ printBackground: true }, (success, failureReason) => {
          if (success) {
            resolve();
          } else {
            reject(new Error(failureReason || "Não foi possível enviar o documento para impressão."));
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
