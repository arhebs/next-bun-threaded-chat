import { createOpenAI } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  generateId,
  streamText,
  validateUIMessages,
} from "ai";
import type { Tool, UIMessage } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { handleMockChat } from "@/lib/chat/mock-handler";
import { SYSTEM_PROMPT } from "@/lib/chat/prompt";
import { saveChatHistory } from "@/lib/chat/persistence";
import { normalizeToolParts } from "@/lib/chat/tool-part-normalize";
import { tools } from "@/lib/chat/tools";
import { env } from "@/lib/env";
import { parseMentions } from "@/lib/xlsx/mentions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_PREFETCHED_MENTIONS = 3;

const chatSchema = z.object({
  id: z
    .string({ error: "Missing thread id" })
    .trim()
    .min(1, "Missing thread id"),
  messages: z.array(z.unknown(), { error: "Missing messages" }),
});

type TextPart = Extract<UIMessage["parts"][number], { type: "text" }>;

function buildExtraHeaders(): Record<string, string> | undefined {
  const headers: Record<string, string> = {};
  const referer = env.OPENAI_REFERER;
  const title = env.OPENAI_TITLE;

  if (referer) {
    headers["HTTP-Referer"] = referer;
  }

  if (title) {
    headers["X-Title"] = title;
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

function isMockChatEnabled(): boolean {
  return env.MOCK_CHAT === "1" || env.PLAYWRIGHT === "1";
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

function buildMentionContext(uiMessages: UIMessage[]): string | null {
  const lastUserText = extractLastUserText(uiMessages);
  if (!lastUserText.includes("@")) {
    return null;
  }

  const mentions = parseMentions(lastUserText);
  if (mentions.length === 0) {
    return null;
  }

  const unique = new Set<string>();
  const supported: { sheet: string; range: string }[] = [];
  const unsupported: { sheet: string; range: string }[] = [];

  for (const mention of mentions) {
    const key = `${mention.sheet}!${mention.range}`;
    if (unique.has(key)) {
      continue;
    }
    unique.add(key);

    if (mention.sheet === "Sheet1") {
      if (supported.length < MAX_PREFETCHED_MENTIONS) {
        supported.push({ sheet: mention.sheet, range: mention.range });
      }
    } else {
      unsupported.push({ sheet: mention.sheet, range: mention.range });
    }
  }

  if (supported.length > 0) {
    return [
      `User mentioned these spreadsheet ranges: ${JSON.stringify(supported)}.`,
      "Use the readRange tool to load them before answering.",
      "Do not guess cell contents without reading.",
    ].join(" ");
  }

  if (unsupported.length > 0) {
    return [
      `User mentioned ranges outside supported sheets: ${JSON.stringify(unsupported)}.`,
      "Only Sheet1 is supported.",
    ].join(" ");
  }

  return null;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const json: unknown = await request.json();
    const parsedBody = chatSchema.safeParse(json);

    if (!parsedBody.success) {
      const messages = new Set(parsedBody.error.issues.map((issue) => issue.message));
      if (messages.has("Missing thread id")) {
        return NextResponse.json({ error: "Missing thread id" }, { status: 400 });
      }
      if (messages.has("Missing messages")) {
        return NextResponse.json({ error: "Missing messages" }, { status: 400 });
      }
      return NextResponse.json({ error: parsedBody.error.flatten() }, { status: 400 });
    }

    const { id: threadId, messages: rawMessages } = parsedBody.data;
    const toolSet = tools as unknown as Record<string, Tool<unknown, unknown>>;

    // `useChat` can temporarily include an in-flight assistant message with `parts: []`.
    // The server validator requires every message to contain at least one part.
    const incomingMessages = rawMessages.filter((message) => {
      if (message && typeof message === "object" && "parts" in message) {
        const parts = (message as { parts?: unknown }).parts;
        if (Array.isArray(parts) && parts.length === 0) {
          return false;
        }
      }
      return true;
    });

    const sanitizedIncomingMessages = incomingMessages
      .map((message) => {
        if (!message || typeof message !== "object" || !("parts" in message)) {
          return message;
        }

        const parts = (message as { parts?: unknown }).parts;
        if (!Array.isArray(parts)) {
          return message;
        }

        const cleanedParts = parts.filter((part) => {
          if (!part || typeof part !== "object") {
            return true;
          }

          const record = part as Record<string, unknown>;
          const type = record.type;
          const toolCallId = record.toolCallId;

          const isToolPart =
            type === "dynamic-tool" ||
            (typeof type === "string" && type.startsWith("tool-"));

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

        return {
          ...(message as Record<string, unknown>),
          parts: cleanedParts,
        };
      })
      .filter((message) => {
        if (!message || typeof message !== "object" || !("parts" in message)) {
          return true;
        }
        const parts = (message as { parts?: unknown }).parts;
        return !Array.isArray(parts) || parts.length > 0;
      });

    const validated = await validateUIMessages({
      messages: sanitizedIncomingMessages,
      tools: toolSet,
    });

    if (isMockChatEnabled()) {
      return handleMockChat({
        validatedMessages: validated,
        threadId,
        maxPrefetchedMentions: MAX_PREFETCHED_MENTIONS,
        onFinish: async ({ messages }) => {
          await saveChatHistory(threadId, messages);
        },
      });
    }

    const normalizedForModel = normalizeToolParts(validated);

    const modelMessages = await convertToModelMessages(normalizedForModel, {
      tools: toolSet,
      ignoreIncompleteToolCalls: true,
    });

    const baseURL = env.OPENAI_BASE_URL;
    const openai = createOpenAI({
      apiKey: env.OPENAI_API_KEY,
      baseURL,
      headers: buildExtraHeaders(),
    });

    const modelId = env.OPENAI_MODEL ?? DEFAULT_MODEL;

    // The AI SDK OpenAI provider defaults to the newer Responses API when calling `openai(modelId)`.
    // Many OpenAI-compatible providers (including OpenRouter) support Chat Completions but not Responses.
    const apiMode = env.OPENAI_API_MODE;
    const useChatCompletions = apiMode === "chat" || (apiMode == null && baseURL != null);
    const model = useChatCompletions ? openai.chat(modelId as never) : openai(modelId as never);

    const mentionContext = buildMentionContext(validated);

    const threadAppendix = [
      "Thread context:",
      `- Current thread id: ${threadId}`,
      "- When deleting this thread, always use the current thread id.",
      "- Never guess thread ids.",
    ].join("\n");

    const system = [SYSTEM_PROMPT, threadAppendix, mentionContext]
      .filter(Boolean)
      .join("\n\n");

    const result = streamText({
      model,
      system,
      messages: modelMessages,
      tools: toolSet,
      toolChoice: "auto",
      experimental_context: {
        uiMessages: normalizedForModel,
      },
    });

    return result.toUIMessageStreamResponse({
      originalMessages: validated,
      generateMessageId: generateId,
      onFinish: async ({ messages }) => {
        await saveChatHistory(threadId, messages);
      },
    });
  } catch (error) {
    console.error("POST /api/chat failed", error);
    return NextResponse.json({ error: "Failed to process chat" }, { status: 500 });
  }
}
