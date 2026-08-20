import { registerPlugin } from "@capacitor/core";
import type {
  A20sSyncConfigInput,
  A20sSyncPublicConfig,
  SyncTestResult,
} from "../../shared/contracts";
import type { DbParam, DbRow } from "../../infrastructure/database/SqlJsDatabase";
import type { SyncTableName } from "../../infrastructure/sync/syncTables";

export interface AndroidNativeBridge {
  getPublicConfig(): Promise<A20sSyncPublicConfig>;
  saveConfig(input: A20sSyncConfigInput): Promise<A20sSyncPublicConfig>;
  testConnection(input: A20sSyncConfigInput): Promise<SyncTestResult>;
  listRemoteTables(): Promise<{ tables: string[] }>;
  readMetadata(input: { key: string }): Promise<{ value: string | null }>;
  tableInfo(input: { table: SyncTableName }): Promise<{ columns: string[] }>;
  countRows(input: { table: SyncTableName }): Promise<{ total: number }>;
  selectRows(input: {
    table: SyncTableName;
    columns: string[];
    limit: number;
    offset: number;
  }): Promise<{ rows: DbRow[] }>;
  upsertRow(input: {
    table: SyncTableName;
    row: Record<string, DbParam>;
  }): Promise<{ changes: number }>;
  deleteRow(input: {
    table: SyncTableName;
    id: string;
  }): Promise<{ changes: number }>;
}

const nativePlugin = registerPlugin<AndroidNativeBridge>("A3Android");

export function getAndroidNativeBridge(): AndroidNativeBridge {
  return nativePlugin;
}
