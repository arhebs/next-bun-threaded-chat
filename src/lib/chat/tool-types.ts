import { z } from "zod";

export const sheetNameSchema = z.literal("Sheet1");
export const a1RangeSchema = z
  .string()
  .min(1)
  .describe("A1 range like A1:C5");
export const a1CellSchema = z
  .string()
  .min(1)
  .describe("A1 cell like B2");

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

export const deleteThreadPayloadSchema = z.object({
  threadId: z.string().min(1),
});

export const sendInvitesPayloadSchema = z.object({
  emails: z.array(z.string().min(1)).min(1),
  message: z.string().optional(),
});

const confirmActionBaseInputSchema = z.object({
  prompt: z.string().optional(),
});

export const confirmActionInputSchema = z.discriminatedUnion("action", [
  confirmActionBaseInputSchema.extend({
    action: z.literal("updateCell"),
    actionPayload: updateCellPayloadSchema,
  }),
  confirmActionBaseInputSchema.extend({
    action: z.literal("deleteThread"),
    actionPayload: deleteThreadPayloadSchema,
  }),
  confirmActionBaseInputSchema.extend({
    action: z.literal("sendInvites"),
    actionPayload: sendInvitesPayloadSchema,
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
  sheet: sheetNameSchema,
  range: a1RangeSchema,
});

export const readRangeOutputSchema = z.object({
  sheet: sheetNameSchema,
  range: a1RangeSchema,
  values: z.array(z.array(cellValueSchema)),
});

export const updateCellInputSchema = z.object({
  sheet: sheetNameSchema,
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
  sheet: sheetNameSchema,
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
