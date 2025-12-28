import { createOpenAI } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  streamText,
  validateUIMessages,
} from "ai";
import type { Tool, UIMessage } from "ai";
import { NextResponse } from "next/server";

import { SYSTEM_PROMPT } from "@/lib/chat/prompt";
import {
  confirmActionOutputSchema,
  type ConfirmActionOutput,
} from "@/lib/chat/tool-types";
import { tools } from "@/lib/chat/tools";
import { upsertMessages } from "@/lib/db/messages";
import {
  deleteThread as deleteThreadFromDb,
  getThread,
  setThreadTitleIfEmpty,
  touchThread,
} from "@/lib/db/threads";
import { parseMentions } from "@/lib/xlsx/mentions";
import { parseRange } from "@/lib/xlsx/range";
import { readRange as readRangeFromXlsx } from "@/lib/xlsx/read";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_MODEL = "gpt-4o-mini";

const MAX_PREFETCHED_MENTIONS = 3;
const MAX_PREFETCHED_CELLS = 200;

type ChatRequestBody = {
  id?: string;
  messages?: unknown;
};

function readEnv(key: string): string | undefined {
  const value = process.env[key];
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function buildExtraHeaders(): Record<string, string> | undefined {
  const headers: Record<string, string> = {};
  const referer = readEnv("OPENAI_REFERER");
  const title = readEnv("OPENAI_TITLE");

  if (referer) {
    headers["HTTP-Referer"] = referer;
  }

  if (title) {
    headers["X-Title"] = title;
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

type TextPart = Extract<UIMessage["parts"][number], { type: "text" }>;

function deriveThreadTitle(messages: UIMessage[]): string | null {
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

function isMockChatEnabled(): boolean {
  return readEnv("MOCK_CHAT") === "1" || readEnv("PLAYWRIGHT") === "1";
}

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

type PrefetchedRangeContext = {
  sheet: "Sheet1";
  range: string;
  values: (string | number | boolean | null)[][];
};

function buildMentionPrefetchSystemAppendix(
  messages: UIMessage[]
): string | null {
  const lastUserText = extractLastUserText(messages);
  if (!lastUserText || !lastUserText.includes("@")) {
    return null;
  }

  const mentions = parseMentions(lastUserText);
  if (mentions.length === 0) {
    return null;
  }

  const sheet1Ranges: string[] = [];
  const seen = new Set<string>();
  const ignoredSheets = new Set<string>();

  for (const mention of mentions) {
    const key = `${mention.sheet}!${mention.range}`;

    if (mention.sheet !== "Sheet1") {
      ignoredSheets.add(key);
      continue;
    }

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    sheet1Ranges.push(mention.range);
  }

  const prefetched: PrefetchedRangeContext[] = [];
  const skipped: string[] = [];

  for (const range of sheet1Ranges) {
    if (prefetched.length >= MAX_PREFETCHED_MENTIONS) {
      break;
    }

    try {
      const parsed = parseRange(range, { maxCells: MAX_PREFETCHED_CELLS });
      const result = readRangeFromXlsx({ sheet: "Sheet1", range: parsed.normalized });
      prefetched.push(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      skipped.push(`Sheet1!${range}: ${message}`);
    }
  }

  if (prefetched.length === 0 && skipped.length === 0 && ignoredSheets.size === 0) {
    return null;
  }

  const lines: string[] = [];
  lines.push("Prefetched spreadsheet context (authoritative; may be incomplete):");

  for (const entry of prefetched) {
    lines.push(`- ${entry.sheet}!${entry.range}: ${JSON.stringify(entry.values)}`);
  }

  if (skipped.length > 0) {
    lines.push("Prefetch skipped:");
    for (const item of skipped) {
      lines.push(`- ${item}`);
    }
  }

  if (ignoredSheets.size > 0) {
    lines.push("Mentions on unsupported sheets (ignored):");
    for (const item of ignoredSheets) {
      lines.push(`- ${item}`);
    }
  }

  return lines.join("\n");
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

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as ChatRequestBody;
    const threadId = typeof body.id === "string" ? body.id.trim() : "";

    if (!threadId) {
      return NextResponse.json({ error: "Missing thread id" }, { status: 400 });
    }

    if (!Array.isArray(body.messages)) {
      return NextResponse.json({ error: "Missing messages" }, { status: 400 });
    }

    const toolSet = tools as unknown as Record<string, Tool<unknown, unknown>>;

    // `useChat` can temporarily include an in-flight assistant message with `parts: []`.
    // The server validator requires every message to contain at least one part.
    const incomingMessages = body.messages.filter((message) => {
      if (message && typeof message === "object" && "parts" in message) {
        const parts = (message as { parts?: unknown }).parts;
        if (Array.isArray(parts) && parts.length === 0) {
          return false;
        }
      }
      return true;
    });

    const validated = await validateUIMessages({
      messages: incomingMessages,
      tools: toolSet,
    });

    if (isMockChatEnabled()) {
      const lastMessage = validated[validated.length - 1];
      const confirmation = extractConfirmOutputFromMessage(lastMessage);
      const lastUserText = extractLastUserText(validated);
      const shouldContinue = lastMessage?.role === "assistant";
      const hasReadRangeOutput = messageHasToolOutput(lastMessage, "tool-readRange");
      const hasDeleteThreadOutput = messageHasToolOutput(
        lastMessage,
        "tool-deleteThread"
      );

      const stream = createUIMessageStream({
        originalMessages: validated,
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
            const mentions = lastUserText.includes("@")
              ? parseMentions(lastUserText)
              : [];

            const unique = new Set<string>();
            const sheet1Mentions = [] as { sheet: string; range: string }[];
            const unsupportedMentions = [] as { sheet: string; range: string }[];

            for (const mention of mentions) {
              const key = `${mention.sheet}!${mention.range}`;
              if (unique.has(key)) {
                continue;
              }
              unique.add(key);

              if (mention.sheet === "Sheet1") {
                if (sheet1Mentions.length < MAX_PREFETCHED_MENTIONS) {
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
              writeText(
                "Only Sheet1 is supported. Please use mentions like @Sheet1!A1:C5."
              );
            } else {
              writeText("Mock response.");
            }
          }

          writer.write({ type: "finish-step" });
          writer.write({ type: "finish" });
        },
        onFinish: async ({ messages }) => {
          if (!getThread(threadId)) {
            return;
          }

          upsertMessages(threadId, messages);

          const title = deriveThreadTitle(messages);
          if (title) {
            setThreadTitleIfEmpty(threadId, title);
          }

          touchThread(threadId);
        },
      });

      return createUIMessageStreamResponse({ stream });
    }

    const modelMessages = await convertToModelMessages(validated, {
      tools: toolSet,
      ignoreIncompleteToolCalls: true,
    });

    const baseURL = readEnv("OPENAI_BASE_URL");
    const openai = createOpenAI({
      apiKey: readEnv("OPENAI_API_KEY"),
      baseURL,
      headers: buildExtraHeaders(),
    });

    const modelId = readEnv("OPENAI_MODEL") ?? DEFAULT_MODEL;

    // The AI SDK OpenAI provider defaults to the newer Responses API when calling `openai(modelId)`.
    // Many OpenAI-compatible providers (including OpenRouter) support Chat Completions but not Responses.
    const apiMode = readEnv("OPENAI_API_MODE");
    const useChatCompletions = apiMode === "chat" || (apiMode == null && baseURL != null);
    const model = useChatCompletions
      ? openai.chat(modelId as never)
      : openai(modelId as never);

    const mentionAppendix = buildMentionPrefetchSystemAppendix(validated);
    const system = mentionAppendix
      ? `${SYSTEM_PROMPT}\n\n${mentionAppendix}`
      : SYSTEM_PROMPT;

    const result = streamText({
      model,
      system,
      messages: modelMessages,
      tools: toolSet,
      experimental_context: {
        uiMessages: validated,
      },
    });

    return result.toUIMessageStreamResponse({
      originalMessages: validated,
      generateMessageId: generateId,
       onFinish: async ({ messages }) => {
         if (!getThread(threadId)) {
           return;
         }

         upsertMessages(threadId, messages);

         const title = deriveThreadTitle(messages);
         if (title) {
           setThreadTitleIfEmpty(threadId, title);
         }

         touchThread(threadId);
       },

    });
  } catch (error) {
    console.error("POST /api/chat failed", error);
    return NextResponse.json({ error: "Failed to process chat" }, { status: 500 });
  }
}
