import { Building2, PlugZap, RefreshCw, RotateCcw, Save, Server } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { formatCep } from "../../domain/normalization";
import type {
  A20sSyncConfigInput,
  A20sSyncPublicConfig,
  CompanyInput,
  SyncStatus,
} from "../../shared/contracts";
import {
  AppButton,
  Field,
  Message,
  PageHeader,
  SectionCard,
  StatusBadge,
  UfSelect,
} from "../components/Form";
import {
  buildDraftKey,
  getSessionDraftStorage,
  readStoredDraft,
  removeStoredDraft,
  useStoredDraft,
} from "../lib/formDrafts";

const emptyForm: CompanyInput = {
  legalName: "",
  tradeName: "",
  document: "",
  street: "",
  neighborhood: "",
  number: "",
  cep: "",
  city: "",
  state: "SP",
  contact: "",
  email: "",
};

const emptySyncForm: A20sSyncConfigInput = {
  baseUrl: "http://10.155.37.230:3000",
  database: "a3_manager",
  token: "",
};

export function CompanyView({ draftUserId }: { draftUserId: string }) {
  const [form, setForm] = useState<CompanyInput>(emptyForm);
  const [baseline, setBaseline] = useState<CompanyInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const draftKey = buildDraftKey(draftUserId, "company:edit");
  const hasChanges = Boolean(baseline && hasCompanyFormChanged(form, baseline));

  useStoredDraft({
    key: draftKey,
    value: form,
    meaningful: hasChanges,
  });

  useEffect(() => {
    window.a3
      .getCompany()
      .then((company) => {
        const loaded: CompanyInput = {
          legalName: company.legalName,
          tradeName: company.tradeName,
          document: company.document,
          street: company.street,
          neighborhood: company.neighborhood,
          number: company.number,
          cep: company.cep,
          city: company.city,
          state: company.state as CompanyInput["state"],
          contact: company.contact,
          email: company.email,
        };
        const restored = readStoredDraft(
          getSessionDraftStorage(),
          draftKey,
          isCompanyInputDraft,
        );
        setBaseline(loaded);
        setForm(restored ?? loaded);
        if (restored) setMessage("Rascunho restaurado.");
      })
      .catch((caught) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "Falha ao carregar a empresa.",
        ),
      );
  }, [draftKey]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const saved = await window.a3.saveCompany(form);
      const savedForm = { ...form, state: saved.state as CompanyInput["state"] };
      setForm(savedForm);
      setBaseline(savedForm);
      removeStoredDraft(getSessionDraftStorage(), draftKey);
      setMessage("Dados da empresa atualizados.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível salvar a empresa.",
      );
    } finally {
      setSaving(false);
    }
  }

  function discardChanges() {
    if (!baseline) return;
    setForm(baseline);
    setError("");
    removeStoredDraft(getSessionDraftStorage(), draftKey);
  }

  return (
    <section className="view view-medium" data-screen="company">
      <PageHeader
        title="Empresa"
        description="Dados usados nos contratos e PDFs."
      />
      <form className="company-form" onSubmit={submit}>
        <SectionCard
          title="Identidade empresarial"
          description="Informações fiscais e canais de contato."
        >
          <div className="form-grid two">
            <Field
              required
              label="Razão social"
              value={form.legalName}
              onChange={(e) => setForm({ ...form, legalName: e.target.value })}
            />
            <Field
              required
              label="Nome fantasia"
              value={form.tradeName}
              onChange={(e) => setForm({ ...form, tradeName: e.target.value })}
            />
            <Field
              required
              label="CNPJ / CPF"
              value={form.document}
              onChange={(e) => setForm({ ...form, document: e.target.value })}
            />
            <Field
              required
              label="Contato"
              value={form.contact}
              onChange={(e) => setForm({ ...form, contact: e.target.value })}
            />
            <Field
              className="span-two"
              label="E-mail"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
        </SectionCard>
        <SectionCard
          title="Endereço"
          description="Localização apresentada nos documentos emitidos."
        >
          <div className="form-grid address">
            <Field
              required
              className="span-two"
              label="Rua"
              value={form.street}
              onChange={(e) => setForm({ ...form, street: e.target.value })}
            />
            <Field
              required
              label="Número"
              value={form.number}
              onChange={(e) => setForm({ ...form, number: e.target.value })}
            />
            <Field
              required
              label="Bairro"
              value={form.neighborhood}
              onChange={(e) =>
                setForm({ ...form, neighborhood: e.target.value })
              }
            />
            <Field
              required
              label="CEP"
              value={form.cep}
              onChange={(e) =>
                setForm({ ...form, cep: formatCep(e.target.value) })
              }
            />
            <Field
              required
              label="Cidade"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
            <UfSelect
              value={form.state}
              onChange={(e) =>
                setForm({
                  ...form,
                  state: e.target.value as CompanyInput["state"],
                })
              }
            />
          </div>
        </SectionCard>
        {error && <Message kind="error">{error}</Message>}
        {message && <Message kind="success">{message}</Message>}
        <div className="form-submit-row">
          <span>
            <Building2 size={17} /> Alterações futuras serão refletidas nos
            próximos documentos.
          </span>
          <div className="form-submit-actions">
            <AppButton
              variant="ghost"
              icon={<RotateCcw size={18} />}
              type="button"
              disabled={!hasChanges}
              onClick={discardChanges}
            >
              Desfazer alterações
            </AppButton>
            <AppButton
              variant="primary"
              icon={<Save size={18} />}
              loading={saving}
              type="submit"
            >
              Salvar empresa
            </AppButton>
          </div>
        </div>
      </form>
      <A20sSyncSection />
    </section>
  );
}

function A20sSyncSection() {
  const [config, setConfig] = useState<A20sSyncPublicConfig | null>(null);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [form, setForm] = useState<A20sSyncConfigInput>(emptySyncForm);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    window.a3
      .getA20sConfig()
      .then((loaded) => {
        if (!active) return;
        setConfig(loaded);
        setForm({
          baseUrl: loaded.baseUrl,
          database: loaded.database,
          token: "",
        });
      })
      .catch((caught) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "Falha ao carregar a configuração A20s.",
        ),
      );
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const saved = await window.a3.saveA20sConfig(form);
      setConfig(saved);
      setForm({ baseUrl: saved.baseUrl, database: saved.database, token: "" });
      setMessage("Configuração A20s salva.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível salvar a configuração A20s.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setError("");
    setMessage("");
    setTesting(true);
    try {
      const result = await window.a3.testA20sConnection(form);
      if (result.ok) {
        setMessage(result.message);
      } else {
        setError(result.message);
      }
    } finally {
      setTesting(false);
    }
  }

  async function syncNow() {
    setError("");
    setMessage("");
    setSyncing(true);
    try {
      const nextStatus = await window.a3.syncNow();
      setStatus(nextStatus);
      if (nextStatus.state === "online") {
        setMessage("Sincronização concluída.");
      } else if (nextStatus.lastErrorMessage) {
        setError(nextStatus.lastErrorMessage);
      }
    } finally {
      setSyncing(false);
    }
  }

  return (
    <SectionCard
      title="Servidor A20s"
      description="DB API via ZeroTier para o espelho sincronizado."
      action={
        status && (
          <StatusBadge kind={syncBadgeKind(status)}>
            {syncStatusLabel(status)}
          </StatusBadge>
        )
      }
    >
      <form className="sync-config-form" id="a20s-sync-form" onSubmit={submit}>
        <div className="form-grid two">
          <Field
            required
            className="span-two"
            label="URL do servidor"
            value={form.baseUrl}
            onChange={(event) =>
              setForm({ ...form, baseUrl: event.target.value })
            }
          />
          <Field
            required
            label="Nome do banco"
            value={form.database}
            onChange={(event) =>
              setForm({ ...form, database: event.target.value })
            }
          />
          <Field
            label="Token da API"
            type="password"
            autoComplete="new-password"
            value={form.token ?? ""}
            hint={
              config?.tokenConfigured
                ? "Token configurado; deixe em branco para preservar."
                : "Token necessário para /v1/databases, query e execute."
            }
            onChange={(event) =>
              setForm({ ...form, token: event.target.value })
            }
          />
        </div>
      </form>

      <div className="sync-config-status">
        <span>
          <Server size={17} />
          {statusSummary(status, config)}
        </span>
      </div>

      {error && <Message kind="error">{error}</Message>}
      {message && <Message kind="success">{message}</Message>}

      <div className="form-submit-row">
        <span>
          <RefreshCw size={17} />
          {status?.pendingCount
            ? `${status.pendingCount} alteração${
                status.pendingCount === 1 ? "" : "ões"
              } pendente${status.pendingCount === 1 ? "" : "s"}`
            : "Sem alterações pendentes"}
        </span>
        <div className="form-submit-actions">
          <AppButton
            variant="ghost"
            icon={<PlugZap size={18} />}
            loading={testing}
            type="button"
            onClick={testConnection}
          >
            Testar conexão
          </AppButton>
          <AppButton
            variant="secondary"
            icon={<RefreshCw size={18} />}
            loading={syncing}
            type="button"
            onClick={syncNow}
          >
            Sincronizar agora
          </AppButton>
          <AppButton
            variant="primary"
            icon={<Save size={18} />}
            loading={saving}
            type="submit"
            form="a20s-sync-form"
          >
            Salvar
          </AppButton>
        </div>
      </div>
    </SectionCard>
  );
}

function hasCompanyFormChanged(
  form: CompanyInput,
  baseline: CompanyInput,
): boolean {
  return JSON.stringify(form) !== JSON.stringify(baseline);
}

function isCompanyInputDraft(value: unknown): value is CompanyInput {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<Record<keyof CompanyInput, unknown>>;
  return (
    typeof draft.legalName === "string" &&
    typeof draft.tradeName === "string" &&
    typeof draft.document === "string" &&
    typeof draft.street === "string" &&
    typeof draft.neighborhood === "string" &&
    typeof draft.number === "string" &&
    typeof draft.cep === "string" &&
    typeof draft.city === "string" &&
    typeof draft.state === "string" &&
    typeof draft.contact === "string" &&
    typeof draft.email === "string"
  );
}

function syncStatusLabel(status: SyncStatus): string {
  const labels: Record<SyncStatus["state"], string> = {
    not_configured: "A20s não configurado",
    online: "Online",
    syncing: "Sincronizando",
    offline: "Offline",
    pending: "Alterações pendentes",
    error: "Erro de sincronização",
  };
  return labels[status.state];
}

function syncBadgeKind(
  status: SyncStatus,
): "success" | "warning" | "danger" | "neutral" {
  if (status.state === "online") return "success";
  if (status.state === "syncing" || status.state === "pending") return "warning";
  if (status.state === "error") return "danger";
  return "neutral";
}

function statusSummary(
  status: SyncStatus | null,
  config: A20sSyncPublicConfig | null,
): string {
  if (!status) {
    return config?.tokenConfigured ? "Token configurado." : "Token ausente.";
  }
  if (status.lastSuccessfulSyncAt) {
    return `Última sincronização: ${new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(status.lastSuccessfulSyncAt))}`;
  }
  return config?.tokenConfigured ? "Aguardando primeira sincronização." : "Token ausente.";
}
