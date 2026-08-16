import { Archive, Edit3, SearchX, UserPlus } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { formatCep, formatCpf } from "../../domain/normalization";
import type { Customer } from "../../domain/types";
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

const emptyForm: CustomerInput = {
  name: "",
  cpf: "",
  rg: "",
  street: "",
  neighborhood: "",
  number: "",
  cep: "",
  city: "",
  state: "SP",
  contact: "",
};

export function CustomersView() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [form, setForm] = useState<CustomerInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Customer | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
    setForm(emptyForm);
    setError("");
    setFormOpen(true);
  }

  function startEdit(customer: Customer) {
    setEditingId(customer.id);
    setForm({
      name: customer.name,
      cpf: customer.cpf,
      rg: customer.rg,
      street: customer.street,
      neighborhood: customer.neighborhood,
      number: customer.number,
      cep: customer.cep,
      city: customer.city,
      state: customer.state as CustomerInput["state"],
      contact: customer.contact,
    });
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
        description="Locatários, CPF, contato e endereço."
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
            placeholder="Buscar por nome ou CPF"
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
                  <th>CPF</th>
                  <th>Contato</th>
                  <th>Cidade</th>
                  <th className="action-column">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((customer) => (
                  <tr key={customer.id}>
                    <td data-label="Cliente">
                      <strong>{customer.name}</strong>
                    </td>
                    <td data-label="CPF">{customer.cpf}</td>
                    <td data-label="Contato">
                      {customer.contact || "Não informado"}
                    </td>
                    <td data-label="Cidade">
                      {customer.city} / {customer.state}
                    </td>
                    <td data-label="Ações" className="row-actions">
                      <IconButton
                        type="button"
                        title="Editar cliente"
                        onClick={() => startEdit(customer)}
                      >
                        <Edit3 size={17} />
                      </IconButton>
                      <IconButton
                        className="danger"
                        type="button"
                        title="Arquivar cliente"
                        onClick={() => setArchiveTarget(customer)}
                      >
                        <Archive size={17} />
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
            <div className="form-section">
              <h3>Identificação</h3>
              <div className="form-grid two">
                <Field
                  required
                  label="Nome completo"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <Field
                  required
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
            </div>
            <div className="form-section">
              <h3>Endereço</h3>
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
          description={`${archiveTarget.name} deixará de aparecer nos cadastros ativos.`}
          confirmLabel="Arquivar"
          onClose={() => setArchiveTarget(null)}
          onConfirm={() => void confirmArchive()}
        />
      )}
    </section>
  );
}
