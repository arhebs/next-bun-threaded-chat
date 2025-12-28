import { tool, zodSchema } from "ai";

import { normalizeA1Cell } from "@/lib/xlsx/range";
import { readRange } from "@/lib/xlsx/read";
import { loadWorkbook, saveWorkbook } from "@/lib/xlsx/workbook";
import { updateCell } from "@/lib/xlsx/write";

import { assertConfirmed, getContextMessages } from "./confirm-gate";
import {
  confirmActionInputSchema,
  confirmActionOutputSchema,
  deleteThreadInputSchema,
  deleteThreadOutputSchema,
  explainFormulaInputSchema,
  explainFormulaOutputSchema,
  readRangeInputSchema,
  readRangeOutputSchema,
  sendInvitesInputSchema,
  sendInvitesOutputSchema,
  updateCellInputSchema,
  updateCellOutputSchema,
} from "./tool-types";

function notImplemented(toolName: string): never {
  throw new Error(`${toolName} not implemented`);
}

export const tools = {
  confirmAction: tool({
    description:
      "Ask the user to confirm a dangerous action before proceeding.",
    inputSchema: zodSchema(confirmActionInputSchema),
    outputSchema: zodSchema(confirmActionOutputSchema),
  }),
  readRange: tool({
    description: "Read a Sheet1 A1 range and return its values.",
    inputSchema: zodSchema(readRangeInputSchema),
    outputSchema: zodSchema(readRangeOutputSchema),
    execute: async (input) => readRange({ sheet: input.sheet, range: input.range }),
  }),
  updateCell: tool({
    description: "Update a single cell in Sheet1 (requires confirmation).",
    inputSchema: zodSchema(updateCellInputSchema),
    outputSchema: zodSchema(updateCellOutputSchema),
    execute: async (input, options) => {
      const messages = getContextMessages(options.experimental_context);
      assertConfirmed(messages, {
        token: input.confirmationToken,
        action: "updateCell",
        expectedPayload: {
          sheet: input.sheet,
          cell: input.cell,
          value: input.value,
        },
      });

      const result = updateCell({
        sheet: input.sheet,
        cell: input.cell,
        value: input.value,
      });

      saveWorkbook(result.workbook);

      return {
        sheet: result.sheet,
        cell: result.cell,
        value: result.value,
      };
    },
  }),
  deleteThread: tool({
    description: "Delete a thread by id (requires confirmation).",
    inputSchema: zodSchema(deleteThreadInputSchema),
    outputSchema: zodSchema(deleteThreadOutputSchema),
    execute: async (input, options) => {
      const messages = getContextMessages(options.experimental_context);
      assertConfirmed(messages, {
        token: input.confirmationToken,
        action: "deleteThread",
        expectedPayload: {
          threadId: input.threadId,
        },
      });
      return notImplemented("deleteThread");
    },
  }),
  sendInvites: tool({
    description: "Mock tool that pretends to send email invites.",
    inputSchema: zodSchema(sendInvitesInputSchema),
    outputSchema: zodSchema(sendInvitesOutputSchema),
    execute: async (input) => ({
      sent: input.emails,
      message: input.message,
    }),
  }),
  explainFormula: tool({
    description: "Explain the formula in a given Sheet1 cell.",
    inputSchema: zodSchema(explainFormulaInputSchema),
    outputSchema: zodSchema(explainFormulaOutputSchema),
    execute: async (input) => {
      const workbook = loadWorkbook();
      const worksheet = workbook.Sheets[input.sheet];
      if (!worksheet) {
        throw new Error(`Workbook is missing required sheet ${input.sheet}.`);
      }

      const normalizedCell = normalizeA1Cell(input.cell);
      const cell = (worksheet as Record<string, unknown>)[normalizedCell] as
        | { f?: unknown }
        | undefined;
      const formula = typeof cell?.f === "string" ? cell.f.trim() : "";

      if (!formula) {
        throw new Error(`No formula found in ${input.sheet}!${normalizedCell}.`);
      }

      return {
        formula: formula.startsWith("=") ? formula : `=${formula}`,
      };
    },
  }),
};
