export type RentalPrintLayoutMode = "NORMAL" | "COMPACT";

export interface PrintLayoutMeasurement {
  contentHeight: number;
  usablePageHeight: number;
}

const SMALL_OVERFLOW_RATIO = 0.18;

export function countMeasuredPages(measurement: PrintLayoutMeasurement): number {
  if (measurement.usablePageHeight <= 0) return 1;
  return Math.max(1, Math.ceil(measurement.contentHeight / measurement.usablePageHeight));
}

export function trailingPageHeight(measurement: PrintLayoutMeasurement): number {
  const pages = countMeasuredPages(measurement);
  if (pages <= 1) return 0;
  const trailing = measurement.contentHeight % measurement.usablePageHeight;
  return trailing === 0 ? measurement.usablePageHeight : trailing;
}

export function shouldTryCompactLayout(
  measurement: PrintLayoutMeasurement,
): boolean {
  const pages = countMeasuredPages(measurement);
  if (pages !== 2) return false;
  return trailingPageHeight(measurement) <= measurement.usablePageHeight * SMALL_OVERFLOW_RATIO;
}

export function selectRentalPrintLayout(
  normalMeasurement: PrintLayoutMeasurement,
  compactMeasurement?: PrintLayoutMeasurement,
): RentalPrintLayoutMode {
  if (countMeasuredPages(normalMeasurement) <= 1) return "NORMAL";
  if (!shouldTryCompactLayout(normalMeasurement)) return "NORMAL";
  if (!compactMeasurement) return "NORMAL";
  return countMeasuredPages(compactMeasurement) <= 1 ? "COMPACT" : "NORMAL";
}
