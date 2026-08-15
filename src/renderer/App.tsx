import {
  Building2,
  FileText,
  LogOut,
  Package,
  PlusCircle,
  Settings,
  Users
} from "lucide-react";
import { useEffect, useState } from "react";
import type { AppInfo } from "../shared/contracts";
import type { User } from "../domain/types";
import { roleLabels } from "../domain/labels";
import { LoginView } from "./features/LoginView";
import { CompanyView } from "./features/CompanyView";
import { CustomersView } from "./features/CustomersView";
import { EquipmentView } from "./features/EquipmentView";
import { RentalLaunchView } from "./features/RentalLaunchView";
import { RentalsView } from "./features/RentalsView";
import { UsersView } from "./features/UsersView";

type ViewKey = "rentals" | "launch" | "customers" | "equipment" | "company" | "users";

const navItems: Array<{ key: ViewKey; label: string; icon: typeof FileText; adminOnly?: boolean }> = [
  { key: "rentals", label: "Relatórios", icon: FileText },
  { key: "launch", label: "Nova locação", icon: PlusCircle },
  { key: "customers", label: "Clientes", icon: Users, adminOnly: true },
  { key: "equipment", label: "Equipamentos", icon: Package, adminOnly: true },
  { key: "company", label: "Empresa", icon: Building2, adminOnly: true },
  { key: "users", label: "Usuários", icon: Settings, adminOnly: true }
];

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>("rentals");
  const [appInfo, setAppInfo] = useState<AppInfo>({
    name: "A3 Manager",
    version: "",
    developerUrl: "https://github.com/deivid01"
  });

  useEffect(() => {
    window.a3.appInfo().then(setAppInfo).catch(() => undefined);
  }, []);

  if (!currentUser) {
    return <LoginView appInfo={appInfo} onLogin={setCurrentUser} />;
  }

  const visibleNav = navItems.filter((item) => !item.adminOnly || currentUser.role === "ADMIN");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}logo-A3.jpg`} alt="A3 Manager" />
          <div>
            <strong>A3 Manager</strong>
            <span>{appInfo.version ? `v${appInfo.version}` : "Versão carregando"}</span>
          </div>
        </div>
        <nav aria-label="Navegação principal">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={activeView === item.key ? "nav-button active" : "nav-button"}
                key={item.key}
                onClick={() => setActiveView(item.key)}
                title={item.label}
                type="button"
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div>
            <strong>{currentUser.username}</strong>
            <span>{roleLabels[currentUser.role]}</span>
          </div>
          <button className="icon-button" onClick={() => setCurrentUser(null)} title="Sair" type="button">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <main className="content">
        {activeView === "rentals" && <RentalsView />}
        {activeView === "launch" && <RentalLaunchView />}
        {activeView === "customers" && <CustomersView />}
        {activeView === "equipment" && <EquipmentView />}
        {activeView === "company" && <CompanyView />}
        {activeView === "users" && <UsersView />}
        <footer className="app-footer">
          <span>{appInfo.name}</span>
          <button type="button" onClick={() => window.a3.openExternal(appInfo.developerUrl)}>
            Feito por Deivid Peres
          </button>
        </footer>
      </main>
    </div>
  );
}
