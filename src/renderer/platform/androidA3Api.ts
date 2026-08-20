import { ApplicationService } from "../../application/ApplicationService";
import { assertAdminOperationAllowed } from "../../application/authorization";
import { AppError } from "../../domain/appError";
import type { User } from "../../domain/types";
import type {
  A20sSyncConfigInput,
  A3Api,
  AppInfo,
  CompanyInput,
  CustomerInput,
  EquipmentInput,
  LoginInput,
  RentalFilters,
  RentalLaunchInput,
  UserInput,
  UserUpdateInput,
} from "../../shared/contracts";
import { appDisplayName, developerUrl } from "../../shared/env";
import { AndroidSyncCoordinator } from "./androidSyncCoordinator";
import { BrowserSqlJsDatabase } from "./browserSqlJsDatabase";
import {
  getAndroidNativeBridge,
  type AndroidNativeBridge,
} from "./androidNativeBridge";

interface LocalDatabase {
  queryAll: BrowserSqlJsDatabase["queryAll"];
  queryOne: BrowserSqlJsDatabase["queryOne"];
  execute: BrowserSqlJsDatabase["execute"];
  executeScript: BrowserSqlJsDatabase["executeScript"];
  transaction: BrowserSqlJsDatabase["transaction"];
  withOutboxSuppressed: BrowserSqlJsDatabase["withOutboxSuppressed"];
  getLastPersistStats?: BrowserSqlJsDatabase["getLastPersistStats"];
}

interface AndroidA3ApiOptions {
  nativeBridge?: AndroidNativeBridge;
  dbFactory?: () => Promise<LocalDatabase>;
  appInfo?: Partial<AppInfo>;
}

interface AndroidContext {
  db: LocalDatabase;
  service: ApplicationService;
  sync: AndroidSyncCoordinator;
}

const unavailableFeatureCode = "ANDROID_PHASE_2_NOT_IMPLEMENTED";
const unavailableFeatureMessage =
  "Este recurso ainda não está disponível no Android nesta fase.";

export function createAndroidA3Api(options: AndroidA3ApiOptions = {}): A3Api {
  const nativeBridge = options.nativeBridge ?? getAndroidNativeBridge();
  const contextPromise = initializeAndroidContext(
    nativeBridge,
    options.dbFactory ?? (() => BrowserSqlJsDatabase.open()),
  );
  let currentUser: User | null = null;

  const appInfo: AppInfo = {
    name: options.appInfo?.name ?? appDisplayName,
    version: options.appInfo?.version ?? "",
    developerUrl: options.appInfo?.developerUrl ?? developerUrl,
  };

  async function context(): Promise<AndroidContext> {
    return contextPromise;
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

  function requireAdmin(): User {
    const user = requireSession();
    assertAdminOperationAllowed(user, "server-configuration");
    return user;
  }

  async function retryLoginAfterSync(
    login: LoginInput,
    caught: unknown,
  ): Promise<User> {
    const { service, sync } = await context();
    const publicConfig = await nativeBridge.getPublicConfig();
    if (!isAuthInvalid(caught) || !publicConfig.tokenConfigured) {
      throw caught;
    }
    await sync.syncNow();
    return service.login(login);
  }

  return {
    appInfo: () => Promise.resolve(appInfo),
    openExternal: (url) => {
      if (url === developerUrl && typeof window.open === "function") {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      return Promise.resolve();
    },
    minimizeWindow: () => Promise.resolve(),
    toggleMaximizeWindow: () => Promise.resolve(false),
    closeWindow: () => Promise.resolve(),
    isWindowMaximized: () => Promise.resolve(false),
    onWindowMaximizedChanged: () => () => undefined,
    login: async (input) => {
      const { service, sync } = await context();
      try {
        currentUser = await service.login(input);
      } catch (caught) {
        currentUser = await retryLoginAfterSync(input, caught);
      }
      sync.requestFreshData();
      return currentUser;
    },
    listUsers: async () => {
      requireAdmin();
      const { service, sync } = await context();
      sync.requestFreshData();
      return service.listUsers();
    },
    createUser: async (input: UserInput) => {
      requireAdmin();
      const { service, sync } = await context();
      return sync.pushMutationToRemote(() => service.createUser(input));
    },
    updateUser: async (id: string, input: UserUpdateInput) => {
      const user = requireAdmin();
      const { service, sync } = await context();
      const updated = await sync.pushMutationToRemote(() =>
        service.updateUser(id, input, user.id),
      );
      if (currentUser?.id === updated.id) {
        currentUser = updated;
      }
      return updated;
    },
    getCompany: async () => {
      requireSession();
      const { service, sync } = await context();
      sync.requestFreshData();
      return service.getCompany();
    },
    saveCompany: async (input: CompanyInput) => {
      requireSession();
      const { service, sync } = await context();
      return sync.pushMutationToRemote(() => service.saveCompany(input));
    },
    listCustomers: async (search: string) => {
      requireSession();
      const { service, sync } = await context();
      sync.requestFreshData();
      return service.listCustomers(search);
    },
    searchCustomers: async (search: string) => {
      requireSession();
      const { service, sync } = await context();
      sync.requestFreshData();
      return service.searchCustomers(search);
    },
    createCustomer: async (input: CustomerInput) => {
      requireSession();
      const { service, sync } = await context();
      return sync.pushMutationToRemote(() => service.createCustomer(input));
    },
    updateCustomer: async (id: string, input: CustomerInput) => {
      requireSession();
      const { service, sync } = await context();
      return sync.pushMutationToRemote(() => service.updateCustomer(id, input));
    },
    archiveCustomer: async (id: string) => {
      requireSession();
      const { service, sync } = await context();
      await sync.pushMutationToRemote(() => service.archiveCustomer(id));
    },
    listEquipment: async (search: string) => {
      requireSession();
      const { service, sync } = await context();
      sync.requestFreshData();
      return service.listEquipment(search);
    },
    searchEquipment: async (search: string) => {
      requireSession();
      const { service, sync } = await context();
      sync.requestFreshData();
      return service.searchEquipment(search);
    },
    createEquipment: async (input: EquipmentInput) => {
      requireSession();
      const { service, sync } = await context();
      return sync.pushMutationToRemote(() => service.createEquipment(input));
    },
    updateEquipment: async (id: string, input: EquipmentInput) => {
      requireSession();
      const { service, sync } = await context();
      return sync.pushMutationToRemote(() => service.updateEquipment(id, input));
    },
    archiveEquipment: async (id: string) => {
      requireSession();
      const { service, sync } = await context();
      await sync.pushMutationToRemote(() => service.archiveEquipment(id));
    },
    launchRental: async (input: RentalLaunchInput) => {
      const user = requireSession();
      const { service, sync } = await context();
      return sync.pushMutationToRemote(() => service.launchRental(input, user.id));
    },
    listRentals: async (filters: RentalFilters) => {
      requireSession();
      const { service, sync } = await context();
      sync.requestFreshData();
      return service.listRentals(filters);
    },
    getRental: async (id: string) => {
      requireSession();
      const { service, sync } = await context();
      sync.requestFreshData();
      return service.getRental(id);
    },
    finalizeRental: async (id: string) => {
      requireSession();
      const { service, sync } = await context();
      return sync.pushMutationToRemote(() => service.finalizeRental(id));
    },
    archiveRental: async (id: string) => {
      const user = requireSession();
      const { service, sync } = await context();
      return sync.pushMutationToRemote(() => service.archiveRental(id, user.id));
    },
    unarchiveRental: async (id: string) => {
      requireSession();
      const { service, sync } = await context();
      return sync.pushMutationToRemote(() => service.unarchiveRental(id));
    },
    saveRentalPdf: rejectUnavailableFeature,
    printRental: rejectUnavailableFeature,
    getSyncStatus: async () => {
      requireSession();
      const { sync } = await context();
      return sync.getStatus();
    },
    onSyncStatusChanged: (listener) => {
      let disposed = false;
      let disposeInner: () => void = () => {};
      void context().then(({ sync }) => {
        if (disposed) {
          return;
        }
        disposeInner = sync.onStatusChange(listener);
      });
      return () => {
        disposed = true;
        disposeInner();
      };
    },
    getA20sConfig: async () => {
      const user = requireAdmin();
      const { sync } = await context();
      return sync.getPublicConfig(user);
    },
    saveA20sConfig: async (input: A20sSyncConfigInput) => {
      const user = requireAdmin();
      const { sync } = await context();
      return sync.saveConfig(input, user);
    },
    testA20sConnection: async (input: A20sSyncConfigInput) => {
      const user = requireAdmin();
      const { sync } = await context();
      return sync.testConnection(input, user);
    },
    syncNow: async () => {
      const user = requireAdmin();
      const { sync } = await context();
      return sync.syncNow(user);
    },
  };
}

async function initializeAndroidContext(
  nativeBridge: AndroidNativeBridge,
  dbFactory: () => Promise<LocalDatabase>,
): Promise<AndroidContext> {
  const db = await dbFactory();
  const service = new ApplicationService(db as never);
  await service.initialize();
  const sync = new AndroidSyncCoordinator(db, nativeBridge);
  await sync.initialize();
  nativeBridge
    .getPublicConfig()
    .then((config) => {
      if (config.tokenConfigured) {
        sync.requestFreshData();
      }
    })
    .catch(() => undefined);
  return { db, service, sync };
}

function rejectUnavailableFeature<T>(): Promise<T> {
  const error = new Error(unavailableFeatureMessage);
  error.name = unavailableFeatureCode;
  (error as Error & { code?: string }).code = unavailableFeatureCode;
  return Promise.reject(error);
}

function isAuthInvalid(error: unknown): boolean {
  return (
    error instanceof AppError
      ? error.code
      : (error as { code?: unknown } | null)?.code
  ) === "AUTH_INVALID";
}
