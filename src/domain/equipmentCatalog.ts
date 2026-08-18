export interface DefaultEquipmentCatalogItem {
  id: string;
  name: string;
  dailyRateCents: number;
  weeklyRateCents: number;
  biweeklyRateCents: number;
  monthlyRateCents: number;
  unitIndemnificationValueCents: number;
}

export const DEFAULT_EQUIPMENT_CATALOG: DefaultEquipmentCatalogItem[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    name: "ANDAIMES",
    dailyRateCents: 900,
    weeklyRateCents: 1000,
    biweeklyRateCents: 1100,
    monthlyRateCents: 1200,
    unitIndemnificationValueCents: 23000,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "PLATAFORMA",
    dailyRateCents: 900,
    weeklyRateCents: 1000,
    biweeklyRateCents: 1100,
    monthlyRateCents: 1200,
    unitIndemnificationValueCents: 23000,
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    name: "RODAS",
    dailyRateCents: 900,
    weeklyRateCents: 1000,
    biweeklyRateCents: 1100,
    monthlyRateCents: 1200,
    unitIndemnificationValueCents: 20000,
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    name: "LIXADEIRA",
    dailyRateCents: 8000,
    weeklyRateCents: 16000,
    biweeklyRateCents: 20000,
    monthlyRateCents: 25000,
    unitIndemnificationValueCents: 200000,
  },
  {
    id: "00000000-0000-4000-8000-000000000005",
    name: "MARTELETE 5 KG",
    dailyRateCents: 15000,
    weeklyRateCents: 45000,
    biweeklyRateCents: 50000,
    monthlyRateCents: 60000,
    unitIndemnificationValueCents: 200000,
  },
  {
    id: "00000000-0000-4000-8000-000000000006",
    name: "MARTELETE 10 KG",
    dailyRateCents: 13000,
    weeklyRateCents: 40000,
    biweeklyRateCents: 50000,
    monthlyRateCents: 60000,
    unitIndemnificationValueCents: 200000,
  },
  {
    id: "00000000-0000-4000-8000-000000000007",
    name: "BETONEIRA 400 L",
    dailyRateCents: 10000,
    weeklyRateCents: 15000,
    biweeklyRateCents: 22000,
    monthlyRateCents: 28000,
    unitIndemnificationValueCents: 600000,
  },
  {
    id: "00000000-0000-4000-8000-000000000008",
    name: "BETONEIRA 200 L",
    dailyRateCents: 10000,
    weeklyRateCents: 15000,
    biweeklyRateCents: 22000,
    monthlyRateCents: 26000,
    unitIndemnificationValueCents: 500000,
  },
  {
    id: "00000000-0000-4000-8000-000000000009",
    name: "VAP",
    dailyRateCents: 8000,
    weeklyRateCents: 16000,
    biweeklyRateCents: 25000,
    monthlyRateCents: 40000,
    unitIndemnificationValueCents: 150000,
  },
  {
    id: "00000000-0000-4000-8000-000000000010",
    name: "SERRA CIRCULAR",
    dailyRateCents: 8000,
    weeklyRateCents: 16000,
    biweeklyRateCents: 25000,
    monthlyRateCents: 35000,
    unitIndemnificationValueCents: 200000,
  },
];
