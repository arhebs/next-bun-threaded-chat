import type { UIMessage } from "ai";

import { upsertMessages } from "@/lib/db/messages";
import { getThread, setThreadTitleIfEmpty, touchThread } from "@/lib/db/threads";

import { normalizeToolParts } from "./tool-part-normalize";

type TextPart = Extract<UIMessage["parts"][number], { type: "text" }>;

export function deriveThreadTitle(messages: UIMessage[]): string | null {
  const firstUser = messages.find((message) => message.role === "user");
  if (!firstUser) {
    return null;
  }

  const raw = firstUser.parts
    .filter((part): part is TextPart => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();

  if (!raw) {
    return null;
  }

  const normalized = raw.replace(/\s+/g, " ").trim();
  const maxLength = 30;

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function sanitizeMessagesForPersistence(messages: UIMessage[]): UIMessage[] {
  const normalized = normalizeToolParts(messages);

  return normalized
    .map((message) => {
      const cleanedParts = message.parts.filter((part) => {
        if (!part || typeof part !== "object") {
          return true;
        }

        const record = part as Record<string, unknown>;
        const type = record.type;

        const isToolPart =
          type === "dynamic-tool" ||
          (typeof type === "string" && type.startsWith("tool-"));

        if (!isToolPart) {
          return true;
        }

        const toolCallId = record.toolCallId;
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

      return cleanedParts.length === message.parts.length
        ? message
        : {
            ...message,
            parts: cleanedParts,
          };
    })
    .filter((message) => message.parts.length > 0);
}

export async function saveChatHistory(threadId: string, messages: UIMessage[]): Promise<void> {
  if (!getThread(threadId)) {
    return;
  }

  const sanitizedMessages = sanitizeMessagesForPersistence(messages);

  upsertMessages(threadId, sanitizedMessages);

  const title = deriveThreadTitle(messages);
  if (title) {
    setThreadTitleIfEmpty(threadId, title);
  }

  touchThread(threadId);
}
