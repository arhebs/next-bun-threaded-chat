import type { UIMessage } from "ai";

import { upsertMessages } from "@/lib/db/messages";
import { getThread, setThreadTitleIfEmpty, touchThread } from "@/lib/db/threads";

import { normalizeToolParts } from "./tool-part-normalize";
import { sanitizeUIMessagesForValidation } from "./ui-message-sanitize";

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
  return sanitizeUIMessagesForValidation(normalizeToolParts(messages));
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
