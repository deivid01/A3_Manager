import { describe, expect, it } from "vitest";
import {
  countMeasuredPages,
  selectRentalPrintLayout,
  shouldTryCompactLayout,
  trailingPageHeight,
} from "../src/infrastructure/printing/printLayoutStrategy";

describe("estratégia adaptativa de impressão", () => {
  it("mantém NORMAL quando o conteúdo cabe em uma página", () => {
    const normal = { contentHeight: 900, usablePageHeight: 1000 };

    expect(countMeasuredPages(normal)).toBe(1);
    expect(selectRentalPrintLayout(normal)).toBe("NORMAL");
  });

  it("usa COMPACT apenas quando resolve uma sobra pequena", () => {
    const normal = { contentHeight: 1080, usablePageHeight: 1000 };
    const compact = { contentHeight: 990, usablePageHeight: 1000 };

    expect(trailingPageHeight(normal)).toBe(80);
    expect(shouldTryCompactLayout(normal)).toBe(true);
    expect(selectRentalPrintLayout(normal, compact)).toBe("COMPACT");
  });

  it("mantém NORMAL para conteúdo multipágina real", () => {
    const normal = { contentHeight: 1900, usablePageHeight: 1000 };
    const compact = { contentHeight: 1600, usablePageHeight: 1000 };

    expect(shouldTryCompactLayout(normal)).toBe(false);
    expect(selectRentalPrintLayout(normal, compact)).toBe("NORMAL");
  });
});
