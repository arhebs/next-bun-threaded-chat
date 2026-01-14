import { z } from "zod";

import { normalizeA1Cell, normalizeA1Range } from "@/lib/xlsx/range";

export const sheetNameSchema = z.literal("Sheet1");
const sheetNameInputSchema = sheetNameSchema.default("Sheet1");

const A1_CELL_REGEX = /^\$?[A-Za-z]{1,3}\$?[1-9]\d*$/;
const A1_RANGE_REGEX =
  /^\$?[A-Za-z]{1,3}\$?[1-9]\d*(?::\$?[A-Za-z]{1,3}\$?[1-9]\d*)?$/;

export const a1RangeInputSchema = z
  .string()
  .trim()
  .min(1)
  .regex(A1_RANGE_REGEX, "A1 range like A1:C5")
  .describe("A1 range like A1:C5");

export const a1CellInputSchema = z
  .string()
  .trim()
  .min(1)
  .regex(A1_CELL_REGEX, "A1 cell like B2")
  .describe("A1 cell like B2");

function createNormalizedSchema(
  description: string,
  normalize: (value: string) => string
) {
  return z
    .string()
    .min(1)
    .transform((value, ctx) => {
      try {
        return normalize(value);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid value";
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
    })
    .describe(description);
}

export const a1RangeSchema = createNormalizedSchema(
  "A1 range like A1:C5",
  normalizeA1Range
);

export const a1CellSchema = createNormalizedSchema("A1 cell like B2", normalizeA1Cell);

export const cellValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

function coerceNumericString(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }

  if (!/^-?(0|[1-9]\d*)(\.\d+)?$/.test(trimmed)) {
    return value;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return parsed;
}

const updateCellValueSchema = z.preprocess(coerceNumericString, cellValueSchema);

export const updateCellPayloadSchema = z.object({
  sheet: sheetNameSchema,
  cell: a1CellSchema,
  value: updateCellValueSchema,
});

export const deleteThreadPayloadSchema = z.object({
  threadId: z.string().min(1),
});

export const sendInvitesPayloadSchema = z.object({
  emails: z.array(z.string().min(1)).min(1),
  message: z.string().optional(),
});

const updateCellPayloadInputSchema = z.object({
  sheet: sheetNameInputSchema,
  cell: a1CellInputSchema,
  value: cellValueSchema,
});

const deleteThreadPayloadInputSchema = deleteThreadPayloadSchema;
const sendInvitesPayloadInputSchema = sendInvitesPayloadSchema;

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function parseLooseJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }

  const direct = tryParseJson(trimmed);
  if (direct !== null) {
    return direct;
  }

  const normalized = trimmed
    .replace(/\bNone\b/g, "null")
    .replace(/\bTrue\b/g, "true")
    .replace(/\bFalse\b/g, "false")
    .replace(/'/g, '"');

  const reparsed = tryParseJson(normalized);
  return reparsed === null ? value : reparsed;
}

const confirmActionPayloadInputSchema = z.union([
  updateCellPayloadInputSchema,
  deleteThreadPayloadInputSchema,
  sendInvitesPayloadInputSchema,
  z.string().trim().min(1),
]);

export const confirmActionInputSchema = z
  .object({
    prompt: z.string().optional(),
    action: z.enum(["updateCell", "deleteThread", "sendInvites"]),
    actionPayload: confirmActionPayloadInputSchema,
  })
  .superRefine((value, ctx) => {
    if (typeof value.actionPayload === "string") {
      return;
    }

    const isUpdateCell = updateCellPayloadInputSchema.safeParse(value.actionPayload).success;
    const isDeleteThread =
      deleteThreadPayloadInputSchema.safeParse(value.actionPayload).success;
    const isSendInvites =
      sendInvitesPayloadInputSchema.safeParse(value.actionPayload).success;

    const matches =
      (value.action === "updateCell" && isUpdateCell) ||
      (value.action === "deleteThread" && isDeleteThread) ||
      (value.action === "sendInvites" && isSendInvites);

    if (!matches) {
      ctx.addIssue({
        code: "custom",
        path: ["actionPayload"],
        message: "actionPayload must match the selected action.",
      });
    }
  });

const confirmActionBaseOutputSchema = z.object({
  approved: z.boolean(),
  confirmationToken: z.string().min(1),
  reason: z.string().optional(),
});

export const confirmActionOutputSchema = z.discriminatedUnion("action", [
  confirmActionBaseOutputSchema.extend({
    action: z.literal("updateCell"),
    actionPayload: updateCellPayloadSchema,
  }),
  confirmActionBaseOutputSchema.extend({
    action: z.literal("deleteThread"),
    actionPayload: deleteThreadPayloadSchema,
  }),
  confirmActionBaseOutputSchema.extend({
    action: z.literal("sendInvites"),
    actionPayload: sendInvitesPayloadSchema,
  }),
]);

export const readRangeInputSchema = z.object({
  sheet: sheetNameInputSchema,
  range: a1RangeInputSchema,
});

export const readRangeOutputSchema = z.object({
  sheet: sheetNameSchema,
  range: a1RangeSchema,
  values: z.array(z.array(cellValueSchema)),
});

export const updateCellInputSchema = z.object({
  sheet: sheetNameInputSchema,
  cell: a1CellSchema,
  value: updateCellValueSchema,
  confirmationToken: z
    .union([z.string(), z.null()])
    .optional()
    .describe("Optional and ignored. Confirmation is verified via tool context."),
});

export const updateCellOutputSchema = z.object({
  sheet: sheetNameSchema,
  cell: a1CellSchema,
  value: updateCellValueSchema,
});

export const deleteThreadInputSchema = z.object({
  threadId: z.string().min(1),
  confirmationToken: z
    .union([z.string(), z.null()])
    .optional()
    .describe("Optional and ignored. Confirmation is verified via tool context."),
});

export const deleteThreadOutputSchema = z.object({
  threadId: z.string().min(1),
  deleted: z.boolean(),
});

export const sendInvitesInputSchema = sendInvitesPayloadInputSchema;

export const sendInvitesOutputSchema = z.object({
  sent: z.array(z.string().min(1)),
  message: z.string().optional(),
});

export const explainFormulaInputSchema = z.object({
  sheet: sheetNameInputSchema,
  cell: a1CellInputSchema,
});

export const explainFormulaOutputSchema = z.object({
  formula: z.string(),
});

export type ConfirmActionInput = z.infer<typeof confirmActionInputSchema>;
export type ConfirmActionOutput = z.infer<typeof confirmActionOutputSchema>;
export type ReadRangeInput = z.infer<typeof readRangeInputSchema>;
export type ReadRangeOutput = z.infer<typeof readRangeOutputSchema>;
export type UpdateCellInput = z.infer<typeof updateCellInputSchema>;
export type UpdateCellOutput = z.infer<typeof updateCellOutputSchema>;
export type DeleteThreadInput = z.infer<typeof deleteThreadInputSchema>;
export type DeleteThreadOutput = z.infer<typeof deleteThreadOutputSchema>;
export type SendInvitesInput = z.infer<typeof sendInvitesInputSchema>;
export type SendInvitesOutput = z.infer<typeof sendInvitesOutputSchema>;
export type ExplainFormulaInput = z.infer<typeof explainFormulaInputSchema>;
export type ExplainFormulaOutput = z.infer<typeof explainFormulaOutputSchema>;
