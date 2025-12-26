import type { UIMessage } from "ai";

import { extractContentText, extractToolInvocations } from "../chat/message-extract";
import { getDb } from "./client";
import type { MessageRow } from "./types";

const MESSAGE_COLUMNS =
  "id, thread_id, role, content_text, tool_invocations_json, ui_message_json, created_at";

type MessageMetadata = {
  createdAt?: unknown;
};

function resolveCreatedAt(message: UIMessage): number {
  const metadata = message.metadata as MessageMetadata | undefined;
  if (metadata && typeof metadata.createdAt === "number") {
    return metadata.createdAt;
  }
  return Date.now();
}

function parseMessageRow(row: MessageRow): UIMessage {
  if (row.ui_message_json) {
    try {
      return JSON.parse(row.ui_message_json) as UIMessage;
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

  return {
    id: row.id,
    role: row.role,
    parts,
  };
}

export function upsertMessages(threadId: string, messages: UIMessage[]): void {
  const db = getDb();
  const insert = db.query(
    "INSERT OR REPLACE INTO messages (id, thread_id, role, content_text, tool_invocations_json, ui_message_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );

  for (const message of messages) {
    const contentText = extractContentText(message);
    const toolParts = extractToolInvocations(message);
    const toolJson = toolParts.length > 0 ? JSON.stringify(toolParts) : null;
    const uiJson = JSON.stringify(message);
    const createdAt = resolveCreatedAt(message);

    insert.run(
      message.id,
      threadId,
      message.role,
      contentText,
      toolJson,
      uiJson,
      createdAt
    );
  }
}

export function loadUIMessages(threadId: string): UIMessage[] {
  const db = getDb();
  const rows = db
    .query<MessageRow>(
      `SELECT ${MESSAGE_COLUMNS} FROM messages WHERE thread_id = ? ORDER BY created_at ASC`
    )
    .all(threadId);

  return rows.map(parseMessageRow);
}
