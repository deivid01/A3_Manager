import { Save } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { normalizeUsername } from "../../domain/normalization";
import type { User } from "../../domain/types";
import { UserInput } from "../../shared/contracts";
import { EmptyState, Field, Message, SelectField } from "../components/Form";
import { roleLabels } from "../../domain/labels";

const emptyForm: UserInput = {
  username: "",
  password: "",
  role: "USER"
};

export function UsersView() {
  const [rows, setRows] = useState<User[]>([]);
  const [form, setForm] = useState<UserInput>(emptyForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setRows(await window.a3.listUsers());
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await window.a3.createUser(form);
      setForm(emptyForm);
      setMessage("Usuário criado com sucesso.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível criar o usuário.");
    }
  }

  return (
    <section className="view narrow">
      <header className="view-header">
        <div>
          <h1>Usuários</h1>
          <p>Cadastro de operadores do sistema.</p>
        </div>
      </header>

      <div className="split-layout">
        <form className="panel form-grid" onSubmit={submit}>
          <h2>Novo usuário</h2>
          <Field
            label="Usuário"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: normalizeUsername(e.target.value) })}
          />
          <Field
            label="Senha"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <SelectField label="Perfil" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserInput["role"] })}>
            <option value="USER">Usuário</option>
            <option value="ADMIN">Administrador</option>
          </SelectField>
          {error && <Message kind="error">{error}</Message>}
          {message && <Message kind="success">{message}</Message>}
          <button className="primary-button" type="submit">
            <Save size={18} />
            Criar usuário
          </button>
        </form>

        <div className="panel">
          {rows.length === 0 ? (
            <EmptyState>Nenhum usuário encontrado.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Usuário</th>
                    <th>Perfil</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((user) => (
                    <tr key={user.id}>
                      <td>{user.username}</td>
                      <td>{roleLabels[user.role]}</td>
                      <td>{user.active ? "Ativo" : "Inativo"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
