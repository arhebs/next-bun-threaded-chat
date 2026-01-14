import { createOpenAI } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  generateId,
  streamText,
  validateUIMessages,
} from "ai";
import type { UIMessage } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { handleMockChat } from "@/lib/chat/mock-handler";
import { SYSTEM_PROMPT } from "@/lib/chat/prompt";
import { saveChatHistory } from "@/lib/chat/persistence";
import { normalizeToolParts } from "@/lib/chat/tool-part-normalize";
import { sanitizeUIMessagesForValidation } from "@/lib/chat/ui-message-sanitize";
import { toolsForAiSdk } from "@/lib/chat/tools";
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
  return env.MOCK_CHAT === "1";
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
    const json: unknown = await request.json().catch(() => undefined);
    if (json === undefined) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsedBody = chatSchema.safeParse(json);

    if (!parsedBody.success) {
      const issueMessages = parsedBody.error.issues.map((issue) => issue.message);
      if (issueMessages.includes("Missing thread id")) {
        return NextResponse.json({ error: "Missing thread id" }, { status: 400 });
      }
      if (issueMessages.includes("Missing messages")) {
        return NextResponse.json({ error: "Missing messages" }, { status: 400 });
      }

      return NextResponse.json(
        { error: "Invalid request", details: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    const { id: threadId, messages: rawMessages } = parsedBody.data;
    const toolSet = toolsForAiSdk;

    const sanitizedIncomingMessages = sanitizeUIMessagesForValidation(rawMessages);

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
