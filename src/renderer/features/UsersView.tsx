import { Edit3, Eraser, RotateCcw, ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { roleLabels } from "../../domain/labels";
import {
  normalizeUsername,
  normalizeUsernameDraft,
} from "../../domain/normalization";
import type { User } from "../../domain/types";
import type { UserInput, UserUpdateInput } from "../../shared/contracts";
import {
  AppButton,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Message,
  Modal,
  PageHeader,
  SectionCard,
  SelectField,
  StatusBadge,
} from "../components/Form";
import {
  buildDraftKey,
  getSessionDraftStorage,
  readStoredDraft,
  removeStoredDraft,
  useStoredDraft,
} from "../lib/formDrafts";

interface UserForm {
  username: string;
  password: string;
  role: UserInput["role"];
  active: boolean;
}

const emptyForm: UserForm = { username: "", password: "", role: "USER", active: true };
type UserCreateDraft = Pick<UserForm, "username" | "role">;

export function UsersView({ draftUserId }: { draftUserId: string }) {
  const [rows, setRows] = useState<User[]>([]);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBaseline, setEditBaseline] = useState<UserForm | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const createDraftKey = buildDraftKey(draftUserId, "users:create");
  const userDraft = toUserCreateDraft(form);

  useStoredDraft({
    key: createDraftKey,
    value: userDraft,
    meaningful: !editingId && isMeaningfulUserDraft(userDraft),
  });

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

  function startCreate() {
    setEditingId(null);
    setEditBaseline(null);
    const restored = readStoredDraft(
      getSessionDraftStorage(),
      createDraftKey,
      isUserCreateDraft,
    );
    setForm(restored ? { ...restored, password: "", active: true } : emptyForm);
    if (restored) setMessage("Rascunho restaurado.");
    setError("");
    setFormOpen(true);
  }

  function startEdit(user: User) {
    const baseline = userToForm(user);
    setEditingId(user.id);
    setEditBaseline(baseline);
    setForm(baseline);
    setError("");
    setMessage("");
    setFormOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const normalizedForm: UserForm = {
      ...form,
      username: normalizeUsername(form.username),
    };
    setForm(normalizedForm);
    try {
      if (editingId) {
        const input: UserUpdateInput = {
          username: normalizedForm.username,
          password: normalizedForm.password,
          role: normalizedForm.role,
          active: normalizedForm.active,
        };
        await window.a3.updateUser(editingId, input);
        setMessage("Usuário atualizado com sucesso.");
      } else {
        const input: UserInput = {
          username: normalizedForm.username,
          password: normalizedForm.password,
          role: normalizedForm.role,
        };
        await window.a3.createUser(input);
        removeStoredDraft(getSessionDraftStorage(), createDraftKey);
        setMessage("Usuário criado com sucesso.");
      }
      setForm(emptyForm);
      setEditingId(null);
      setEditBaseline(null);
      setFormOpen(false);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível salvar o usuário.",
      );
    }
  }

  function requestClearForm() {
    if (editingId && editBaseline) {
      setForm(editBaseline);
      setError("");
      return;
    }

    if (!hasUserFormContent(form)) {
      resetCreateForm();
      return;
    }

    setClearConfirm(true);
  }

  function resetCreateForm() {
    setForm(emptyForm);
    setEditingId(null);
    setEditBaseline(null);
    setError("");
    setClearConfirm(false);
    removeStoredDraft(getSessionDraftStorage(), createDraftKey);
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
            onClick={startCreate}
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
                  <th className="action-column">Ações</th>
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
                    <td data-label="Ações" className="row-actions">
                      <IconButton
                        type="button"
                        title="Editar usuário"
                        onClick={() => startEdit(user)}
                      >
                        <Edit3 size={17} />
                      </IconButton>
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
          title={editingId ? "Editar usuário" : "Novo usuário"}
          description={
            editingId
              ? "Atualize identificação, perfil, status ou nova senha."
              : "Defina as credenciais e o perfil de acesso."
          }
          onClose={() => setFormOpen(false)}
          footer={
            <>
              <AppButton
                type="button"
                variant="ghost"
                icon={editingId ? <RotateCcw size={17} /> : <Eraser size={17} />}
                onClick={requestClearForm}
              >
                {editingId ? "Desfazer alterações" : "Limpar"}
              </AppButton>
              <AppButton
                type="button"
                variant="ghost"
                onClick={() => setFormOpen(false)}
              >
                Cancelar
              </AppButton>
              <AppButton type="submit" variant="primary" form="user-form">
                {editingId ? "Salvar usuário" : "Criar usuário"}
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
              required={!editingId}
              autoComplete="new-password"
              label="Senha"
              type="password"
              hint={editingId ? "Deixe em branco para preservar a senha atual." : undefined}
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
            {editingId && (
              <SelectField
                label="Status"
                value={form.active ? "ACTIVE" : "INACTIVE"}
                onChange={(e) =>
                  setForm({ ...form, active: e.target.value === "ACTIVE" })
                }
              >
                <option value="ACTIVE">Ativo</option>
                <option value="INACTIVE">Inativo</option>
              </SelectField>
            )}
            {error && <Message kind="error">{error}</Message>}
          </form>
        </Modal>
      )}
      {clearConfirm && (
        <ConfirmDialog
          title="Limpar os dados deste usuário?"
          description="Os dados preenchidos e o rascunho atual serão removidos."
          confirmLabel="Limpar"
          onClose={() => setClearConfirm(false)}
          onConfirm={resetCreateForm}
        >
          <p className="confirm-copy">
            A senha digitada será descartada e não é salva em rascunhos.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}

function userToForm(user: User): UserForm {
  return {
    username: user.username,
    password: "",
    role: user.role,
    active: user.active,
  };
}

function toUserCreateDraft(form: UserForm): UserCreateDraft {
  return {
    username: form.username,
    role: form.role,
  };
}

function isMeaningfulUserDraft(draft: UserCreateDraft): boolean {
  return Boolean(draft.username.trim() || draft.role !== "USER");
}

function hasUserFormContent(form: UserForm): boolean {
  return Boolean(
    form.username.trim() ||
      form.password.trim() ||
      form.role !== "USER" ||
      !form.active,
  );
}

function isUserCreateDraft(value: unknown): value is UserCreateDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<Record<keyof UserCreateDraft, unknown>>;
  return (
    typeof draft.username === "string" &&
    (draft.role === "USER" || draft.role === "ADMIN")
  );
}
