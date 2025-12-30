import { NextResponse } from "next/server";

import { createThread, listThreads } from "@/lib/db/threads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const threads = listThreads();
    return NextResponse.json({ threads }, { status: 200 });
  } catch (error) {
    console.error("GET /api/threads failed", error);
    return NextResponse.json(
      { error: "Failed to list threads" },
      { status: 500 }
    );
  }
}

export async function POST(_request: Request): Promise<Response> {
  void _request;
  try {
    const thread = createThread();
    return NextResponse.json({ thread }, { status: 201 });
  } catch (error) {
    console.error("POST /api/threads failed", error);
    return NextResponse.json(
      { error: "Failed to create thread" },
      { status: 500 }
    );
  }
}
