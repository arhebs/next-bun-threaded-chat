import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, generateId, streamText, validateUIMessages } from "ai";
import type { Tool } from "ai";
import { NextResponse } from "next/server";

import { SYSTEM_PROMPT } from "@/lib/chat/prompt";
import { tools } from "@/lib/chat/tools";
import { upsertMessages } from "@/lib/db/messages";
import { touchThread } from "@/lib/db/threads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ChatRequestBody = {
  id?: string;
  messages?: unknown;
};

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

    const validated = await validateUIMessages({
      messages: body.messages,
      tools: toolSet,
    });

    const modelMessages = await convertToModelMessages(validated, {
      tools: toolSet,
    });

    const result = streamText({
      model: openai("gpt-4o-mini"),
      system: SYSTEM_PROMPT,
      messages: modelMessages,
      tools: toolSet,
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
