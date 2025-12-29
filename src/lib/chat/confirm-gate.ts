import { isDeepStrictEqual } from "node:util";
import type { UIMessage } from "ai";

import {
  confirmActionOutputSchema,
  type ConfirmActionOutput,
} from "./tool-types";

type ConfirmCheck = {
  token: string;
  action: ConfirmActionOutput["action"];
  expectedPayload: ConfirmActionOutput["actionPayload"];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectConfirmOutputs(messages: UIMessage[]): ConfirmActionOutput[] {
  const outputs: ConfirmActionOutput[] = [];

  for (const message of messages) {
    const parts = Array.isArray(message.parts) ? message.parts : [];

    for (const part of parts) {
      const unknownPart: unknown = part;
      if (!isRecord(unknownPart)) {
        continue;
      }

      const partType = unknownPart["type"];

      if (partType === "tool-invocation") {
        const toolInvocation = unknownPart["toolInvocation"];
        if (!isRecord(toolInvocation)) {
          continue;
        }

        const toolName = toolInvocation["toolName"];
        if (toolName !== "confirmAction") {
          continue;
        }

        const result = toolInvocation["result"];
        if (result == null) {
          continue;
        }

        const parsed = confirmActionOutputSchema.safeParse(result);
        if (parsed.success) {
          outputs.push(parsed.data);
        }

        continue;
      }

      if (partType === "tool-confirmAction") {
        const output = unknownPart["output"];
        if (output == null) {
          continue;
        }

        const parsed = confirmActionOutputSchema.safeParse(output);
        if (parsed.success) {
          outputs.push(parsed.data);
        }
      }
    }
  }

  return outputs;
}

export function getContextMessages(context: unknown): UIMessage[] {
  const ctx = context as { uiMessages?: unknown } | undefined;
  if (!ctx || !Array.isArray(ctx.uiMessages)) {
    throw new Error("Missing confirmation context");
  }
  return ctx.uiMessages as UIMessage[];
}

export function assertConfirmed(messages: UIMessage[], check: ConfirmCheck): void {
  const outputs = collectConfirmOutputs(messages);
  let deniedMatch = false;

  for (const output of outputs) {
    if (output.confirmationToken !== check.token) {
      continue;
    }

    if (output.action !== check.action) {
      continue;
    }

    if (!isDeepStrictEqual(output.actionPayload, check.expectedPayload)) {
      continue;
    }

    if (output.approved) {
      return;
    }

    deniedMatch = true;
  }

  if (deniedMatch) {
    throw new Error("Confirmation denied");
  }

  throw new Error("Missing confirmation");
}
