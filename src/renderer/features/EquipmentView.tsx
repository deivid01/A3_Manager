import { Archive, Edit, Save, Search, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { formatCents, parseMoneyToCents } from "../../domain/money";
import type { Equipment } from "../../domain/types";
import { EquipmentInput } from "../../shared/contracts";
import { EmptyState, Field, Message } from "../components/Form";

interface EquipmentForm {
  name: string;
  equipmentValue: string;
  unitIndemnificationValue: string;
  stockQuantity: string;
}

const emptyForm: EquipmentForm = {
  name: "",
  equipmentValue: "",
  unitIndemnificationValue: "",
  stockQuantity: "0"
};

export function EquipmentView() {
  const [rows, setRows] = useState<Equipment[]>([]);
  const [form, setForm] = useState<EquipmentForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load(nextSearch = search) {
    setRows(await window.a3.listEquipment(nextSearch));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      const input: EquipmentInput = {
        name: form.name,
        equipmentValueCents: parseMoneyToCents(form.equipmentValue),
        unitIndemnificationValueCents: parseMoneyToCents(form.unitIndemnificationValue),
        stockQuantity: Number(form.stockQuantity)
      };
      if (editingId) {
        await window.a3.updateEquipment(editingId, input);
        setMessage("Equipamento atualizado com sucesso.");
      } else {
        await window.a3.createEquipment(input);
        setMessage("Equipamento cadastrado com sucesso.");
      }
      resetForm();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar o equipamento.");
    }
  }

  function edit(equipment: Equipment) {
    setEditingId(equipment.id);
    setForm({
      name: equipment.name,
      equipmentValue: formatCents(equipment.equipmentValueCents),
      unitIndemnificationValue: formatCents(equipment.unitIndemnificationValueCents),
      stockQuantity: String(equipment.stockQuantity)
    });
  }

  async function archive(id: string) {
    await window.a3.archiveEquipment(id);
    setMessage("Equipamento arquivado.");
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
          <h1>Equipamentos</h1>
          <p>Estoque e valores de indenização.</p>
        </div>
      </header>

      <div className="split-layout">
        <form className="panel form-grid" onSubmit={submit}>
          <h2>{editingId ? "Editar equipamento" : "Novo equipamento"}</h2>
          <Field label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Field label="Valor do equipamento" value={form.equipmentValue} onChange={(e) => setForm({ ...form, equipmentValue: e.target.value })} />
          <Field label="Indenização unitária" value={form.unitIndemnificationValue} onChange={(e) => setForm({ ...form, unitIndemnificationValue: e.target.value })} />
          <Field label="Estoque" type="number" min="0" value={form.stockQuantity} onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })} />
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
                placeholder="Buscar equipamento"
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
            <EmptyState>Nenhum equipamento encontrado.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Estoque</th>
                    <th>Indenização</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((equipment) => (
                    <tr key={equipment.id}>
                      <td>{equipment.name}</td>
                      <td>{equipment.stockQuantity}</td>
                      <td>{formatCents(equipment.unitIndemnificationValueCents)}</td>
                      <td className="row-actions">
                        <button className="icon-button" type="button" title="Editar" onClick={() => edit(equipment)}>
                          <Edit size={17} />
                        </button>
                        <button className="icon-button danger" type="button" title="Arquivar" onClick={() => void archive(equipment.id)}>
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
