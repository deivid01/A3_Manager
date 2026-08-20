import {
  BarChart3,
  Building2,
  CalendarPlus,
  Cloud,
  CloudOff,
  HardHat,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  TriangleAlert,
  Sun,
  UserCog,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { User } from "../domain/types";
import { roleLabels } from "../domain/labels";
import type { AppInfo, SyncStatus } from "../shared/contracts";
import { WindowTitlebar } from "./components/WindowTitlebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "./components/ui/tooltip";
import { CompanyView } from "./features/CompanyView";
import { CustomersView } from "./features/CustomersView";
import { EquipmentView } from "./features/EquipmentView";
import { LoginView } from "./features/LoginView";
import { RentalLaunchView } from "./features/RentalLaunchView";
import { RentalsView } from "./features/RentalsView";
import { UsersView } from "./features/UsersView";
import {
  clearStoredDraftsForUser,
  getSessionDraftStorage,
} from "./lib/formDrafts";
import {
  applyAppearance,
  onSystemAppearanceChange,
  persistAppearancePreference,
  readAppearancePreference,
  type AppearanceMode,
  type ResolvedTheme,
} from "./theme";
import { getRendererPlatform } from "./platform/rendererPlatform";

type ViewKey =
  | "rentals"
  | "launch"
  | "customers"
  | "equipment"
  | "company"
  | "users";

const navItems: Array<{
  key: ViewKey;
  label: string;
  icon: typeof BarChart3;
  adminOnly?: boolean;
}> = [
  { key: "rentals", label: "Relatórios", icon: BarChart3 },
  { key: "launch", label: "Nova locação", icon: CalendarPlus },
  { key: "customers", label: "Clientes", icon: Users },
  { key: "equipment", label: "Equipamentos", icon: Package },
  { key: "company", label: "Empresa", icon: Building2 },
  { key: "users", label: "Usuários", icon: UserCog, adminOnly: true },
];

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>("rentals");
  const appearance = useAppearance();
  const isDesktop = getRendererPlatform() === "desktop";
  const [appInfo, setAppInfo] = useState<AppInfo>({
    name: "A3 Manager",
    version: "",
    developerUrl: "https://github.com/deivid01",
  });

  useEffect(() => {
    window.a3
      .appInfo()
      .then(setAppInfo)
      .catch(() => undefined);
  }, []);

  return (
    <div className={isDesktop ? "desktop-window" : "desktop-window native-window"}>
      {isDesktop && <WindowTitlebar />}
      <div className="window-body">
        {!currentUser ? (
          <LoginView appInfo={appInfo} onLogin={setCurrentUser} />
        ) : (
          <AuthenticatedShell
            activeView={activeView}
            appInfo={appInfo}
            currentUser={currentUser}
            appearanceMode={appearance.mode}
            resolvedTheme={appearance.resolvedTheme}
            onNavigate={setActiveView}
            onAppearanceChange={appearance.setMode}
            onLogout={() => {
              clearStoredDraftsForUser(getSessionDraftStorage(), currentUser.id);
              setCurrentUser(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

function AuthenticatedShell({
  activeView,
  appInfo,
  appearanceMode,
  currentUser,
  resolvedTheme,
  onAppearanceChange,
  onNavigate,
  onLogout,
}: {
  activeView: ViewKey;
  appInfo: AppInfo;
  appearanceMode: AppearanceMode;
  currentUser: User;
  resolvedTheme: ResolvedTheme;
  onAppearanceChange(mode: AppearanceMode): void;
  onNavigate(view: ViewKey): void;
  onLogout(): void;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const syncStatus = useSyncStatus();
  const visibleNav = useMemo(
    () => navItems.filter(
      (item) => !item.adminOnly || currentUser.role === "ADMIN",
    ),
    [currentUser.role],
  );

  useEffect(() => {
    if (!visibleNav.some((item) => item.key === activeView)) {
      onNavigate("rentals");
    }
  }, [activeView, onNavigate, visibleNav]);

  return (
    <TooltipProvider delayDuration={180}>
    <div className={sidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
      <aside className={sidebarCollapsed ? "sidebar collapsed" : "sidebar"}>
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <img src={`${import.meta.env.BASE_URL}logo-A3.jpg`} alt="A3" />
          </div>
          <div className="sidebar-brand-copy">
            <strong>A3 Manager</strong>
            <span>Gestão de locações</span>
          </div>
          <button
            className="sidebar-collapse-button"
            type="button"
            title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
            aria-label={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
            onClick={() => setSidebarCollapsed((current) => !current)}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        <nav aria-label="Navegação principal">
          <span className="nav-label">Menu</span>
          {visibleNav.map((item) => {
            const Icon = item.icon;
            return (
              <Tooltip key={item.key}>
                <TooltipTrigger asChild>
                  <button
                    className={
                      activeView === item.key ? "nav-button active" : "nav-button"
                    }
                    onClick={() => onNavigate(item.key)}
                    title={item.label}
                    type="button"
                  >
                    <Icon size={19} strokeWidth={1.9} />
                    <span>{item.label}</span>
                  </button>
                </TooltipTrigger>
                {sidebarCollapsed && <TooltipContent side="right">{item.label}</TooltipContent>}
              </Tooltip>
            );
          })}
        </nav>

        <div className="sidebar-meta">
          <SyncStatusIndicator status={syncStatus} collapsed={sidebarCollapsed} />
          <AppearanceControl
            mode={appearanceMode}
            resolvedTheme={resolvedTheme}
            onChange={onAppearanceChange}
          />
          <button
            className="developer-credit"
            type="button"
            onClick={() => window.a3.openExternal(appInfo.developerUrl)}
          >
            {appInfo.version ? `A3 Manager v${appInfo.version}` : "A3 Manager"}
            <br />
            Feito por Deivid Peres
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="session-card" title={currentUser.username}>
                <div className="session-avatar">
                  <HardHat size={18} />
                </div>
                <div className="session-copy">
                  <strong>{currentUser.username}</strong>
                  <span>{roleLabels[currentUser.role]}</span>
                </div>
                <button
                  className="logout-button"
                  onClick={onLogout}
                  title="Sair"
                  aria-label="Sair"
                  type="button"
                >
                  <LogOut size={18} />
                </button>
              </div>
            </TooltipTrigger>
            {sidebarCollapsed && <TooltipContent side="right">{currentUser.username}</TooltipContent>}
          </Tooltip>
        </div>
      </aside>

      <div className="mobile-sync-status">
        <SyncStatusIndicator status={syncStatus} collapsed={false} />
      </div>

      <main className="workspace" data-active-view={activeView}>
        {activeView === "rentals" && <RentalsView />}
        {activeView === "launch" && <RentalLaunchView draftUserId={currentUser.id} />}
        {activeView === "customers" && <CustomersView draftUserId={currentUser.id} />}
        {activeView === "equipment" && <EquipmentView draftUserId={currentUser.id} />}
        {activeView === "company" && (
          <CompanyView
            canManageSync={currentUser.role === "ADMIN"}
            draftUserId={currentUser.id}
          />
        )}
        {activeView === "users" && currentUser.role === "ADMIN" && (
          <UsersView currentUser={currentUser} draftUserId={currentUser.id} />
        )}
      </main>
    </div>
    </TooltipProvider>
  );
}

function useSyncStatus(): SyncStatus | null {
  const [status, setStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    let active = true;
    window.a3
      .getSyncStatus()
      .then((loaded) => {
        if (active) setStatus(loaded);
      })
      .catch(() => undefined);
    const dispose = window.a3.onSyncStatusChanged((next) => {
      if (active) setStatus(next);
    });
    return () => {
      active = false;
      dispose();
    };
  }, []);

  return status;
}

function SyncStatusIndicator({
  status,
  collapsed,
}: {
  status: SyncStatus | null;
  collapsed: boolean;
}) {
  const meta = syncStatusMeta(status);
  const Icon = meta.icon;
  const pending =
    status?.pendingCount && status.pendingCount > 0
      ? `${status.pendingCount} pendente${status.pendingCount === 1 ? "" : "s"}`
      : null;
  const detail =
    pending ??
    (status?.lastSuccessfulSyncAt
      ? `Última sync ${formatSyncTime(status.lastSuccessfulSyncAt)}`
      : status?.database ?? "a3_manager");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={`sync-status ${meta.kind}`} title={meta.label}>
          <Icon size={17} className={meta.spin ? "sync-spin" : ""} />
          <div className="sync-status-copy">
            <strong>{meta.label}</strong>
            <span>{detail}</span>
          </div>
        </div>
      </TooltipTrigger>
      {collapsed && (
        <TooltipContent side="right">
          {meta.label}
          {pending ? ` · ${pending}` : ""}
        </TooltipContent>
      )}
    </Tooltip>
  );
}

function syncStatusMeta(status: SyncStatus | null): {
  label: string;
  kind: "success" | "warning" | "danger" | "neutral";
  icon: typeof Cloud;
  spin?: boolean;
} {
  if (!status) {
    return { label: "Sincronização", kind: "neutral", icon: CloudOff };
  }

  if (status.state === "syncing") {
    return { label: "Sincronizando", kind: "warning", icon: Loader2, spin: true };
  }
  if (status.state === "online") {
    return { label: "Online", kind: "success", icon: Cloud };
  }
  if (status.state === "pending") {
    return { label: "Alterações pendentes", kind: "warning", icon: Loader2 };
  }
  if (status.state === "offline") {
    return { label: "Offline", kind: "neutral", icon: CloudOff };
  }
  if (status.state === "not_configured") {
    return { label: "Servidor não configurado", kind: "neutral", icon: CloudOff };
  }
  return { label: "Erro de sincronização", kind: "danger", icon: TriangleAlert };
}

function formatSyncTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function useAppearance() {
  const [mode, setModeState] = useState<AppearanceMode>(() =>
    readAppearancePreference(),
  );
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    applyAppearance(readAppearancePreference()),
  );

  useEffect(() => {
    setResolvedTheme(applyAppearance(mode));
    persistAppearancePreference(mode);

    if (mode !== "system") return undefined;
    return onSystemAppearanceChange(() => setResolvedTheme(applyAppearance(mode)));
  }, [mode]);

  return {
    mode,
    resolvedTheme,
    setMode: setModeState,
  };
}

function AppearanceControl({
  mode,
  resolvedTheme,
  onChange,
}: {
  mode: AppearanceMode;
  resolvedTheme: ResolvedTheme;
  onChange(mode: AppearanceMode): void;
}) {
  const Icon = mode === "system" ? Monitor : resolvedTheme === "dark" ? Moon : Sun;
  const modeLabel = appearanceLabels[mode];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <label className="appearance-control" title={`Aparência: ${modeLabel}`}>
          <span className="appearance-control-label">
            <Icon size={17} />
            <span>Aparência</span>
          </span>
          <select
            aria-label="Aparência"
            value={mode}
            onChange={(event) => onChange(event.target.value as AppearanceMode)}
          >
            <option value="system">Sistema</option>
            <option value="dark">Escuro</option>
            <option value="light">Claro</option>
          </select>
        </label>
      </TooltipTrigger>
      <TooltipContent side="right">Aparência: {modeLabel}</TooltipContent>
    </Tooltip>
  );
}

const appearanceLabels: Record<AppearanceMode, string> = {
  system: "Sistema",
  dark: "Escuro",
  light: "Claro",
};
