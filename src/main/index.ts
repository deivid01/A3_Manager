import path from "node:path";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { ApplicationService } from "../application/ApplicationService";
import { AppError, toSafeError } from "../domain/appError";
import type { User } from "../domain/types";
import { SqlJsDatabase, resolveDatabasePath } from "../infrastructure/database/SqlJsDatabase";
import { ElectronPrintService } from "../infrastructure/printing/ElectronPrintService";
import type {
  CompanyInput,
  CustomerInput,
  EquipmentInput,
  LoginInput,
  RentalFilters,
  RentalLaunchInput,
  UserInput
} from "../shared/contracts";
import { appDisplayName, developerUrl } from "../shared/env";
import { ipcChannels } from "../shared/ipc";

let mainWindow: BrowserWindow | null = null;
let service: ApplicationService;
let printService: ElectronPrintService;
let currentUser: User | null = null;

void app.whenReady().then(async () => {
  const database = await SqlJsDatabase.open(resolveDatabasePath(app.getPath("userData")));
  service = new ApplicationService(database);
  printService = new ElectronPrintService();
  await service.initialize();
  registerIpcHandlers();
  await createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

async function createMainWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    title: appDisplayName,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url === developerUrl) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

function registerIpcHandlers(): void {
  handle(ipcChannels.appInfo, () => ({
    name: appDisplayName,
    version: app.getVersion(),
    developerUrl
  }));
  handle(ipcChannels.openExternal, async (url) => {
    const safeUrl = String(url ?? "");
    if (safeUrl !== developerUrl) {
      throw new AppError("VALIDATION_ERROR", "Link externo não permitido.");
    }
    await shell.openExternal(safeUrl);
  });
  handle(ipcChannels.login, async (input) => {
    currentUser = await service.login(input as LoginInput);
    return currentUser;
  });
  handle(ipcChannels.listUsers, () => {
    requireAdmin();
    return service.listUsers();
  });
  handle(ipcChannels.createUser, async (input) => {
    requireAdmin();
    return service.createUser(input as UserInput);
  });
  handle(ipcChannels.getCompany, () => {
    requireSession();
    return service.getCompany();
  });
  handle(ipcChannels.saveCompany, (input) => {
    requireAdmin();
    return service.saveCompany(input as CompanyInput);
  });
  handle(ipcChannels.listCustomers, (search) => {
    requireAdmin();
    return service.listCustomers(String(search ?? ""));
  });
  handle(ipcChannels.searchCustomers, (search) => {
    requireSession();
    return service.searchCustomers(String(search ?? ""));
  });
  handle(ipcChannels.createCustomer, (input) => {
    requireAdmin();
    return service.createCustomer(input as CustomerInput);
  });
  handle(ipcChannels.updateCustomer, (id, input) => {
    requireAdmin();
    return service.updateCustomer(String(id), input as CustomerInput);
  });
  handle(ipcChannels.archiveCustomer, (id) => {
    requireAdmin();
    service.archiveCustomer(String(id));
  });
  handle(ipcChannels.listEquipment, (search) => {
    requireAdmin();
    return service.listEquipment(String(search ?? ""));
  });
  handle(ipcChannels.searchEquipment, (search) => {
    requireSession();
    return service.searchEquipment(String(search ?? ""));
  });
  handle(ipcChannels.createEquipment, (input) => {
    requireAdmin();
    return service.createEquipment(input as EquipmentInput);
  });
  handle(ipcChannels.updateEquipment, (id, input) => {
    requireAdmin();
    return service.updateEquipment(String(id), input as EquipmentInput);
  });
  handle(ipcChannels.archiveEquipment, (id) => {
    requireAdmin();
    service.archiveEquipment(String(id));
  });
  handle(ipcChannels.launchRental, (input) => {
    const user = requireSession();
    return service.launchRental(input as RentalLaunchInput, user.id);
  });
  handle(ipcChannels.listRentals, (filters) => {
    requireSession();
    return service.listRentals(filters as RentalFilters);
  });
  handle(ipcChannels.getRental, (id) => {
    requireSession();
    return service.getRental(String(id));
  });
  handle(ipcChannels.finalizeRental, (id) => {
    requireSession();
    return service.finalizeRental(String(id));
  });
  handle(ipcChannels.saveRentalPdf, (id) => {
    requireSession();
    return printService.savePdf(service.getRental(String(id)));
  });
  handle(ipcChannels.printRental, (id) => {
    requireSession();
    return printService.print(service.getRental(String(id)));
  });
}

function handle(channel: string, action: (...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      const data = await action(...args);
      return { ok: true, data };
    } catch (error) {
      const safeError = toSafeError(error);
      console.error(`[${safeError.code}] ${safeError.message}`);
      return { ok: false, error: safeError };
    }
  });
}

function requireSession(): User {
  if (!currentUser) {
    throw new AppError("AUTH_FORBIDDEN", "Faça login para continuar.");
  }
  return currentUser;
}

function requireAdmin(): User {
  const user = requireSession();
  if (user.role !== "ADMIN") {
    throw new AppError("AUTH_FORBIDDEN", "Apenas administradores podem executar esta ação.");
  }
  return user;
}
