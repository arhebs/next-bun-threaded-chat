import { tool } from "ai";

import { deleteThread as deleteThreadFromDb } from "@/lib/db/threads";
import { normalizeA1Cell } from "@/lib/xlsx/range";
import { readRange } from "@/lib/xlsx/read";
import { loadWorkbook, saveWorkbook } from "@/lib/xlsx/workbook";
import { withWorkbookLock } from "@/lib/xlsx/workbook-lock";
import { updateCellInWorkbook } from "@/lib/xlsx/write";

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

export const tools = {
  confirmAction: tool({
    description: "Ask the user to confirm a dangerous action before proceeding.",
    inputSchema: confirmActionInputSchema,
    outputSchema: confirmActionOutputSchema,
  }),
  readRange: tool({
    description: "Read a Sheet1 A1 range and return its values.",
    inputSchema: readRangeInputSchema,
    outputSchema: readRangeOutputSchema,
    execute: async (input) => readRange({ sheet: input.sheet, range: input.range }),
  }),
  updateCell: tool({
    description: "Update a single cell in Sheet1 (requires confirmation).",
    inputSchema: updateCellInputSchema,
    outputSchema: updateCellOutputSchema,
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

      return await withWorkbookLock(() => {
        const workbook = loadWorkbook();
        const result = updateCellInWorkbook(workbook, {
          sheet: input.sheet,
          cell: input.cell,
          value: input.value,
        });

        // In-process lock prevents concurrent writes within one server instance.
        // Multi-instance/serverless deployments still need a distributed lock.
        saveWorkbook(result.workbook);

        return {
          sheet: result.sheet,
          cell: result.cell,
          value: result.value,
        };
      });
    },
  }),
  deleteThread: tool({
    description: "Delete a thread by id (requires confirmation).",
    inputSchema: deleteThreadInputSchema,
    outputSchema: deleteThreadOutputSchema,
    execute: async (input, options) => {
      const messages = getContextMessages(options.experimental_context);
      assertConfirmed(messages, {
        token: input.confirmationToken,
        action: "deleteThread",
        expectedPayload: {
          threadId: input.threadId,
        },
      });

      const deleted = deleteThreadFromDb(input.threadId);

      return {
        threadId: input.threadId,
        deleted,
      };
    },
  }),
  sendInvites: tool({
    description: "Mock tool that pretends to send email invites.",
    inputSchema: sendInvitesInputSchema,
    outputSchema: sendInvitesOutputSchema,
    execute: async (input) => ({
      sent: input.emails,
      message: input.message,
    }),
  }),
  explainFormula: tool({
    description: "Explain the formula in a given Sheet1 cell.",
    inputSchema: explainFormulaInputSchema,
    outputSchema: explainFormulaOutputSchema,
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
