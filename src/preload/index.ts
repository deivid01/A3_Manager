import { contextBridge, ipcRenderer } from "electron";
import type { A3Api } from "../shared/contracts";

const ipcChannels = {
  appInfo: "app:info",
  openExternal: "app:open-external",
  windowMinimize: "window:minimize",
  windowToggleMaximize: "window:toggle-maximize",
  windowClose: "window:close",
  windowIsMaximized: "window:is-maximized",
  windowMaximizedChanged: "window:maximized-changed",
  login: "auth:login",
  listUsers: "users:list",
  createUser: "users:create",
  getCompany: "company:get",
  saveCompany: "company:save",
  listCustomers: "customers:list",
  searchCustomers: "customers:search",
  createCustomer: "customers:create",
  updateCustomer: "customers:update",
  archiveCustomer: "customers:archive",
  listEquipment: "equipment:list",
  searchEquipment: "equipment:search",
  createEquipment: "equipment:create",
  updateEquipment: "equipment:update",
  archiveEquipment: "equipment:archive",
  launchRental: "rentals:launch",
  listRentals: "rentals:list",
  getRental: "rentals:get",
  finalizeRental: "rentals:finalize",
  saveRentalPdf: "rentals:save-pdf",
  printRental: "rentals:print",
  getSyncStatus: "sync:get-status",
  syncStatusChanged: "sync:status-changed",
  getA20sConfig: "sync:get-a20s-config",
  saveA20sConfig: "sync:save-a20s-config",
  testA20sConnection: "sync:test-a20s-connection",
  syncNow: "sync:now",
} as const;

type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>;
  if (!result.ok) {
    const error = new Error(result.error.message);
    error.name = result.error.code;
    (error as Error & { code?: string }).code = result.error.code;
    throw error;
  }
  return result.data;
}

const api: A3Api = {
  appInfo: () => call(ipcChannels.appInfo),
  openExternal: (url) => call(ipcChannels.openExternal, url),
  minimizeWindow: () => call(ipcChannels.windowMinimize),
  toggleMaximizeWindow: () => call(ipcChannels.windowToggleMaximize),
  closeWindow: () => call(ipcChannels.windowClose),
  isWindowMaximized: () => call(ipcChannels.windowIsMaximized),
  onWindowMaximizedChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, maximized: boolean) =>
      listener(maximized);
    ipcRenderer.on(ipcChannels.windowMaximizedChanged, handler);
    return () =>
      ipcRenderer.removeListener(ipcChannels.windowMaximizedChanged, handler);
  },
  login: (input) => call(ipcChannels.login, input),
  listUsers: () => call(ipcChannels.listUsers),
  createUser: (input) => call(ipcChannels.createUser, input),
  getCompany: () => call(ipcChannels.getCompany),
  saveCompany: (input) => call(ipcChannels.saveCompany, input),
  listCustomers: (search) => call(ipcChannels.listCustomers, search),
  searchCustomers: (search) => call(ipcChannels.searchCustomers, search),
  createCustomer: (input) => call(ipcChannels.createCustomer, input),
  updateCustomer: (id, input) => call(ipcChannels.updateCustomer, id, input),
  archiveCustomer: (id) => call(ipcChannels.archiveCustomer, id),
  listEquipment: (search) => call(ipcChannels.listEquipment, search),
  searchEquipment: (search) => call(ipcChannels.searchEquipment, search),
  createEquipment: (input) => call(ipcChannels.createEquipment, input),
  updateEquipment: (id, input) => call(ipcChannels.updateEquipment, id, input),
  archiveEquipment: (id) => call(ipcChannels.archiveEquipment, id),
  launchRental: (input) => call(ipcChannels.launchRental, input),
  listRentals: (filters) => call(ipcChannels.listRentals, filters),
  getRental: (id) => call(ipcChannels.getRental, id),
  finalizeRental: (id) => call(ipcChannels.finalizeRental, id),
  saveRentalPdf: (id) => call(ipcChannels.saveRentalPdf, id),
  printRental: (id) => call(ipcChannels.printRental, id),
  getSyncStatus: () => call(ipcChannels.getSyncStatus),
  onSyncStatusChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, status: unknown) =>
      listener(status as Awaited<ReturnType<A3Api["getSyncStatus"]>>);
    ipcRenderer.on(ipcChannels.syncStatusChanged, handler);
    return () =>
      ipcRenderer.removeListener(ipcChannels.syncStatusChanged, handler);
  },
  getA20sConfig: () => call(ipcChannels.getA20sConfig),
  saveA20sConfig: (input) => call(ipcChannels.saveA20sConfig, input),
  testA20sConnection: (input) =>
    call(ipcChannels.testA20sConnection, input),
  syncNow: () => call(ipcChannels.syncNow),
};

contextBridge.exposeInMainWorld("a3", api);
