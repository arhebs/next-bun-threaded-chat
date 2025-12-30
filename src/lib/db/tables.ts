import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const threads = sqliteTable(
  "threads",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => ({
    updatedAtIndex: index("idx_threads_updated").on(table.updatedAt),
  })
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
    contentText: text("content_text"),
    toolInvocationsJson: text("tool_invocations_json"),
    uiMessageJson: text("ui_message_json"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => ({
    threadCreatedIndex: index("idx_messages_thread_created").on(
      table.threadId,
      table.createdAt
    ),
  })
);

export const consumedConfirmations = sqliteTable(
  "consumed_confirmations",
  {
    token: text("token").primaryKey(),
    action: text("action", { enum: ["updateCell", "deleteThread"] }).notNull(),
    actionPayloadJson: text("action_payload_json").notNull(),
    consumedAt: integer("consumed_at", { mode: "number" }).notNull(),
  },
  (table) => ({
    consumedAtIndex: index("idx_consumed_confirmations_consumed").on(
      table.consumedAt
    ),
  })
);

export type ThreadRow = typeof threads.$inferSelect;
export type NewThreadRow = typeof threads.$inferInsert;
export type MessageRow = typeof messages.$inferSelect;
export type NewMessageRow = typeof messages.$inferInsert;
export type ConsumedConfirmationRow = typeof consumedConfirmations.$inferSelect;
export type NewConsumedConfirmationRow = typeof consumedConfirmations.$inferInsert;
