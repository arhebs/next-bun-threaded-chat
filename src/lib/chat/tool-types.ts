import { z } from "zod";

import { normalizeA1Cell, normalizeA1Range } from "@/lib/xlsx/range";

export const sheetNameSchema = z.literal("Sheet1");
const sheetNameInputSchema = sheetNameSchema.default("Sheet1");

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
        ctx.addIssue({ code: z.ZodIssueCode.custom, message });
        return z.NEVER;
      }
    })
    .describe(description);
}

export const a1RangeSchema = createNormalizedSchema(
  "A1 range like A1:C5",
  normalizeA1Range
);

export const a1CellSchema = createNormalizedSchema(
  "A1 cell like B2",
  normalizeA1Cell
);

export const cellValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const updateCellPayloadSchema = z.object({
  sheet: sheetNameSchema,
  cell: a1CellSchema,
  value: cellValueSchema,
});

const updateCellPayloadInputSchema = updateCellPayloadSchema.extend({
  sheet: sheetNameInputSchema,
});

export const deleteThreadPayloadSchema = z.object({
  threadId: z.string().min(1),
});

export const sendInvitesPayloadSchema = z.object({
  emails: z.array(z.string().min(1)).min(1),
  message: z.string().optional(),
});

function parseJsonish(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }

  const normalized = trimmed
    .replace(/\bNone\b/g, "null")
    .replace(/\bTrue\b/g, "true")
    .replace(/\bFalse\b/g, "false")
    .replace(/'/g, '"');

  try {
    return JSON.parse(normalized);
  } catch {
    return value;
  }
}

const confirmActionBaseInputSchema = z.object({
  prompt: z.string().optional(),
});

export const confirmActionInputSchema = z.discriminatedUnion("action", [
  confirmActionBaseInputSchema.extend({
    action: z.literal("updateCell"),
    actionPayload: z.preprocess(parseJsonish, updateCellPayloadInputSchema),
  }),
  confirmActionBaseInputSchema.extend({
    action: z.literal("deleteThread"),
    actionPayload: z.preprocess(parseJsonish, deleteThreadPayloadSchema),
  }),
  confirmActionBaseInputSchema.extend({
    action: z.literal("sendInvites"),
    actionPayload: z.preprocess(parseJsonish, sendInvitesPayloadSchema),
  }),
]);

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
  range: a1RangeSchema,
});

export const readRangeOutputSchema = z.object({
  sheet: sheetNameSchema,
  range: a1RangeSchema,
  values: z.array(z.array(cellValueSchema)),
});

export const updateCellInputSchema = z.object({
  sheet: sheetNameInputSchema,
  cell: a1CellSchema,
  value: cellValueSchema,
  confirmationToken: z.string().min(1),
});

export const updateCellOutputSchema = z.object({
  sheet: sheetNameSchema,
  cell: a1CellSchema,
  value: cellValueSchema,
});

export const deleteThreadInputSchema = z.object({
  threadId: z.string().min(1),
  confirmationToken: z.string().min(1),
});

export const deleteThreadOutputSchema = z.object({
  threadId: z.string().min(1),
  deleted: z.boolean(),
});

export const sendInvitesInputSchema = sendInvitesPayloadSchema;

export const sendInvitesOutputSchema = z.object({
  sent: z.array(z.string().min(1)),
  message: z.string().optional(),
});

export const explainFormulaInputSchema = z.object({
  sheet: sheetNameInputSchema,
  cell: a1CellSchema,
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
