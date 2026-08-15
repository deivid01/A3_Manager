import { Eye, EyeOff, LogIn } from "lucide-react";
import { FormEvent, useState } from "react";
import { normalizeUsername } from "../../domain/normalization";
import type { AppInfo } from "../../shared/contracts";
import type { User } from "../../domain/types";
import { Field, Message } from "../components/Form";

export function LoginView({
  appInfo,
  onLogin
}: {
  appInfo: AppInfo;
  onLogin(user: User): void;
}) {
  const [username, setUsername] = useState("SYSTEM DEV");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const user = await window.a3.login({ username, password });
      onLogin(user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível entrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-screen">
      <section className="login-panel">
        <img src="/logo-A3.jpg" alt="A3 Manager" />
        <h1>A3 Manager</h1>
        <p>Gestão local de locações e equipamentos</p>
        <form onSubmit={submit}>
          <Field
            autoFocus
            label="Usuário"
            value={username}
            onChange={(event) => setUsername(normalizeUsername(event.target.value))}
          />
          <label className="field password-field">
            <span>Senha</span>
            <input
              value={password}
              type={showPassword ? "text" : "password"}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              className="icon-button inside"
              type="button"
              title={showPassword ? "Ocultar senha" : "Mostrar senha"}
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </label>
          {error && <Message kind="error">{error}</Message>}
          <button className="primary-button" disabled={loading} type="submit">
            <LogIn size={18} />
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
        <footer>
          <span>Versão {appInfo.version}</span>
          <button type="button" onClick={() => window.a3.openExternal(appInfo.developerUrl)}>
            Feito por Deivid Peres
          </button>
        </footer>
      </section>
    </main>
  );
}
