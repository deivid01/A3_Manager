import { Building2, RotateCcw, Save } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { formatCep } from "../../domain/normalization";
import type { CompanyInput } from "../../shared/contracts";
import {
  AppButton,
  Field,
  Message,
  PageHeader,
  SectionCard,
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
    </section>
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
