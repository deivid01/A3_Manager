import { describe, expect, it } from "vitest";
import { createTestService, validEquipment } from "./helpers";

describe("busca de equipamentos", () => {
  it("encontra termos normalizados em qualquer parte do nome", async () => {
    const { service } = await createTestService();

    const equipment = service.createEquipment({
      ...validEquipment,
      name: "EQUIPAMENTO TESTE",
    });
    service.createEquipment({
      ...validEquipment,
      name: "BETONEIRA PROFISSIONAL 400L",
    });
    service.createEquipment({
      ...validEquipment,
      name: "MARTELO DEMOLIDOR",
    });

    expect(service.searchEquipment("teste")[0]?.id).toBe(equipment.id);
    expect(service.searchEquipment("equipamento")[0]?.id).toBe(equipment.id);
    expect(service.searchEquipment("equipamento teste")[0]?.id).toBe(equipment.id);
    expect(service.searchEquipment("teste equipamento")[0]?.id).toBe(equipment.id);
    expect(service.searchEquipment("profissional")[0]?.name).toBe("BETONEIRA PROFISSIONAL 400L");
    expect(service.searchEquipment("demolidor")[0]?.name).toBe("MARTELO DEMOLIDOR");
  });

  it("normaliza acentos e limita a busca do seletor", async () => {
    const { service } = await createTestService();

    for (let index = 0; index < 12; index += 1) {
      service.createEquipment({
        ...validEquipment,
        name: `SERRA RÁPIDA ${String(index + 1).padStart(2, "0")}`,
      });
    }

    expect(service.searchEquipment("rápida")).toHaveLength(10);
    expect(service.searchEquipment("rapida").map((item) => item.name)).toContain("SERRA RÁPIDA 01");
    expect(service.searchEquipment("x")).toEqual([]);
    expect(service.searchEquipment("inexistente")).toEqual([]);
  });
});
