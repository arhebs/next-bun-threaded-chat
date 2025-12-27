import { NextResponse } from "next/server";

import { loadUIMessages } from "@/lib/db/messages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  request: Request,
  context: RouteContext
): Promise<Response> {
  void request;

  try {
    const params = await context.params;
    const threadId = typeof params.id === "string" ? params.id.trim() : "";
    if (!threadId) {
      return NextResponse.json({ error: "Missing thread id" }, { status: 400 });
    }

    const messages = loadUIMessages(threadId);
    return NextResponse.json({ messages }, { status: 200 });
  } catch (error) {
    console.error("GET /api/threads/:id/messages failed", error);
    return NextResponse.json(
      { error: "Failed to load messages" },
      { status: 500 }
    );
  }
}
