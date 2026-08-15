import { Eye, EyeOff, LockKeyhole, LogIn, UserRound } from "lucide-react";
import { type FormEvent, useState } from "react";
import { normalizeUsername } from "../../domain/normalization";
import type { User } from "../../domain/types";
import type { AppInfo } from "../../shared/contracts";
import { AppButton, Field, IconButton, Message } from "../components/Form";

export function LoginView({
  appInfo,
  onLogin,
}: {
  appInfo: AppInfo;
  onLogin(user: User): void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      onLogin(await window.a3.login({ username, password }));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Não foi possível entrar.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-screen">
      <div className="login-brand-field" aria-hidden="true">
        <span>A3</span>
        <small>LOCAÇÃO</small>
      </div>

      <section className="login-panel">
        <header className="login-header">
          <div className="login-logo-stage">
            <img
              src={`${import.meta.env.BASE_URL}logo-A3.jpg`}
              alt="A3 Locação"
            />
          </div>
          <span className="eyebrow">Acesso operacional</span>
          <h1>A3 Manager</h1>
          <p>Locações, equipamentos e estoque em um só ambiente.</p>
        </header>

        <form onSubmit={submit} className="login-form">
          <Field
            autoFocus
            autoComplete="username"
            label="Usuário"
            placeholder="Digite seu usuário"
            leadingIcon={<UserRound size={18} />}
            value={username}
            onChange={(event) =>
              setUsername(normalizeUsername(event.target.value))
            }
          />
          <Field
            autoComplete="current-password"
            label="Senha"
            placeholder="Digite sua senha"
            leadingIcon={<LockKeyhole size={18} />}
            trailingAction={
              <IconButton
                className="field-icon-button"
                type="button"
                title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </IconButton>
            }
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {error && <Message kind="error">{error}</Message>}
          <AppButton
            className="login-submit"
            disabled={!username || !password}
            icon={<LogIn size={18} />}
            loading={loading}
            type="submit"
            variant="primary"
          >
            {loading ? "Verificando acesso" : "Entrar no A3 Manager"}
          </AppButton>
        </form>

        <footer className="login-footer">
          <span>
            {appInfo.version
              ? `Versão ${appInfo.version}`
              : "Versão carregando"}
          </span>
          <button
            type="button"
            onClick={() => window.a3.openExternal(appInfo.developerUrl)}
          >
            Feito por Deivid Peres
          </button>
        </footer>
      </section>
    </main>
  );
}
