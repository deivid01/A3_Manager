export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizeUsername(value: string): string {
  return normalizeSearch(value);
}

export function normalizeUsernameDraft(value: string): string {
  return value.toUpperCase();
}

export function formatCpf(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function formatCnpj(value: string): string {
  const digits = onlyDigits(value).slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
    return false;
  }

  const firstDigit = calculateCpfDigit(cpf.slice(0, 9), 10);
  const secondDigit = calculateCpfDigit(cpf.slice(0, 9) + firstDigit, 11);
  return cpf === cpf.slice(0, 9) + firstDigit + secondDigit;
}

export function isValidCnpj(value: string): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) {
    return false;
  }

  const firstDigit = calculateCnpjDigit(cnpj.slice(0, 12), [
    5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2,
  ]);
  const secondDigit = calculateCnpjDigit(cnpj.slice(0, 12) + firstDigit, [
    6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2,
  ]);
  return cnpj === cnpj.slice(0, 12) + firstDigit + secondDigit;
}

export function formatCep(value: string): string {
  return onlyDigits(value).slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");
}

function calculateCpfDigit(base: string, weight: number): string {
  const sum = base
    .split("")
    .reduce((total, digit, index) => total + Number(digit) * (weight - index), 0);
  const remainder = (sum * 10) % 11;
  return remainder === 10 ? "0" : String(remainder);
}

function calculateCnpjDigit(base: string, weights: number[]): string {
  const sum = base
    .split("")
    .reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
  const remainder = sum % 11;
  return remainder < 2 ? "0" : String(11 - remainder);
}
