import { ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { roleLabels } from "../../domain/labels";
import {
  normalizeUsername,
  normalizeUsernameDraft,
} from "../../domain/normalization";
import type { User } from "../../domain/types";
import type { UserInput } from "../../shared/contracts";
import {
  AppButton,
  EmptyState,
  Field,
  Message,
  Modal,
  PageHeader,
  SectionCard,
  SelectField,
  StatusBadge,
} from "../components/Form";

const emptyForm: UserInput = { username: "", password: "", role: "USER" };

export function UsersView() {
  const [rows, setRows] = useState<User[]>([]);
  const [form, setForm] = useState<UserInput>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void load();
  }, []);
  async function load() {
    try {
      setRows(await window.a3.listUsers());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível carregar os usuários.",
      );
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const normalizedForm = {
      ...form,
      username: normalizeUsername(form.username),
    };
    setForm(normalizedForm);
    try {
      await window.a3.createUser(normalizedForm);
      setForm(emptyForm);
      setFormOpen(false);
      setMessage("Usuário criado com sucesso.");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível criar o usuário.",
      );
    }
  }

  return (
    <section className="view view-medium" data-screen="users">
      <PageHeader
        title="Usuários"
        description="Operadores cadastrados e perfil de acesso."
        action={
          <AppButton
            variant="primary"
            icon={<UserPlus size={18} />}
            type="button"
            onClick={() => {
              setError("");
              setFormOpen(true);
            }}
          >
            Novo usuário
          </AppButton>
        }
      />
      {message && <Message kind="success">{message}</Message>}
      {!formOpen && error && <Message kind="error">{error}</Message>}
      <SectionCard
        className="data-section"
        title={`${rows.length} usuário${rows.length === 1 ? "" : "s"}`}
        description="Contas cadastradas neste ambiente local."
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={<UsersRound size={25} />}
            title="Nenhum usuário encontrado"
            description="Crie uma conta para iniciar o controle de acesso."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
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
                    <td data-label="Usuário">
                      <strong>{user.username}</strong>
                    </td>
                    <td data-label="Perfil">
                      <span className="role-cell">
                        <ShieldCheck size={16} />
                        {roleLabels[user.role]}
                      </span>
                    </td>
                    <td data-label="Status">
                      <StatusBadge kind={user.active ? "success" : "neutral"}>
                        {user.active ? "Ativo" : "Inativo"}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
      {formOpen && (
        <Modal
          className="user-form-modal"
          title="Novo usuário"
          description="Defina as credenciais e o perfil de acesso."
          onClose={() => setFormOpen(false)}
          footer={
            <>
              <AppButton
                type="button"
                variant="ghost"
                onClick={() => setFormOpen(false)}
              >
                Cancelar
              </AppButton>
              <AppButton type="submit" variant="primary" form="user-form">
                Criar usuário
              </AppButton>
            </>
          }
        >
          <form id="user-form" className="dialog-form" onSubmit={submit}>
            <Field
              required
              label="Usuário"
              placeholder="NOME DO USUÁRIO"
              value={form.username}
              onBlur={() =>
                setForm((current) => ({
                  ...current,
                  username: normalizeUsername(current.username),
                }))
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  username: normalizeUsernameDraft(e.target.value),
                })
              }
            />
            <Field
              required
              autoComplete="new-password"
              label="Senha"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <SelectField
              label="Perfil"
              value={form.role}
              onChange={(e) =>
                setForm({ ...form, role: e.target.value as UserInput["role"] })
              }
            >
              <option value="USER">Usuário</option>
              <option value="ADMIN">Administrador</option>
            </SelectField>
            {error && <Message kind="error">{error}</Message>}
          </form>
        </Modal>
      )}
    </section>
  );
}
