import { validateUIMessages, type Tool } from "ai";
import { NextResponse } from "next/server";

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
} from "@/lib/chat/tool-types";
import { tools } from "@/lib/chat/tools";
import { loadUIMessages } from "@/lib/db/messages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type SchemaWithParse = {
  parse: (value: unknown) => unknown;
};

const TOOL_PART_SCHEMAS: Record<string, { input: SchemaWithParse; output: SchemaWithParse }> = {
  confirmAction: {
    input: confirmActionInputSchema,
    output: confirmActionOutputSchema,
  },
  readRange: {
    input: readRangeInputSchema,
    output: readRangeOutputSchema,
  },
  updateCell: {
    input: updateCellInputSchema,
    output: updateCellOutputSchema,
  },
  deleteThread: {
    input: deleteThreadInputSchema,
    output: deleteThreadOutputSchema,
  },
  sendInvites: {
    input: sendInvitesInputSchema,
    output: sendInvitesOutputSchema,
  },
  explainFormula: {
    input: explainFormulaInputSchema,
    output: explainFormulaOutputSchema,
  },
};

function assertToolPartsAreValid(messages: unknown): void {
  if (!Array.isArray(messages)) {
    throw new Error("Messages must be an array.");
  }

  for (const message of messages) {
    if (!message || typeof message !== "object") {
      continue;
    }

    const parts = (message as { parts?: unknown }).parts;
    if (!Array.isArray(parts)) {
      continue;
    }

    for (const part of parts) {
      if (!part || typeof part !== "object") {
        continue;
      }

      const record = part as Record<string, unknown>;
      const type = record.type;
      if (typeof type !== "string" || !type.startsWith("tool-")) {
        continue;
      }

      const toolName = type.slice("tool-".length);
      const schemas = TOOL_PART_SCHEMAS[toolName];
       if (!schemas) {
         // Be tolerant of older/unrecognized tool parts stored in history.
         continue;
       }

       if ("input" in record) {
         schemas.input.parse(record.input);
       } else {
         // Some UI tool parts only include output (or error) and omit the original input.
         // We keep them for display, but skip strict input validation.
         if (!("output" in record) && !("errorText" in record)) {
           continue;
         }
       }

       if ("output" in record) {
         schemas.output.parse(record.output);
       }
    }
  }
}

export async function GET(
  _request: Request,
  context: RouteContext
): Promise<Response> {
  try {
    const params = await context.params;
    const threadId = params.id.trim();
    if (!threadId) {
      return NextResponse.json({ error: "Missing thread id" }, { status: 400 });
    }

    const messages = loadUIMessages(threadId);
    if (messages.length === 0) {
      return NextResponse.json({ messages: [] }, { status: 200 });
    }

    const toolSet = tools as unknown as Record<string, Tool<unknown, unknown>>;

    const validated = await validateUIMessages({
      messages,
      tools: toolSet,
    });

    assertToolPartsAreValid(validated);

    return NextResponse.json({ messages: validated }, { status: 200 });
  } catch (error) {
    console.error("GET /api/threads/:id/messages failed", error);
    return NextResponse.json(
      { error: "Failed to load messages" },
      { status: 500 }
    );
  }
}
