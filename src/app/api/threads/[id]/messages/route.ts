import { NextResponse } from "next/server";

import { loadUIMessages } from "@/lib/db/messages";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  void request;

  try {
    const threadId = context.params.id;
    if (!threadId || threadId.trim().length === 0) {
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
