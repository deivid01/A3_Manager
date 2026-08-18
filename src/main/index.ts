import path from "node:path";
import fs from "node:fs";
import { app, BrowserWindow, ipcMain, Menu, safeStorage, shell } from "electron";
import { ApplicationService } from "../application/ApplicationService";
import {
  assertAdminOperationAllowed,
  type AdminOnlyOperation,
} from "../application/authorization";
import { AppError, toSafeError } from "../domain/appError";
import type { User } from "../domain/types";
import {
  SqlJsDatabase,
  resolveDatabasePath,
} from "../infrastructure/database/SqlJsDatabase";
import { FileLogger } from "../infrastructure/logging/FileLogger";
import { ElectronPrintService } from "../infrastructure/printing/ElectronPrintService";
import { A20sConfigStore } from "../infrastructure/sync/A20sConfigStore";
import { createElectronSafeStorageTokenCodec } from "../infrastructure/sync/ElectronSafeStorageTokenCodec";
import { SyncCoordinator } from "../infrastructure/sync/SyncCoordinator";
import type {
  A20sSyncConfigInput,
  CompanyInput,
  CustomerInput,
  EquipmentInput,
  LoginInput,
  RentalFilters,
  RentalLaunchInput,
  RentalPrintOrigin,
  UserInput,
  UserUpdateInput,
} from "../shared/contracts";
import { appDisplayName, developerUrl } from "../shared/env";
import { ipcChannels } from "../shared/ipc";

let mainWindow: BrowserWindow | null = null;
let service: ApplicationService;
let printService: ElectronPrintService;
let syncCoordinator: SyncCoordinator;
let currentUser: User | null = null;
let logger: FileLogger | null = null;

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    logger?.info("second_instance_blocked", {
      pid: process.pid,
      hasMainWindow: Boolean(mainWindow && !mainWindow.isDestroyed()),
    });
    focusMainWindow();
  });

  void app
    .whenReady()
    .then(bootApplication)
    .catch((error) => {
      logger?.error("startup_failed", error);
      console.error(error);
      app.quit();
    });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("before-quit", () => {
    syncCoordinator?.stop();
  });
}

async function bootApplication(): Promise<void> {
  logger = FileLogger.open(app.getPath("userData"));
  logger.info("app_start", {
    version: app.getVersion(),
    pid: process.pid,
    singleInstanceLock: true,
  });
  const database = await SqlJsDatabase.open(
    resolveDatabasePath(app.getPath("userData")),
  );
  service = new ApplicationService(database);
  printService = new ElectronPrintService(logger);
  await service.initialize();
  syncCoordinator = new SyncCoordinator({
    db: database,
    configStore: new A20sConfigStore(
      app.getPath("userData"),
      createElectronSafeStorageTokenCodec(safeStorage),
    ),
    logger,
  });
  syncCoordinator.onStatusChange((status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(ipcChannels.syncStatusChanged, status);
    }
  });
  registerIpcHandlers();
  await createMainWindow();
  syncCoordinator.start();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
      return;
    }
    focusMainWindow();
  });
}

async function createMainWindow(): Promise<void> {
  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 600,
    title: appDisplayName,
    icon: resolveWindowIconPath(),
    show: false,
    frame: false,
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url === developerUrl) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("maximize", () => notifyMaximizedChanged(true));
  mainWindow.on("unmaximize", () => notifyMaximizedChanged(false));
  mainWindow.on("focus", () => syncCoordinator?.requestFreshData());

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

function focusMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  mainWindow.focus();
}

function resolveWindowIconPath(): string | undefined {
  const electronProcess = process as NodeJS.Process & {
    resourcesPath?: string;
  };
  const candidates = [
    electronProcess.resourcesPath
      ? path.join(electronProcess.resourcesPath, "icon.ico")
      : "",
    path.join(process.cwd(), "build", "icon.ico"),
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function isAllowedNavigation(url: string): boolean {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl && url.startsWith(devServerUrl)) {
    return true;
  }
  return url.startsWith("file://");
}

function registerIpcHandlers(): void {
  handle(ipcChannels.appInfo, () => ({
    name: appDisplayName,
    version: app.getVersion(),
    developerUrl,
  }));
  handle(ipcChannels.openExternal, async (url) => {
    const safeUrl = String(url ?? "");
    if (safeUrl !== developerUrl) {
      throw new AppError("VALIDATION_ERROR", "Link externo não permitido.");
    }
    await shell.openExternal(safeUrl);
  });
  handle(ipcChannels.windowMinimize, () => {
    mainWindow?.minimize();
  });
  handle(ipcChannels.windowToggleMaximize, () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
    return mainWindow?.isMaximized() ?? false;
  });
  handle(ipcChannels.windowClose, () => {
    mainWindow?.close();
  });
  handle(
    ipcChannels.windowIsMaximized,
    () => mainWindow?.isMaximized() ?? false,
  );
  handle(ipcChannels.login, async (input) => {
    currentUser = await service.login(input as LoginInput);
    syncCoordinator.requestFreshData();
    return currentUser;
  });
  handle(ipcChannels.listUsers, () => {
    requireAdmin("user-management");
    syncCoordinator.requestFreshData();
    return service.listUsers();
  });
  handle(ipcChannels.createUser, async (input) => {
    requireAdmin("user-management");
    const created = await service.createUser(input as UserInput);
    syncCoordinator.notifyLocalMutation();
    return created;
  });
  handle(ipcChannels.updateUser, async (id, input) => {
    requireAdmin("user-management");
    const updated = await service.updateUser(
      String(id),
      input as UserUpdateInput,
    );
    if (currentUser?.id === updated.id) {
      currentUser = updated;
    }
    syncCoordinator.notifyLocalMutation();
    return updated;
  });
  handle(ipcChannels.getCompany, () => {
    requireSession();
    syncCoordinator.requestFreshData();
    return service.getCompany();
  });
  handle(ipcChannels.saveCompany, (input) => {
    requireSession();
    const saved = service.saveCompany(input as CompanyInput);
    syncCoordinator.notifyLocalMutation();
    return saved;
  });
  handle(ipcChannels.listCustomers, (search) => {
    requireSession();
    syncCoordinator.requestFreshData();
    return service.listCustomers(String(search ?? ""));
  });
  handle(ipcChannels.searchCustomers, (search) => {
    requireSession();
    syncCoordinator.requestFreshData();
    return service.searchCustomers(String(search ?? ""));
  });
  handle(ipcChannels.createCustomer, (input) => {
    requireSession();
    const created = service.createCustomer(input as CustomerInput);
    syncCoordinator.notifyLocalMutation();
    return created;
  });
  handle(ipcChannels.updateCustomer, (id, input) => {
    requireSession();
    const updated = service.updateCustomer(String(id), input as CustomerInput);
    syncCoordinator.notifyLocalMutation();
    return updated;
  });
  handle(ipcChannels.archiveCustomer, (id) => {
    requireSession();
    service.archiveCustomer(String(id));
    syncCoordinator.notifyLocalMutation();
  });
  handle(ipcChannels.listEquipment, (search) => {
    requireSession();
    syncCoordinator.requestFreshData();
    return service.listEquipment(String(search ?? ""));
  });
  handle(ipcChannels.searchEquipment, (search) => {
    requireSession();
    syncCoordinator.requestFreshData();
    return service.searchEquipment(String(search ?? ""));
  });
  handle(ipcChannels.createEquipment, (input) => {
    requireSession();
    const created = service.createEquipment(input as EquipmentInput);
    syncCoordinator.notifyLocalMutation();
    return created;
  });
  handle(ipcChannels.updateEquipment, (id, input) => {
    requireSession();
    const updated = service.updateEquipment(String(id), input as EquipmentInput);
    syncCoordinator.notifyLocalMutation();
    return updated;
  });
  handle(ipcChannels.archiveEquipment, (id) => {
    requireSession();
    service.archiveEquipment(String(id));
    syncCoordinator.notifyLocalMutation();
  });
  handle(ipcChannels.launchRental, (input) => {
    const user = requireSession();
    const rental = service.launchRental(input as RentalLaunchInput, user.id);
    syncCoordinator.notifyLocalMutation();
    return rental;
  });
  handle(ipcChannels.listRentals, (filters) => {
    requireSession();
    syncCoordinator.requestFreshData();
    return service.listRentals(filters as RentalFilters);
  });
  handle(ipcChannels.getRental, (id) => {
    requireSession();
    syncCoordinator.requestFreshData();
    return service.getRental(String(id));
  });
  handle(ipcChannels.finalizeRental, (id) => {
    requireSession();
    const rental = service.finalizeRental(String(id));
    syncCoordinator.notifyLocalMutation();
    return rental;
  });
  handle(ipcChannels.archiveRental, (id) => {
    const user = requireSession();
    const rental = service.archiveRental(String(id), user.id);
    syncCoordinator.notifyLocalMutation();
    return rental;
  });
  handle(ipcChannels.unarchiveRental, (id) => {
    requireSession();
    const rental = service.unarchiveRental(String(id));
    syncCoordinator.notifyLocalMutation();
    return rental;
  });
  handle(ipcChannels.saveRentalPdf, (id) => {
    requireSession();
    return printService.savePdf(service.getRental(String(id)));
  });
  handle(ipcChannels.printRental, (id, origin) => {
    requireSession();
    return printService.print(service.getRental(String(id)), {
      ownerWindow: mainWindow,
      origin: parsePrintOrigin(origin),
    });
  });
  handle(ipcChannels.getSyncStatus, () => {
    requireSession();
    return syncCoordinator.getStatus();
  });
  handle(ipcChannels.getA20sConfig, () => {
    requireAdmin("server-configuration");
    return syncCoordinator.getPublicConfig();
  });
  handle(ipcChannels.saveA20sConfig, (input) => {
    requireAdmin("server-configuration");
    return syncCoordinator.saveConfig(input as A20sSyncConfigInput);
  });
  handle(ipcChannels.testA20sConnection, (input) => {
    requireAdmin("server-configuration");
    return syncCoordinator.testConnection(input as A20sSyncConfigInput);
  });
  handle(ipcChannels.syncNow, () => {
    requireAdmin("server-configuration");
    return syncCoordinator.syncNow();
  });
}

function parsePrintOrigin(value: unknown): RentalPrintOrigin {
  return value === "launch" ? "launch" : "report";
}

function notifyMaximizedChanged(maximized: boolean): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(ipcChannels.windowMaximizedChanged, maximized);
  }
}

function handle(
  channel: string,
  action: (...args: unknown[]) => unknown,
): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      const data = await action(...args);
      return { ok: true, data };
    } catch (error) {
      const safeError = toSafeError(error);
      logger?.error("ipc_failed", error, { channel, code: safeError.code });
      console.error(`[${safeError.code}] ${safeError.message}`);
      return { ok: false, error: safeError };
    }
  });
}

function requireSession(): User {
  if (!currentUser) {
    throw new AppError("AUTH_FORBIDDEN", "Faça login para continuar.");
  }
  if (!currentUser.active) {
    throw new AppError("AUTH_FORBIDDEN", "Usuário inativo.");
  }
  return currentUser;
}

function requireAdmin(operation: AdminOnlyOperation): User {
  const user = requireSession();
  assertAdminOperationAllowed(user, operation);
  return user;
}
