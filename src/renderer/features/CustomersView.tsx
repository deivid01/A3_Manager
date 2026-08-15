import { Archive, Edit, Save, Search, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { formatCep, formatCpf } from "../../domain/normalization";
import type { Customer } from "../../domain/types";
import { CustomerInput } from "../../shared/contracts";
import { EmptyState, Field, Message, UfSelect } from "../components/Form";

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
  contact: ""
};

export function CustomersView() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [form, setForm] = useState<CustomerInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load(nextSearch = search) {
    setRows(await window.a3.listCustomers(nextSearch));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      if (editingId) {
        await window.a3.updateCustomer(editingId, form);
        setMessage("Cliente atualizado com sucesso.");
      } else {
        await window.a3.createCustomer(form);
        setMessage("Cliente cadastrado com sucesso.");
      }
      resetForm();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar o cliente.");
    }
  }

  function edit(customer: Customer) {
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
      contact: customer.contact
    });
  }

  async function archive(id: string) {
    await window.a3.archiveCustomer(id);
    setMessage("Cliente arquivado.");
    await load();
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  return (
    <section className="view">
      <header className="view-header">
        <div>
          <h1>Clientes</h1>
          <p>Cadastro administrativo de locatários.</p>
        </div>
      </header>

      <div className="split-layout">
        <form className="panel form-grid" onSubmit={submit}>
          <h2>{editingId ? "Editar cliente" : "Novo cliente"}</h2>
          <Field label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Field label="CPF" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: formatCpf(e.target.value) })} />
          <Field label="RG" value={form.rg} onChange={(e) => setForm({ ...form, rg: e.target.value })} />
          <Field label="Contato" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
          <Field label="Rua" value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
          <Field label="Número" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
          <Field label="Bairro" value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} />
          <Field label="CEP" value={form.cep} onChange={(e) => setForm({ ...form, cep: formatCep(e.target.value) })} />
          <Field label="Cidade" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <UfSelect value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value as CustomerInput["state"] })} />
          {error && <Message kind="error">{error}</Message>}
          {message && <Message kind="success">{message}</Message>}
          <div className="actions">
            <button className="primary-button" type="submit">
              <Save size={18} />
              Salvar
            </button>
            {editingId && (
              <button className="ghost-button" type="button" onClick={resetForm}>
                <X size={18} />
                Cancelar
              </button>
            )}
          </div>
        </form>

        <div className="panel">
          <div className="toolbar">
            <label className="search-field">
              <Search size={17} />
              <input
                placeholder="Buscar por nome ou CPF"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void load()}
              />
            </label>
            <button className="icon-button" type="button" title="Buscar" onClick={() => void load()}>
              <Search size={18} />
            </button>
          </div>
          {rows.length === 0 ? (
            <EmptyState>Nenhum cliente encontrado.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>CPF</th>
                    <th>Cidade</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((customer) => (
                    <tr key={customer.id}>
                      <td>{customer.name}</td>
                      <td>{customer.cpf}</td>
                      <td>{customer.city}</td>
                      <td className="row-actions">
                        <button className="icon-button" type="button" title="Editar" onClick={() => edit(customer)}>
                          <Edit size={17} />
                        </button>
                        <button className="icon-button danger" type="button" title="Arquivar" onClick={() => void archive(customer.id)}>
                          <Archive size={17} />
                        </button>
                      </td>
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
