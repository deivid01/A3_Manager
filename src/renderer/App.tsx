import {
  BarChart3,
  Building2,
  CalendarPlus,
  HardHat,
  LogOut,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  UserCog,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { User } from "../domain/types";
import { roleLabels } from "../domain/labels";
import type { AppInfo } from "../shared/contracts";
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
  { key: "customers", label: "Clientes", icon: Users, adminOnly: true },
  { key: "equipment", label: "Equipamentos", icon: Package, adminOnly: true },
  { key: "company", label: "Empresa", icon: Building2, adminOnly: true },
  { key: "users", label: "Usuários", icon: UserCog, adminOnly: true },
];

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>("rentals");
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
    <div className="desktop-window">
      <WindowTitlebar />
      <div className="window-body">
        {!currentUser ? (
          <LoginView appInfo={appInfo} onLogin={setCurrentUser} />
        ) : (
          <AuthenticatedShell
            activeView={activeView}
            appInfo={appInfo}
            currentUser={currentUser}
            onNavigate={setActiveView}
            onLogout={() => setCurrentUser(null)}
          />
        )}
      </div>
    </div>
  );
}

function AuthenticatedShell({
  activeView,
  appInfo,
  currentUser,
  onNavigate,
  onLogout,
}: {
  activeView: ViewKey;
  appInfo: AppInfo;
  currentUser: User;
  onNavigate(view: ViewKey): void;
  onLogout(): void;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const visibleNav = navItems.filter(
    (item) => !item.adminOnly || currentUser.role === "ADMIN",
  );

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

      <main className="workspace" data-active-view={activeView}>
        {activeView === "rentals" && <RentalsView />}
        {activeView === "launch" && <RentalLaunchView />}
        {activeView === "customers" && <CustomersView />}
        {activeView === "equipment" && <EquipmentView />}
        {activeView === "company" && <CompanyView />}
        {activeView === "users" && <UsersView />}
      </main>
    </div>
    </TooltipProvider>
  );
}
