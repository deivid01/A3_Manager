import { AppError } from "../../domain/appError";
import type { CompanySettings } from "../../domain/types";
import type { SqlJsDatabase } from "../../infrastructure/database/SqlJsDatabase";
import { companyInputSchema, type CompanyInput } from "../../shared/contracts";
import { mapCompany } from "../rowMappers";
import { seedCompany } from "../seeders";
import { parseInput } from "../serviceHelpers";

export class CompanyApplicationService {
  constructor(private readonly db: SqlJsDatabase) {}

  initialize(): void {
    seedCompany(this.db);
  }

  get(): CompanySettings {
    const row = this.db.queryOne(
      "SELECT * FROM company_settings WHERE id = 'default'",
    );
    if (!row) {
      throw new AppError(
        "NOT_FOUND",
        "Configuração da empresa não encontrada.",
      );
    }
    return mapCompany(row);
  }

  save(input: CompanyInput): CompanySettings {
    const data = parseInput(companyInputSchema, input);
    this.db.execute(
      `UPDATE company_settings SET
        legal_name = ?, trade_name = ?, document = ?, street = ?, neighborhood = ?,
        number = ?, cep = ?, city = ?, state = ?, contact = ?, email = ?, updated_at = ?
       WHERE id = 'default'`,
      [
        data.legalName,
        data.tradeName,
        data.document,
        data.street,
        data.neighborhood,
        data.number,
        data.cep,
        data.city,
        data.state,
        data.contact,
        data.email,
        new Date().toISOString(),
      ],
    );
    return this.get();
  }
}
