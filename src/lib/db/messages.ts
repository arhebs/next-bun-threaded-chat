import type { UIMessage } from "ai";

import { extractContentText, extractToolInvocations } from "../chat/message-extract";
import { getDb } from "./client";
import type { MessageRow } from "./types";

const MESSAGE_COLUMNS =
  "id, thread_id, role, content_text, tool_invocations_json, ui_message_json, created_at";

type MessageMetadata = {
  createdAt?: unknown;
};

type ExistingMessageRow = Pick<MessageRow, "thread_id" | "created_at">;

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
  if (row.ui_message_json) {
    try {
      const parsed = JSON.parse(row.ui_message_json) as UIMessage;
      return withCreatedAtMetadata(parsed, row.created_at);
    } catch {
      // fall through to reconstruction
    }
  }

  const parts: UIMessage["parts"] = [];
  if (row.content_text) {
    parts.push({ type: "text", text: row.content_text });
  }
  if (row.tool_invocations_json) {
    try {
      const toolParts = JSON.parse(row.tool_invocations_json);
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
    row.created_at
  );
}

export function upsertMessages(threadId: string, messages: UIMessage[]): void {
  const db = getDb();

  db.exec("BEGIN;");

  let committed = false;
  try {
    const selectExisting = db.query<ExistingMessageRow>(
      "SELECT thread_id, created_at FROM messages WHERE id = ?"
    );

    const upsert = db.query(
      "INSERT INTO messages (id, thread_id, role, content_text, tool_invocations_json, ui_message_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET role = excluded.role, content_text = excluded.content_text, tool_invocations_json = excluded.tool_invocations_json, ui_message_json = excluded.ui_message_json"
    );

    const baseNow = Date.now();

    for (let index = 0; index < messages.length; index++) {
      const message = messages[index];
      const existing = selectExisting.get(message.id);

      if (existing && existing.thread_id !== threadId) {
        throw new Error(
          `Message ${message.id} belongs to thread ${existing.thread_id}, not ${threadId}`
        );
      }

      const createdAt = existing
        ? existing.created_at
        : resolveCreatedAt(message, baseNow + index);

      const persistedMessage = withCreatedAtMetadata(message, createdAt);
      const contentText = extractContentText(persistedMessage);
      const toolParts = extractToolInvocations(persistedMessage);
      const toolJson = toolParts.length > 0 ? JSON.stringify(toolParts) : null;
      const uiJson = JSON.stringify(persistedMessage);

      upsert.run(
        persistedMessage.id,
        threadId,
        persistedMessage.role,
        contentText,
        toolJson,
        uiJson,
        createdAt
      );
    }

    db.exec("COMMIT;");
    committed = true;
  } finally {
    if (!committed) {
      try {
        db.exec("ROLLBACK;");
      } catch {
        // ignore rollback errors
      }
    }
  }
}

export function loadUIMessages(threadId: string): UIMessage[] {
  const db = getDb();
  const rows = db
    .query<MessageRow>(
      `SELECT ${MESSAGE_COLUMNS} FROM messages WHERE thread_id = ? ORDER BY created_at ASC, id ASC`
    )
    .all(threadId);

  return rows.map(parseMessageRow);
}
