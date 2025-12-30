import { getDrizzleDb } from "./client";
import { consumedConfirmations } from "./tables";

export type ConsumableConfirmationAction = "updateCell" | "deleteThread";

type ConsumeConfirmationInput = {
  confirmationToken: string;
  action: ConsumableConfirmationAction;
  actionPayload: unknown;
};

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function consumeConfirmationToken(input: ConsumeConfirmationInput): boolean {
  const db = getDrizzleDb();
  const token = input.confirmationToken.trim();
  if (!token) {
    return false;
  }

  const inserted = db
    .insert(consumedConfirmations)
    .values({
      token,
      action: input.action,
      actionPayloadJson: safeJsonStringify(input.actionPayload),
      consumedAt: Date.now(),
    })
    .onConflictDoNothing()
    .returning({ token: consumedConfirmations.token })
    .all();

  return inserted.length > 0;
}
