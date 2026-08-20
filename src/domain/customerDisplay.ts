import type { CustomerType } from "./types";

export interface CustomerDisplaySource {
  customerType?: CustomerType;
  name?: string;
  cpf?: string;
  rg?: string;
  legalName?: string;
  tradeName?: string;
  cnpj?: string;
  stateRegistration?: string;
}

export const customerTypeLabels: Record<CustomerType, string> = {
  PF: "Pessoa Física",
  PJ: "Pessoa Jurídica",
};

export function getCustomerDisplayName(customer: CustomerDisplaySource): string {
  if ((customer.customerType ?? "PF") === "PJ") {
    return firstFilled(customer.tradeName, customer.legalName, customer.cnpj) ?? "Cliente sem identificação";
  }

  return firstFilled(customer.name, customer.cpf) ?? "Cliente sem identificação";
}

export function getCustomerIdentityFields(
  customer: CustomerDisplaySource,
): Array<{ label: string; value: string }> {
  if ((customer.customerType ?? "PF") === "PJ") {
    return [
      { label: "Nome fantasia", value: customer.tradeName?.trim() || "Não informado" },
      { label: "Razão social", value: customer.legalName?.trim() || "Não informado" },
      { label: "CNPJ", value: customer.cnpj?.trim() || "Não informado" },
      {
        label: "Inscrição estadual",
        value: customer.stateRegistration?.trim() || "Não informado",
      },
    ];
  }

  return [
    { label: "Nome", value: customer.name?.trim() || "Não informado" },
    { label: "CPF", value: customer.cpf?.trim() || "Não informado" },
    { label: "RG", value: customer.rg?.trim() || "Não informado" },
  ];
}

export function getCustomerPrimaryDocument(
  customer: CustomerDisplaySource,
): { label: string; value: string } {
  if ((customer.customerType ?? "PF") === "PJ") {
    return { label: "CNPJ", value: customer.cnpj?.trim() ?? "" };
  }

  return { label: "CPF", value: customer.cpf?.trim() ?? "" };
}

function firstFilled(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}
