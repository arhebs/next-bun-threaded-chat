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

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left)) {
    if (!Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    for (let index = 0; index < left.length; index++) {
      if (!deepEqual(left[index], right[index])) {
        return false;
      }
    }
    return true;
  }

  if (isRecord(left)) {
    if (!isRecord(right)) {
      return false;
    }
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }
    for (const key of leftKeys) {
      if (!Object.prototype.hasOwnProperty.call(right, key)) {
        return false;
      }
      if (!deepEqual(left[key], right[key])) {
        return false;
      }
    }
    return true;
  }

  return false;
}

function collectConfirmOutputs(messages: UIMessage[]): ConfirmActionOutput[] {
  const outputs: ConfirmActionOutput[] = [];

  for (const message of messages) {
    for (const part of message.parts) {
      if (part && typeof part === "object" && part.type === "tool-confirmAction") {
        const output = (part as { output?: unknown }).output;
        if (output != null) {
          const parsed = confirmActionOutputSchema.safeParse(output);
          if (parsed.success) {
            outputs.push(parsed.data);
          }
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
    if (!deepEqual(output.actionPayload, check.expectedPayload)) {
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
