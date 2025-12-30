import type { UIMessage } from "ai";
import { asc, eq } from "drizzle-orm";

import { extractContentText, extractToolInvocations } from "../chat/message-extract";
import { getDrizzleDb } from "./client";
import { messages as messagesTable, type MessageRow } from "./tables";

type MessageMetadata = {
  createdAt?: unknown;
};

type ExistingMessageRow = Pick<MessageRow, "threadId" | "createdAt">;

function resolveCreatedAt(message: UIMessage, fallbackCreatedAt: number): number {
  const metadata = message.metadata as MessageMetadata | undefined;
  if (metadata && typeof metadata.createdAt === "number") {
    return metadata.createdAt;
  }
  return fallbackCreatedAt;
}

function withCreatedAtMetadata(message: UIMessage, createdAt: number): UIMessage {
  if (message.metadata == null) {
    return { ...message, metadata: { createdAt } };
  }

  if (typeof message.metadata === "object" && !Array.isArray(message.metadata)) {
    const metadataRecord = message.metadata as Record<string, unknown>;
    if (typeof metadataRecord.createdAt === "number") {
      return message;
    }
    return { ...message, metadata: { ...metadataRecord, createdAt } };
  }

  return message;
}

function parseMessageRow(row: MessageRow): UIMessage {
  if (row.uiMessageJson) {
    try {
      const parsed = JSON.parse(row.uiMessageJson) as UIMessage;
      return withCreatedAtMetadata(parsed, row.createdAt);
    } catch {
      // fall through to reconstruction
    }
  }

  const parts: UIMessage["parts"] = [];
  if (row.contentText) {
    parts.push({ type: "text", text: row.contentText });
  }
  if (row.toolInvocationsJson) {
    try {
      const toolParts = JSON.parse(row.toolInvocationsJson);
      if (Array.isArray(toolParts)) {
        for (const part of toolParts) {
          parts.push(part as UIMessage["parts"][number]);
        }
      }
    } catch {
      // ignore malformed tool parts
    }
  }

  return withCreatedAtMetadata(
    {
      id: row.id,
      role: row.role,
      parts,
    },
    row.createdAt
  );
}

export function upsertMessages(threadId: string, messages: UIMessage[]): void {
  const db = getDrizzleDb();
  const baseNow = Date.now();

  db.transaction((tx) => {
    for (let index = 0; index < messages.length; index++) {
      const message = messages[index];

      const existing: ExistingMessageRow | undefined = tx
        .select({
          threadId: messagesTable.threadId,
          createdAt: messagesTable.createdAt,
        })
        .from(messagesTable)
        .where(eq(messagesTable.id, message.id))
        .get();

      if (existing && existing.threadId !== threadId) {
        throw new Error(
          `Message ${message.id} belongs to thread ${existing.threadId}, not ${threadId}`
        );
      }

      const createdAt = existing
        ? existing.createdAt
        : resolveCreatedAt(message, baseNow + index);

      const persistedMessage = withCreatedAtMetadata(message, createdAt);
      const contentText = extractContentText(persistedMessage);
      const toolParts = extractToolInvocations(persistedMessage);
      const toolJson = toolParts.length > 0 ? JSON.stringify(toolParts) : null;
      const uiJson = JSON.stringify(persistedMessage);

      tx.insert(messagesTable)
        .values({
          id: persistedMessage.id,
          threadId,
          role: persistedMessage.role,
          contentText,
          toolInvocationsJson: toolJson,
          uiMessageJson: uiJson,
          createdAt,
        })
        .onConflictDoUpdate({
          target: messagesTable.id,
          set: {
            role: persistedMessage.role,
            contentText,
            toolInvocationsJson: toolJson,
            uiMessageJson: uiJson,
          },
        })
        .run();
    }
  });
}

export function loadUIMessages(threadId: string): UIMessage[] {
  const db = getDrizzleDb();
  const rows = db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.threadId, threadId))
    .orderBy(asc(messagesTable.createdAt), asc(messagesTable.id))
    .all();

  return rows.map(parseMessageRow);
}
