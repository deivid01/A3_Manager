import { Save } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { formatCep } from "../../domain/normalization";
import { CompanyInput } from "../../shared/contracts";
import { Field, Message, UfSelect } from "../components/Form";

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
  email: ""
};

export function CompanyView() {
  const [form, setForm] = useState<CompanyInput>(emptyForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    window.a3
      .getCompany()
      .then((company) =>
        setForm({
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
          email: company.email
        })
      )
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Falha ao carregar empresa."));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const saved = await window.a3.saveCompany(form);
      setForm({ ...form, state: saved.state as CompanyInput["state"] });
      setMessage("Dados da empresa atualizados.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar a empresa.");
    }
  }

  return (
    <section className="view narrow">
      <header className="view-header">
        <div>
          <h1>Empresa</h1>
          <p>Dados usados nos contratos e PDFs.</p>
        </div>
      </header>
      <form className="panel form-grid" onSubmit={submit}>
        <Field label="Razão social" value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} />
        <Field label="Nome fantasia" value={form.tradeName} onChange={(e) => setForm({ ...form, tradeName: e.target.value })} />
        <Field label="Documento" value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
        <Field label="Contato" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
        <Field label="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Field label="Rua" value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
        <Field label="Número" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
        <Field label="Bairro" value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} />
        <Field label="CEP" value={form.cep} onChange={(e) => setForm({ ...form, cep: formatCep(e.target.value) })} />
        <Field label="Cidade" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        <UfSelect value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value as CompanyInput["state"] })} />
        {error && <Message kind="error">{error}</Message>}
        {message && <Message kind="success">{message}</Message>}
        <button className="primary-button" type="submit">
          <Save size={18} />
          Salvar empresa
        </button>
      </form>
    </section>
  );
}
