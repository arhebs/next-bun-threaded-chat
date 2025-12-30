import type { UIMessage } from "ai";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeMessageParts(parts: unknown[]): unknown[] {
  return parts.filter((part) => {
    if (!part || typeof part !== "object") {
      return true;
    }

    const record = part as Record<string, unknown>;
    const type = record.type;
    const toolCallId = record.toolCallId;

    const isToolPart =
      type === "dynamic-tool" || (typeof type === "string" && type.startsWith("tool-"));

    if (!isToolPart) {
      return true;
    }

    if (typeof toolCallId !== "string" || toolCallId.trim().length === 0) {
      return false;
    }

    const state = record.state;
    const stateText = typeof state === "string" ? state : "";
    const needsInput = stateText.startsWith("input");

    if (needsInput && !("input" in record)) {
      return false;
    }

    if (needsInput && record.input == null) {
      return false;
    }

    return true;
  });
}

export function sanitizeUIMessagesForValidation(messages: UIMessage[]): UIMessage[];
export function sanitizeUIMessagesForValidation(messages: unknown[]): unknown[];
export function sanitizeUIMessagesForValidation(messages: unknown[]): unknown[] {
  // `useChat` can temporarily include an in-flight assistant message with `parts: []`.
  // The server validator requires every message to contain at least one part.
  const withoutEmptyParts = messages.filter((message) => {
    if (isRecord(message) && "parts" in message) {
      const parts = (message as { parts?: unknown }).parts;
      if (Array.isArray(parts) && parts.length === 0) {
        return false;
      }
    }

    return true;
  });

  return withoutEmptyParts
    .map((message) => {
      if (!isRecord(message) || !("parts" in message)) {
        return message;
      }

      const parts = (message as { parts?: unknown }).parts;
      if (!Array.isArray(parts)) {
        return message;
      }

      const cleanedParts = sanitizeMessageParts(parts);
      if (cleanedParts.length === parts.length) {
        return message;
      }

      return {
        ...(message as Record<string, unknown>),
        parts: cleanedParts,
      };
    })
    .filter((message) => {
      if (!isRecord(message) || !("parts" in message)) {
        return true;
      }

      const parts = (message as { parts?: unknown }).parts;
      return !Array.isArray(parts) || parts.length > 0;
    });
}
