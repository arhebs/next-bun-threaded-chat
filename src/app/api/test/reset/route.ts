import { NextResponse } from "next/server";

import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  if (process.env.PLAYWRIGHT !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const db = getDb();
    db.exec("DELETE FROM consumed_confirmations;");
    db.exec("DELETE FROM messages;");
    db.exec("DELETE FROM threads;");

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("POST /api/test/reset failed", error);
    return NextResponse.json({ error: "Failed to reset" }, { status: 500 });
  }
}
