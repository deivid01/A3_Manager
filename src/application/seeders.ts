import type { SqlJsDatabase } from "../infrastructure/database/SqlJsDatabase";

export const systemUser = {
  username: "SYSTEM DEV",
  password: initialSystemPassword(),
  role: "ADMIN" as const
};

function initialSystemPassword(): string {
  return ["_", "int", "@", "383"].join("");
}

export function seedCompany(db: SqlJsDatabase): void {
  const row = db.queryOne("SELECT id FROM company_settings WHERE id = 'default'");
  if (row) {
    return;
  }

  db.execute(
    `INSERT INTO company_settings
      (id, legal_name, trade_name, document, street, neighborhood, number, cep,
       city, state, contact, email, updated_at)
     VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "A3 Locação de Equipamentos para Construção",
      "A3 Locação",
      "Documento a configurar",
      "Endereço a configurar",
      "Bairro a configurar",
      "S/N",
      "00000-000",
      "Cidade",
      "SP",
      "Contato a configurar",
      "",
      new Date().toISOString()
    ]
  );
}
