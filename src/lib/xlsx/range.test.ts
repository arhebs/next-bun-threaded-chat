import { describe, expect, it } from "bun:test";

import {
  MAX_RANGE_CELLS,
  columnLettersToNumber,
  columnNumberToLetters,
  normalizeA1Cell,
  normalizeA1Range,
  parseA1Cell,
  parseRange,
  selectionToA1Range,
  toA1Cell,
} from "@/lib/xlsx/range";

describe("xlsx range helpers", () => {
  it("converts column letters to numbers", () => {
    expect(columnLettersToNumber("A")).toBe(1);
    expect(columnLettersToNumber("Z")).toBe(26);
    expect(columnLettersToNumber("AA")).toBe(27);
    expect(columnLettersToNumber("az")).toBe(52);
    expect(columnLettersToNumber("XFD")).toBe(16384);
  });

  it("converts column numbers to letters", () => {
    expect(columnNumberToLetters(1)).toBe("A");
    expect(columnNumberToLetters(26)).toBe("Z");
    expect(columnNumberToLetters(27)).toBe("AA");
    expect(columnNumberToLetters(52)).toBe("AZ");
    expect(columnNumberToLetters(53)).toBe("BA");
    expect(columnNumberToLetters(16384)).toBe("XFD");
  });

  it("parses and normalizes A1 cells", () => {
    expect(parseA1Cell("B2")).toEqual({ row: 2, col: 2 });
    expect(parseA1Cell(" $b$2 ")).toEqual({ row: 2, col: 2 });
    expect(normalizeA1Cell("$b$2")).toBe("B2");
    expect(toA1Cell({ row: 2, col: 2 })).toBe("B2");
  });

  it("rejects cells outside Excel bounds", () => {
    expect(() => parseA1Cell("A0")).toThrow();
    expect(() => parseA1Cell("XFE1")).toThrow();
    expect(() => parseA1Cell("A1048577")).toThrow();
  });

  it("parses ranges and normalizes endpoints", () => {
    const parsed = parseRange("B2:A1");
    expect(parsed.normalized).toBe("A1:B2");
    expect(parsed.width).toBe(2);
    expect(parsed.height).toBe(2);
    expect(parsed.cellCount).toBe(4);

    expect(parseRange("A1").normalized).toBe("A1");
    expect(normalizeA1Range("a1:a1")).toBe("A1");
  });

  it("rejects sheet-qualified ranges", () => {
    expect(() => parseRange("Sheet1!A1:B2")).toThrow(
      "Pass sheet separately"
    );
  });

  it("enforces max cell limits", () => {
    expect(MAX_RANGE_CELLS).toBeGreaterThan(0);
    expect(() => parseRange("A1:B2", { maxCells: 3 })).toThrow(
      "exceeding limit"
    );
  });

  it("converts grid selections into A1 ranges", () => {
    expect(
      selectionToA1Range("A1:F10", {
        startRowIndex: 1,
        startColIndex: 0,
        endRowIndex: 1,
        endColIndex: 2,
      })
    ).toBe("A2:C2");

    expect(
      selectionToA1Range("B2:D4", {
        startRowIndex: 0,
        startColIndex: 1,
        endRowIndex: 0,
        endColIndex: 1,
      })
    ).toBe("C2");

    expect(() =>
      selectionToA1Range("A1:B2", {
        startRowIndex: 0,
        startColIndex: 0,
        endRowIndex: 5,
        endColIndex: 0,
      })
    ).toThrow("Selection exceeds base range");
  });
});
