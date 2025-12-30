import { isDeepStrictEqual } from "node:util";
import type { UIMessage } from "ai";

import {
  consumeConfirmationToken,
  type ConsumableConfirmationAction,
} from "@/lib/db/confirmations";

import { confirmActionOutputSchema, type ConfirmActionOutput } from "./tool-types";

type ConfirmCheck = {
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

function findLatestMatchingConfirmation(
  messages: UIMessage[],
  check: ConfirmCheck
): ConfirmActionOutput | null {
  const outputs = collectConfirmOutputs(messages);
  let latestMatch: ConfirmActionOutput | null = null;

  for (const output of outputs) {
    if (output.action !== check.action) {
      continue;
    }

    if (!isDeepStrictEqual(output.actionPayload, check.expectedPayload)) {
      continue;
    }

    latestMatch = output;
  }

  return latestMatch;
}

export function getContextMessages(context: unknown): UIMessage[] {
  const ctx = context as { uiMessages?: unknown } | undefined;
  if (!ctx || !Array.isArray(ctx.uiMessages)) {
    throw new Error("Missing confirmation context");
  }
  return ctx.uiMessages as UIMessage[];
}

export function assertConfirmed(
  messages: UIMessage[],
  check: ConfirmCheck
): ConfirmActionOutput {
  const latestMatch = findLatestMatchingConfirmation(messages, check);

  if (!latestMatch) {
    throw new Error("Missing confirmation");
  }

  if (!latestMatch.approved) {
    throw new Error("Confirmation denied");
  }

  return latestMatch;
}

type ConsumableConfirmCheck = Omit<ConfirmCheck, "action"> & {
  action: ConsumableConfirmationAction;
};

export function assertConfirmedAndConsume(
  messages: UIMessage[],
  check: ConsumableConfirmCheck
): void {
  const confirmation = assertConfirmed(messages, check);
  const didConsume = consumeConfirmationToken({
    confirmationToken: confirmation.confirmationToken,
    action: check.action,
    actionPayload: confirmation.actionPayload,
  });

  if (!didConsume) {
    throw new Error("Confirmation already used");
  }
}
