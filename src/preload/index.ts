import { contextBridge, ipcRenderer } from "electron";
import type { A3Api } from "../shared/contracts";
import { ipcChannels } from "../shared/ipc";

type IpcResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>;
  if (!result.ok) {
    const error = new Error(result.error.message);
    error.name = result.error.code;
    throw error;
  }
  return result.data;
}

const api: A3Api = {
  appInfo: () => call(ipcChannels.appInfo),
  openExternal: (url) => call(ipcChannels.openExternal, url),
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
  printRental: (id) => call(ipcChannels.printRental, id)
};

contextBridge.exposeInMainWorld("a3", api);
