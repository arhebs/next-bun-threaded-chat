import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
} from "ai";
import type { UIMessage } from "ai";

import {
  confirmActionOutputSchema,
  type ConfirmActionOutput,
} from "@/lib/chat/tool-types";
import { deleteThread as deleteThreadFromDb } from "@/lib/db/threads";
import { parseMentions } from "@/lib/xlsx/mentions";
import { readRange as readRangeFromXlsx } from "@/lib/xlsx/read";

type TextPart = Extract<UIMessage["parts"][number], { type: "text" }>;

type HandleMockChatOptions = {
  validatedMessages: UIMessage[];
  threadId: string;
  maxPrefetchedMentions?: number;
  onFinish: (opts: { messages: UIMessage[] }) => Promise<void>;
};

function extractLastUserText(messages: UIMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message?.role !== "user") {
      continue;
    }

    return message.parts
      .filter((part): part is TextPart => part.type === "text")
      .map((part) => part.text)
      .join("")
      .trim();
  }

  return "";
}

function extractConfirmOutputFromMessage(
  message: UIMessage | undefined
): ConfirmActionOutput | null {
  if (!message || message.role !== "assistant") {
    return null;
  }

  for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex--) {
    const part = message.parts[partIndex] as unknown;
    if (!part || typeof part !== "object") {
      continue;
    }

    const record = part as Record<string, unknown>;
    if (record.type !== "tool-confirmAction") {
      continue;
    }

    const output = record.output;
    if (output == null) {
      continue;
    }

    const parsed = confirmActionOutputSchema.safeParse(output);
    if (parsed.success) {
      return parsed.data;
    }
  }

  return null;
}

function messageHasToolOutput(message: UIMessage | undefined, toolType: string): boolean {
  if (!message || message.role !== "assistant") {
    return false;
  }

  return message.parts.some((part) => {
    if (!part || typeof part !== "object") {
      return false;
    }

    const record = part as Record<string, unknown>;
    if (record.type !== toolType) {
      return false;
    }

    if (record.state === "output-error") {
      return true;
    }

    return record.output != null;
  });
}

export function handleMockChat({
  validatedMessages,
  threadId,
  maxPrefetchedMentions = 3,
  onFinish,
}: HandleMockChatOptions): Response {
  const lastMessage = validatedMessages[validatedMessages.length - 1];
  const confirmation = extractConfirmOutputFromMessage(lastMessage);
  const lastUserText = extractLastUserText(validatedMessages);
  const shouldContinue = lastMessage?.role === "assistant";
  const hasReadRangeOutput = messageHasToolOutput(lastMessage, "tool-readRange");
  const hasDeleteThreadOutput = messageHasToolOutput(lastMessage, "tool-deleteThread");

  const stream = createUIMessageStream({
    originalMessages: validatedMessages,
    generateId,
    execute: ({ writer }) => {
      if (shouldContinue) {
        writer.write({ type: "start" });
      } else {
        writer.write({ type: "start", messageId: generateId() });
      }

      writer.write({ type: "start-step" });

      const writeText = (text: string) => {
        const textId = generateId();
        writer.write({ type: "text-start", id: textId });
        writer.write({ type: "text-delta", id: textId, delta: text });
        writer.write({ type: "text-end", id: textId });
      };

      if (hasDeleteThreadOutput) {
        writeText("Thread deletion complete.");
      } else if (hasReadRangeOutput) {
        writeText(
          "Range loaded. You can click the table preview to open the modal and select cells."
        );
      } else if (confirmation) {
        if (!confirmation.approved) {
          writeText("Action canceled.");
        } else if (confirmation.action === "deleteThread") {
          const targetThreadId = confirmation.actionPayload.threadId;
          const toolCallId = generateId();

          writer.write({
            type: "tool-input-available",
            toolCallId,
            toolName: "deleteThread",
            input: {
              threadId: targetThreadId,
              confirmationToken: confirmation.confirmationToken,
            },
          });

          const deleted = deleteThreadFromDb(targetThreadId);

          writer.write({
            type: "tool-output-available",
            toolCallId,
            output: {
              threadId: targetThreadId,
              deleted,
            },
          });

          writeText("Action confirmed.");
        } else {
          writeText("Action confirmed.");
        }
      } else if (/\bdelete\b/i.test(lastUserText)) {
        writeText("I need your confirmation before deleting.");
        writer.write({
          type: "tool-input-available",
          toolCallId: generateId(),
          toolName: "confirmAction",
          input: {
            action: "deleteThread",
            actionPayload: { threadId },
            prompt: "Delete this thread?",
          },
        });
      } else {
        const mentions = lastUserText.includes("@") ? parseMentions(lastUserText) : [];

        const unique = new Set<string>();
        const sheet1Mentions: { sheet: string; range: string }[] = [];
        const unsupportedMentions: { sheet: string; range: string }[] = [];

        for (const mention of mentions) {
          const key = `${mention.sheet}!${mention.range}`;
          if (unique.has(key)) {
            continue;
          }
          unique.add(key);

          if (mention.sheet === "Sheet1") {
            if (sheet1Mentions.length < maxPrefetchedMentions) {
              sheet1Mentions.push({ sheet: mention.sheet, range: mention.range });
            }
          } else {
            unsupportedMentions.push({ sheet: mention.sheet, range: mention.range });
          }
        }

        if (sheet1Mentions.length > 0) {
          for (const mention of sheet1Mentions) {
            const toolCallId = generateId();

            writer.write({
              type: "tool-input-available",
              toolCallId,
              toolName: "readRange",
              input: {
                sheet: "Sheet1",
                range: mention.range,
              },
            });

            try {
              const result = readRangeFromXlsx({
                sheet: "Sheet1",
                range: mention.range,
              });

              writer.write({
                type: "tool-output-available",
                toolCallId,
                output: result,
              });
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              writer.write({
                type: "tool-output-error",
                toolCallId,
                errorText: message,
              });
            }
          }

          writeText("Loaded mentioned range.");
        } else if (unsupportedMentions.length > 0) {
          writeText("Only Sheet1 is supported. Please use mentions like @Sheet1!A1:C5.");
        } else {
          writeText("Mock response.");
        }
      }

      writer.write({ type: "finish-step" });
      writer.write({ type: "finish" });
    },
    onFinish,
  });

  return createUIMessageStreamResponse({ stream });
}
