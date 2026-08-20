import { Archive, Check, Edit3, Eraser, RotateCcw, SearchX, UserPlus } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import {
  customerTypeLabels,
  getCustomerDisplayName,
  getCustomerPrimaryDocument,
} from "../../domain/customerDisplay";
import { formatCep, formatCnpj, formatCpf } from "../../domain/normalization";
import { CUSTOMER_TYPES, type Customer, type CustomerType } from "../../domain/types";
import type { CustomerInput } from "../../shared/contracts";
import {
  AppButton,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Message,
  Modal,
  PageHeader,
  SearchField,
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

const emptyForm: CustomerInput = {
  customerType: "PF",
  name: "",
  cpf: "",
  rg: "",
  legalName: "",
  tradeName: "",
  cnpj: "",
  stateRegistration: "",
  street: "",
  neighborhood: "",
  number: "",
  cep: "",
  city: "",
  state: "",
  contact: "",
};

export function CustomersView({ draftUserId }: { draftUserId: string }) {
  const [rows, setRows] = useState<Customer[]>([]);
  const [form, setForm] = useState<CustomerInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBaseline, setEditBaseline] = useState<CustomerInput | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Customer | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const createDraftKey = buildDraftKey(draftUserId, "customers:create");
  const activeDraftKey = editingId
    ? buildDraftKey(draftUserId, `customers:edit:${editingId}`)
    : createDraftKey;
  const draftIsMeaningful = editingId && editBaseline
    ? hasCustomerFormChanged(form, editBaseline)
    : isMeaningfulCustomerForm(form);

  useStoredDraft({
    key: activeDraftKey,
    value: form,
    meaningful: Boolean(draftIsMeaningful),
  });

  useEffect(() => {
    void load("");
  }, []);

  async function load(nextSearch = search) {
    try {
      setRows(await window.a3.listCustomers(nextSearch));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível carregar os clientes.",
      );
    }
  }

  function startCreate() {
    setEditingId(null);
    setEditBaseline(null);
    const restored = readStoredDraft(
      getSessionDraftStorage(),
      createDraftKey,
      isCustomerInputDraft,
    );
    setForm(restored ?? emptyForm);
    if (restored) setMessage("Rascunho restaurado.");
    setError("");
    setFormOpen(true);
  }

  function startEdit(customer: Customer) {
    const baseline = customerToForm(customer);
    const draftKey = buildDraftKey(draftUserId, `customers:edit:${customer.id}`);
    const restored = readStoredDraft(
      getSessionDraftStorage(),
      draftKey,
      isCustomerInputDraft,
    );
    setEditingId(customer.id);
    setEditBaseline(baseline);
    setForm(restored ?? baseline);
    if (restored) setMessage("Rascunho restaurado.");
    setError("");
    setFormOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (editingId) {
        await window.a3.updateCustomer(editingId, form);
        setMessage("Cliente atualizado com sucesso.");
      } else {
        await window.a3.createCustomer(form);
        setMessage("Cliente cadastrado com sucesso.");
      }
      removeStoredDraft(getSessionDraftStorage(), activeDraftKey);
      setForm(emptyForm);
      setEditingId(null);
      setEditBaseline(null);
      setFormOpen(false);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível salvar o cliente.",
      );
    }
  }

  function clearCurrentForm() {
    if (editingId && editBaseline) {
      setForm(editBaseline);
      removeStoredDraft(getSessionDraftStorage(), activeDraftKey);
      setError("");
      return;
    }

    if (!isMeaningfulCustomerForm(form)) {
      resetCreateForm();
      return;
    }

    setClearConfirm(true);
  }

  function resetCreateForm() {
    setForm(emptyForm);
    setError("");
    setClearConfirm(false);
    removeStoredDraft(getSessionDraftStorage(), createDraftKey);
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    try {
      await window.a3.archiveCustomer(archiveTarget.id);
      setMessage("Cliente arquivado.");
      setArchiveTarget(null);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível arquivar o cliente.",
      );
    }
  }

  return (
    <section className="view" data-screen="customers">
      <PageHeader
        title="Clientes"
        description="Locatários, documentos, contato e endereço."
        action={
          <AppButton
            variant="primary"
            icon={<UserPlus size={18} />}
            type="button"
            onClick={startCreate}
          >
            Novo cliente
          </AppButton>
        }
      />
      {message && <Message kind="success">{message}</Message>}
      {!formOpen && error && <Message kind="error">{error}</Message>}

      <SectionCard
        className="data-section"
        title={`${rows.length} cliente${rows.length === 1 ? "" : "s"}`}
        description="Registros ativos disponíveis para novas locações."
        action={
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Buscar por nome, CPF ou CNPJ"
            onSearch={() => void load()}
          />
        }
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={<SearchX size={24} />}
            title="Nenhum cliente encontrado"
            description="Ajuste a busca ou cadastre um novo cliente."
            action={
              <AppButton type="button" variant="ghost" onClick={startCreate}>
                Cadastrar cliente
              </AppButton>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Documento</th>
                  <th>Contato</th>
                  <th>Cidade</th>
                  <th className="action-column">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((customer) => (
                  <CustomerRow
                    customer={customer}
                    key={customer.id}
                    onArchive={() => setArchiveTarget(customer)}
                    onEdit={() => startEdit(customer)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {formOpen && (
        <Modal
          className="customer-form-modal"
          wide
          title={editingId ? "Editar cliente" : "Novo cliente"}
          description="Dados cadastrais e endereço do locatário."
          onClose={() => setFormOpen(false)}
          footer={
            <>
              <AppButton
                type="button"
                variant="ghost"
                icon={editingId ? <RotateCcw size={17} /> : <Eraser size={17} />}
                onClick={clearCurrentForm}
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
              <AppButton type="submit" variant="primary" form="customer-form">
                Salvar cliente
              </AppButton>
            </>
          }
        >
          <form id="customer-form" className="dialog-form" onSubmit={submit}>
            <CustomerTypeSelector
              value={form.customerType}
              onChange={(customerType) => setForm(selectCustomerType(form, customerType))}
            />
            <div className="form-section">
              <h3>Identificação</h3>
              {form.customerType === "PF" ? (
                <div className="form-grid two">
                  <Field
                    label="Nome completo"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                  <Field
                    label="CPF"
                    value={form.cpf}
                    onChange={(e) =>
                      setForm({ ...form, cpf: formatCpf(e.target.value) })
                    }
                  />
                  <Field
                    label="RG"
                    value={form.rg}
                    onChange={(e) => setForm({ ...form, rg: e.target.value })}
                  />
                  <Field
                    label="Contato"
                    value={form.contact}
                    onChange={(e) =>
                      setForm({ ...form, contact: e.target.value })
                    }
                  />
                </div>
              ) : (
                <div className="form-grid two">
                  <Field
                    label="Razão social"
                    value={form.legalName}
                    onChange={(e) =>
                      setForm({ ...form, legalName: e.target.value })
                    }
                  />
                  <Field
                    label="Nome fantasia"
                    value={form.tradeName}
                    onChange={(e) =>
                      setForm({ ...form, tradeName: e.target.value })
                    }
                  />
                  <Field
                    label="CNPJ"
                    value={form.cnpj}
                    onChange={(e) =>
                      setForm({ ...form, cnpj: formatCnpj(e.target.value) })
                    }
                  />
                  <Field
                    label="Inscrição estadual"
                    value={form.stateRegistration}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        stateRegistration: e.target.value,
                      })
                    }
                  />
                  <Field
                    label="Contato"
                    value={form.contact}
                    onChange={(e) =>
                      setForm({ ...form, contact: e.target.value })
                    }
                  />
                </div>
              )}
            </div>
            <div className="form-section">
              <h3>Endereço</h3>
              <div className="form-grid address">
                <Field
                  className="span-two"
                  label="Rua"
                  value={form.street}
                  onChange={(e) => setForm({ ...form, street: e.target.value })}
                />
                <Field
                  label="Número"
                  value={form.number}
                  onChange={(e) => setForm({ ...form, number: e.target.value })}
                />
                <Field
                  label="Bairro"
                  value={form.neighborhood}
                  onChange={(e) =>
                    setForm({ ...form, neighborhood: e.target.value })
                  }
                />
                <Field
                  label="CEP"
                  value={form.cep}
                  onChange={(e) =>
                    setForm({ ...form, cep: formatCep(e.target.value) })
                  }
                />
                <Field
                  label="Cidade"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
                <UfSelect
                  allowEmpty
                  value={form.state}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      state: e.target.value as CustomerInput["state"],
                    })
                  }
                />
              </div>
            </div>
            {error && <Message kind="error">{error}</Message>}
          </form>
        </Modal>
      )}
      {archiveTarget && (
        <ConfirmDialog
          title="Arquivar cliente?"
          description={`${getCustomerDisplayName(archiveTarget)} deixará de aparecer nos cadastros ativos.`}
          confirmLabel="Arquivar"
          onClose={() => setArchiveTarget(null)}
          onConfirm={() => void confirmArchive()}
        />
      )}
      {clearConfirm && (
        <ConfirmDialog
          title="Limpar os dados deste cliente?"
          description="Os dados preenchidos e o rascunho atual serão removidos."
          confirmLabel="Limpar"
          onClose={() => setClearConfirm(false)}
          onConfirm={resetCreateForm}
        >
          <p className="confirm-copy">
            Essa ação não altera clientes já salvos.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}

function CustomerRow({
  customer,
  onArchive,
  onEdit,
}: {
  customer: Customer;
  onArchive(): void;
  onEdit(): void;
}) {
  const document = getCustomerPrimaryDocument(customer);
  const documentText = document.value
    ? `${document.label} ${document.value}`
    : "Não informado";

  return (
    <tr>
      <td data-label="Cliente">
        <strong>{getCustomerDisplayName(customer)}</strong>
      </td>
      <td data-label="Documento">{documentText}</td>
      <td data-label="Contato">{customer.contact || "Não informado"}</td>
      <td data-label="Cidade">
        {[customer.city, customer.state].filter(Boolean).join(" / ") ||
          "Não informado"}
      </td>
      <td data-label="Ações" className="row-actions">
        <IconButton type="button" title="Editar cliente" onClick={onEdit}>
          <Edit3 size={17} />
        </IconButton>
        <IconButton
          className="danger"
          type="button"
          title="Arquivar cliente"
          onClick={onArchive}
        >
          <Archive size={17} />
        </IconButton>
      </td>
    </tr>
  );
}

function CustomerTypeSelector({
  value,
  onChange,
}: {
  value: CustomerType;
  onChange(value: CustomerType): void;
}) {
  return (
    <div className="choice-group">
      <span className="field-label">Tipo de cliente</span>
      <div className="form-grid two">
        {CUSTOMER_TYPES.map((customerType) => (
          <button
            className={
              value === customerType ? "choice-button selected" : "choice-button"
            }
            key={customerType}
            type="button"
            onClick={() => onChange(customerType)}
          >
            <span>{customerTypeLabels[customerType]}</span>
            {value === customerType && <Check size={16} />}
          </button>
        ))}
      </div>
    </div>
  );
}

function customerToForm(customer: Customer): CustomerInput {
  return {
    customerType: customer.customerType,
    name: customer.name,
    cpf: customer.cpf,
    rg: customer.rg,
    legalName: customer.legalName,
    tradeName: customer.tradeName,
    cnpj: customer.cnpj,
    stateRegistration: customer.stateRegistration,
    street: customer.street,
    neighborhood: customer.neighborhood,
    number: customer.number,
    cep: customer.cep,
    city: customer.city,
    state: customer.state as CustomerInput["state"],
    contact: customer.contact,
  };
}

function selectCustomerType(
  form: CustomerInput,
  customerType: CustomerType,
): CustomerInput {
  if (customerType === "PJ") {
    return {
      ...form,
      customerType,
      name: "",
      cpf: "",
      rg: "",
    };
  }

  return {
    ...form,
    customerType,
    legalName: "",
    tradeName: "",
    cnpj: "",
    stateRegistration: "",
  };
}

function isMeaningfulCustomerForm(form: CustomerInput): boolean {
  return Boolean(
    form.name.trim() ||
      form.cpf.trim() ||
      form.rg.trim() ||
      form.legalName.trim() ||
      form.tradeName.trim() ||
      form.cnpj.trim() ||
      form.stateRegistration.trim() ||
      form.street.trim() ||
      form.neighborhood.trim() ||
      form.number.trim() ||
      form.cep.trim() ||
      form.city.trim() ||
      form.contact.trim(),
  );
}

function hasCustomerFormChanged(
  form: CustomerInput,
  baseline: CustomerInput,
): boolean {
  return JSON.stringify(form) !== JSON.stringify(baseline);
}

function isCustomerInputDraft(value: unknown): value is CustomerInput {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<Record<keyof CustomerInput, unknown>>;
  return (
    (draft.customerType === "PF" || draft.customerType === "PJ") &&
    typeof draft.name === "string" &&
    typeof draft.cpf === "string" &&
    typeof draft.rg === "string" &&
    typeof draft.legalName === "string" &&
    typeof draft.tradeName === "string" &&
    typeof draft.cnpj === "string" &&
    typeof draft.stateRegistration === "string" &&
    typeof draft.street === "string" &&
    typeof draft.neighborhood === "string" &&
    typeof draft.number === "string" &&
    typeof draft.cep === "string" &&
    typeof draft.city === "string" &&
    typeof draft.state === "string" &&
    typeof draft.contact === "string"
  );
}
