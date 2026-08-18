import { Archive, Edit3, Eraser, PackagePlus, RotateCcw, SearchX } from "lucide-react";
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
import {
  buildDraftKey,
  getSessionDraftStorage,
  readStoredDraft,
  removeStoredDraft,
  useStoredDraft,
} from "../lib/formDrafts";

interface EquipmentForm {
  name: string;
  dailyRate: string;
  weeklyRate: string;
  biweeklyRate: string;
  monthlyRate: string;
  unitIndemnificationValue: string;
  stockQuantity: string;
}
const emptyForm: EquipmentForm = {
  name: "",
  dailyRate: "",
  weeklyRate: "",
  biweeklyRate: "",
  monthlyRate: "",
  unitIndemnificationValue: "",
  stockQuantity: "0",
};

export function EquipmentView({ draftUserId }: { draftUserId: string }) {
  const [rows, setRows] = useState<Equipment[]>([]);
  const [form, setForm] = useState<EquipmentForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBaseline, setEditBaseline] = useState<EquipmentForm | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Equipment | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const createDraftKey = buildDraftKey(draftUserId, "equipment:create");
  const activeDraftKey = editingId
    ? buildDraftKey(draftUserId, `equipment:edit:${editingId}`)
    : createDraftKey;
  const draftIsMeaningful = editingId && editBaseline
    ? hasEquipmentFormChanged(form, editBaseline)
    : isMeaningfulEquipmentForm(form);

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
    setEditBaseline(null);
    const restored = readStoredDraft(
      getSessionDraftStorage(),
      createDraftKey,
      isEquipmentFormDraft,
    );
    setForm(restored ?? emptyForm);
    if (restored) setMessage("Rascunho restaurado.");
    setError("");
    setFormOpen(true);
  }
  function startEdit(equipment: Equipment) {
    const baseline = equipmentToForm(equipment);
    const draftKey = buildDraftKey(draftUserId, `equipment:edit:${equipment.id}`);
    const restored = readStoredDraft(
      getSessionDraftStorage(),
      draftKey,
      isEquipmentFormDraft,
    );
    setEditingId(equipment.id);
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
      const input: EquipmentInput = {
        name: form.name,
        dailyRateCents: parseMoneyToCents(form.dailyRate),
        weeklyRateCents: parseMoneyToCents(form.weeklyRate),
        biweeklyRateCents: parseMoneyToCents(form.biweeklyRate),
        monthlyRateCents: parseMoneyToCents(form.monthlyRate),
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
          : "Não foi possível salvar o equipamento.",
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

    if (!isMeaningfulEquipmentForm(form)) {
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
        title="Equipamentos"
        description="Estoque, preços de locação e indenização por unidade."
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
                  <th>Diária</th>
                  <th>Semanal</th>
                  <th>Quinzenal</th>
                  <th>Mensal</th>
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
                    <td data-label="Diária">
                      {formatCents(equipment.dailyRateCents)}
                    </td>
                    <td data-label="Semanal">
                      {formatCents(equipment.weeklyRateCents)}
                    </td>
                    <td data-label="Quinzenal">
                      {formatCents(equipment.biweeklyRateCents)}
                    </td>
                    <td data-label="Mensal">
                      {formatCents(equipment.monthlyRateCents)}
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
          description="Defina o item, o estoque e os preços por período."
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
                label="Valor da diária"
                value={form.dailyRate}
                onChange={(e) =>
                  setForm({ ...form, dailyRate: e.target.value })
                }
              />
              <Field
                required
                label="Valor semanal"
                value={form.weeklyRate}
                onChange={(e) =>
                  setForm({ ...form, weeklyRate: e.target.value })
                }
              />
              <Field
                required
                label="Valor quinzenal"
                value={form.biweeklyRate}
                onChange={(e) =>
                  setForm({ ...form, biweeklyRate: e.target.value })
                }
              />
              <Field
                required
                label="Valor mensal"
                value={form.monthlyRate}
                onChange={(e) =>
                  setForm({ ...form, monthlyRate: e.target.value })
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
      {clearConfirm && (
        <ConfirmDialog
          title="Limpar os dados deste equipamento?"
          description="Os dados preenchidos e o rascunho atual serão removidos."
          confirmLabel="Limpar"
          onClose={() => setClearConfirm(false)}
          onConfirm={resetCreateForm}
        >
          <p className="confirm-copy">
            Essa ação não altera equipamentos já salvos.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}

function equipmentToForm(equipment: Equipment): EquipmentForm {
  return {
    name: equipment.name,
    dailyRate: formatCents(equipment.dailyRateCents),
    weeklyRate: formatCents(equipment.weeklyRateCents),
    biweeklyRate: formatCents(equipment.biweeklyRateCents),
    monthlyRate: formatCents(equipment.monthlyRateCents),
    unitIndemnificationValue: formatCents(
      equipment.unitIndemnificationValueCents,
    ),
    stockQuantity: String(equipment.stockQuantity),
  };
}

function isMeaningfulEquipmentForm(form: EquipmentForm): boolean {
  return Boolean(
    form.name.trim() ||
      form.dailyRate.trim() ||
      form.weeklyRate.trim() ||
      form.biweeklyRate.trim() ||
      form.monthlyRate.trim() ||
      form.unitIndemnificationValue.trim() ||
      form.stockQuantity.trim() !== "0",
  );
}

function hasEquipmentFormChanged(
  form: EquipmentForm,
  baseline: EquipmentForm,
): boolean {
  return JSON.stringify(form) !== JSON.stringify(baseline);
}

function isEquipmentFormDraft(value: unknown): value is EquipmentForm {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<Record<keyof EquipmentForm, unknown>>;
  return (
    typeof draft.name === "string" &&
    typeof draft.dailyRate === "string" &&
    typeof draft.weeklyRate === "string" &&
    typeof draft.biweeklyRate === "string" &&
    typeof draft.monthlyRate === "string" &&
    typeof draft.unitIndemnificationValue === "string" &&
    typeof draft.stockQuantity === "string"
  );
}
