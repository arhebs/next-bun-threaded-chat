import { normalizeA1Range } from "./range";

export type SheetMention = {
  sheet: string;
  range: string;
  raw: string;
};

const MENTION_REGEX =
  /@([A-Za-z0-9_]+)!((?:\$?[A-Za-z]{1,3}\$?[1-9]\d*)(?::\$?[A-Za-z]{1,3}\$?[1-9]\d*)?)/g;

function normalizeSheetName(sheet: string): string {
  if (sheet.toLowerCase() === "sheet1") {
    return "Sheet1";
  }
  return sheet;
}

export function parseMentions(text: string): SheetMention[] {
  if (!text) {
    return [];
  }

  const mentions: SheetMention[] = [];

  for (const match of text.matchAll(MENTION_REGEX)) {
    const raw = match[0] ?? "";
    const sheetRaw = match[1] ?? "";
    const rangeRaw = match[2] ?? "";

    if (!raw || !sheetRaw || !rangeRaw) {
      continue;
    }

    const sheet = normalizeSheetName(sheetRaw);

    try {
      const range = normalizeA1Range(rangeRaw);
      mentions.push({ sheet, range, raw });
    } catch {
      // Ignore invalid mentions.
    }
  }

  return mentions;
}
