import { createOpenAI } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  generateId,
  streamText,
  validateUIMessages,
} from "ai";
import type { Tool, UIMessage } from "ai";
import { NextResponse } from "next/server";

import { SYSTEM_PROMPT } from "@/lib/chat/prompt";
import { tools } from "@/lib/chat/tools";
import { upsertMessages } from "@/lib/db/messages";
import { setThreadTitleIfEmpty, touchThread } from "@/lib/db/threads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_MODEL = "gpt-4o-mini";

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

    const title = deriveThreadTitle(validated);
    if (title) {
      setThreadTitleIfEmpty(threadId, title);
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

    const result = streamText({
      model,
      system: SYSTEM_PROMPT,
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
        upsertMessages(threadId, messages);
        touchThread(threadId);
      },
    });
  } catch (error) {
    console.error("POST /api/chat failed", error);
    return NextResponse.json({ error: "Failed to process chat" }, { status: 500 });
  }
}
