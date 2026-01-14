import { describe, expect, it } from "bun:test";

import {
  confirmActionInputSchema,
  confirmActionOutputSchema,
  deleteThreadInputSchema,
  explainFormulaInputSchema,
  parseLooseJson,
  readRangeInputSchema,
  sendInvitesInputSchema,
  sheetNameSchema,
  updateCellInputSchema,
  updateCellPayloadSchema,
} from "@/lib/chat/tool-types";

describe("tool-types", () => {
  it("defaults sheet to Sheet1 for updateCell confirmAction input", () => {
    const parsed = confirmActionInputSchema.safeParse({
      action: "updateCell",
      actionPayload: {
        cell: "A1",
        value: 123,
      },
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.action).toBe("updateCell");
    if (parsed.data.action !== "updateCell") {
      throw new Error("Expected updateCell action");
    }

    if (typeof parsed.data.actionPayload === "string") {
      throw new Error("Expected object actionPayload");
    }

    const payload = updateCellPayloadSchema.safeParse(parsed.data.actionPayload);
    expect(payload.success).toBe(true);
    if (!payload.success) return;

    expect(payload.data.sheet).toBe("Sheet1");
    expect(payload.data.cell).toBe("A1");
    expect(payload.data.value).toBe(123);
  });

  it("accepts JSON string actionPayload and parses booleans/null-ish values", () => {
    const parsed = confirmActionInputSchema.safeParse({
      action: "updateCell",
      actionPayload:
        "{'cell':'B2','value':True,'sheet':'Sheet1','extra':None}",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.action).toBe("updateCell");
    if (parsed.data.action !== "updateCell") {
      throw new Error("Expected updateCell action");
    }

    if (typeof parsed.data.actionPayload !== "string") {
      throw new Error("Expected string actionPayload");
    }

    const parsedJson = parseLooseJson(parsed.data.actionPayload);
    const payload = updateCellPayloadSchema.safeParse(parsedJson);

    expect(payload.success).toBe(true);
    if (!payload.success) return;

    expect(payload.data.sheet).toBe("Sheet1");
    expect(payload.data.cell).toBe("B2");
    expect(payload.data.value).toBe(true);
  });

  it("coerces numeric strings for updateCell values", () => {
    const parsed = updateCellInputSchema.safeParse({
      sheet: "Sheet1",
      cell: "F3",
      value: "850",
      confirmationToken: "token",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.value).toBe(850);

    const preservesLeadingZeros = updateCellInputSchema.safeParse({
      sheet: "Sheet1",
      cell: "F3",
      value: "001",
      confirmationToken: "token",
    });

    expect(preservesLeadingZeros.success).toBe(true);
    if (!preservesLeadingZeros.success) return;

    expect(preservesLeadingZeros.data.value).toBe("001");
  });

  it("rejects non-Sheet1 sheets", () => {
    const parsed = updateCellInputSchema.safeParse({
      sheet: "Sheet2",
      cell: "A1",
      value: "hi",
      confirmationToken: "token",
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts deleteThread tool input without confirmationToken", () => {
    const parsed = deleteThreadInputSchema.safeParse({
      threadId: "thread",
    });

    expect(parsed.success).toBe(true);
  });

  it("validates confirmAction output payload shape", () => {
    const parsed = confirmActionOutputSchema.safeParse({
      approved: false,
      confirmationToken: "token",
      action: "deleteThread",
      actionPayload: { threadId: "abc" },
    });

    expect(parsed.success).toBe(true);
  });

  it("enforces Sheet1 literal schema", () => {
    const parsed = sheetNameSchema.safeParse("Sheet1");
    expect(parsed.success).toBe(true);
  });
});
