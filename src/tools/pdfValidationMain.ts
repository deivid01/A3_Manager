import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { app } from "electron";
import { ApplicationService } from "../application/ApplicationService";
import { SqlJsDatabase } from "../infrastructure/database/SqlJsDatabase";
import { ElectronPrintService } from "../infrastructure/printing/ElectronPrintService";

void app
  .whenReady()
  .then(async () => {
    const outputPath =
      process.argv[2] ?? path.join(process.cwd(), "output", "pdf", "a3-manager-validation.pdf");
    const itemCount = Math.max(1, Number(process.argv[3] ?? 18) || 18);
    const tempDir = path.join(process.cwd(), "tmp", "pdfs");
    fs.mkdirSync(tempDir, { recursive: true });

    const db = await SqlJsDatabase.open(path.join(tempDir, `validation-${Date.now()}.sqlite`));
    const service = new ApplicationService(db);
    await service.initialize();
    const user = await service.login({ username: "system dev", password: ["_", "int", "@", "383"].join("") });

    service.saveCompany({
      legalName: "A3 Locação de Equipamentos para Construção Ltda.",
      tradeName: "A3 Locação",
      document: "12.345.678/0001-90",
      street: "Avenida dos Equipamentos",
      neighborhood: "Centro",
      number: "1000",
      cep: "01001-000",
      city: "São Paulo",
      state: "SP",
      contact: "(11) 3333-0000",
      email: "contato@a3locacao.com.br"
    });

    const customer = service.createCustomer({
      customerType: "PF",
      name: "Carlos Henrique da Silva",
      cpf: "529.982.247-25",
      rg: "45.123.987-0",
      legalName: "",
      tradeName: "",
      cnpj: "",
      stateRegistration: "",
      street: "Rua das Obras",
      neighborhood: "Jardim Paulista",
      number: "250",
      cep: "01310-000",
      city: "São Paulo",
      state: "SP",
      contact: "(11) 98888-7777"
    });

    const items = Array.from({ length: itemCount }, (_, index) => {
      const equipment = service.createEquipment({
        name: `Equipamento de validação ${String(index + 1).padStart(2, "0")}`,
        dailyRateCents: 90000 + index * 1000,
        weeklyRateCents: 100000 + index * 1000,
        biweeklyRateCents: 110000 + index * 1000,
        monthlyRateCents: 120000 + index * 1000,
        unitIndemnificationValueCents: 15000 + index * 100,
        stockQuantity: 4
      });
      return { equipmentId: equipment.id, quantity: index % 2 === 0 ? 2 : 1 };
    });

    const rental = service.launchRental(
      {
        customerId: customer.id,
        period: "MONTHLY",
        startDate: "2026-08-14",
        items,
        deliveryStreet: "Rua da Entrega",
        deliveryNeighborhood: "Vila Construção",
        deliveryNumber: "80",
        deliveryCep: "04567-000",
        deliveryCity: "São Paulo",
        deliveryState: "SP",
        paymentMethod: "CREDIT_CARD",
        installments: 3,
        clientRequestId: randomUUID()
      },
      user.id
    );

    const pdfPath = await new ElectronPrintService().savePdfToPath(rental, outputPath);
    console.log(JSON.stringify({ pdfPath, rentalCode: rental.code, items: rental.items.length }));
    db.close();
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.quit();
    process.exitCode = 1;
  });
