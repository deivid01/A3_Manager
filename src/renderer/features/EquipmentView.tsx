import { Archive, Edit3, PackagePlus, SearchX } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { formatCents, parseMoneyToCents } from "../../domain/money";
import type { Equipment } from "../../domain/types";
import type { EquipmentInput } from "../../shared/contracts";
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
  StatusBadge,
} from "../components/Form";

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
  stockQuantity: "0",
};

export function EquipmentView() {
  const [rows, setRows] = useState<Equipment[]>([]);
  const [form, setForm] = useState<EquipmentForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Equipment | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void load("");
  }, []);

  async function load(nextSearch = search) {
    try {
      setRows(await window.a3.listEquipment(nextSearch));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível carregar os equipamentos.",
      );
    }
  }

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setFormOpen(true);
  }
  function startEdit(equipment: Equipment) {
    setEditingId(equipment.id);
    setForm({
      name: equipment.name,
      equipmentValue: formatCents(equipment.equipmentValueCents),
      unitIndemnificationValue: formatCents(
        equipment.unitIndemnificationValueCents,
      ),
      stockQuantity: String(equipment.stockQuantity),
    });
    setError("");
    setFormOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const input: EquipmentInput = {
        name: form.name,
        equipmentValueCents: parseMoneyToCents(form.equipmentValue),
        unitIndemnificationValueCents: parseMoneyToCents(
          form.unitIndemnificationValue,
        ),
        stockQuantity: Number(form.stockQuantity),
      };
      if (editingId) {
        await window.a3.updateEquipment(editingId, input);
        setMessage("Equipamento atualizado com sucesso.");
      } else {
        await window.a3.createEquipment(input);
        setMessage("Equipamento cadastrado com sucesso.");
      }
      setFormOpen(false);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível salvar o equipamento.",
      );
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    try {
      await window.a3.archiveEquipment(archiveTarget.id);
      setMessage("Equipamento arquivado.");
      setArchiveTarget(null);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível arquivar o equipamento.",
      );
    }
  }

  return (
    <section className="view" data-screen="equipment">
      <PageHeader
        eyebrow="Catálogo e estoque"
        title="Equipamentos"
        description="Acompanhe disponibilidade, patrimônio e valores de indenização."
        action={
          <AppButton
            variant="primary"
            icon={<PackagePlus size={18} />}
            type="button"
            onClick={startCreate}
          >
            Novo equipamento
          </AppButton>
        }
      />
      {message && <Message kind="success">{message}</Message>}
      {!formOpen && error && <Message kind="error">{error}</Message>}
      <SectionCard
        className="data-section"
        title={`${rows.length} equipamento${rows.length === 1 ? "" : "s"}`}
        description="Itens ativos no catálogo de locação."
        action={
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Buscar equipamento"
            onSearch={() => void load()}
          />
        }
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={<SearchX size={24} />}
            title="Nenhum equipamento encontrado"
            description="Ajuste a busca ou adicione o primeiro item ao catálogo."
            action={
              <AppButton type="button" variant="ghost" onClick={startCreate}>
                Cadastrar equipamento
              </AppButton>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Equipamento</th>
                  <th>Disponibilidade</th>
                  <th>Valor patrimonial</th>
                  <th>Indenização unitária</th>
                  <th className="action-column">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((equipment) => (
                  <tr key={equipment.id}>
                    <td data-label="Equipamento">
                      <strong>{equipment.name}</strong>
                    </td>
                    <td data-label="Disponibilidade">
                      <StatusBadge
                        kind={
                          equipment.stockQuantity > 0 ? "success" : "danger"
                        }
                      >
                        {equipment.stockQuantity > 0
                          ? `${equipment.stockQuantity} em estoque`
                          : "Sem estoque"}
                      </StatusBadge>
                    </td>
                    <td data-label="Valor patrimonial">
                      {formatCents(equipment.equipmentValueCents)}
                    </td>
                    <td data-label="Indenização">
                      {formatCents(equipment.unitIndemnificationValueCents)}
                    </td>
                    <td data-label="Ações" className="row-actions">
                      <IconButton
                        type="button"
                        title="Editar equipamento"
                        onClick={() => startEdit(equipment)}
                      >
                        <Edit3 size={17} />
                      </IconButton>
                      <IconButton
                        className="danger"
                        type="button"
                        title="Arquivar equipamento"
                        onClick={() => setArchiveTarget(equipment)}
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
          className="equipment-form-modal"
          title={editingId ? "Editar equipamento" : "Novo equipamento"}
          description="Defina o item, o estoque e os valores comerciais."
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
              <AppButton type="submit" variant="primary" form="equipment-form">
                Salvar equipamento
              </AppButton>
            </>
          }
        >
          <form id="equipment-form" className="dialog-form" onSubmit={submit}>
            <div className="form-grid two">
              <Field
                required
                className="span-two"
                label="Nome do equipamento"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <Field
                required
                label="Valor do equipamento"
                value={form.equipmentValue}
                onChange={(e) =>
                  setForm({ ...form, equipmentValue: e.target.value })
                }
              />
              <Field
                required
                label="Indenização unitária"
                value={form.unitIndemnificationValue}
                onChange={(e) =>
                  setForm({ ...form, unitIndemnificationValue: e.target.value })
                }
              />
              <Field
                required
                label="Quantidade em estoque"
                min="0"
                type="number"
                value={form.stockQuantity}
                onChange={(e) =>
                  setForm({ ...form, stockQuantity: e.target.value })
                }
              />
            </div>
            {error && <Message kind="error">{error}</Message>}
          </form>
        </Modal>
      )}
      {archiveTarget && (
        <ConfirmDialog
          title="Arquivar equipamento?"
          description={`${archiveTarget.name} deixará de aparecer nas novas locações.`}
          confirmLabel="Arquivar"
          onClose={() => setArchiveTarget(null)}
          onConfirm={() => void confirmArchive()}
        />
      )}
    </section>
  );
}
