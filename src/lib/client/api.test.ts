import { afterEach, describe, expect, it } from "bun:test";

import {
  createThread,
  fetchThreadMessages,
  listThreads,
  type Thread,
} from "@/lib/client/api";

type FetchCall = {
  input: RequestInfo | URL;
  init?: RequestInit;
};

describe("client api", () => {
  const realFetch = globalThis.fetch;
  const calls: FetchCall[] = [];

  afterEach(() => {
    globalThis.fetch = realFetch;
    calls.length = 0;
  });

  it("listThreads calls /api/threads with JSON headers", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      const payload: { threads: Thread[] } = { threads: [] };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const threads = await listThreads();
    expect(threads).toEqual([]);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe("/api/threads");
    expect(new Headers(calls[0]?.init?.headers).get("Content-Type")).toBe(
      "application/json"
    );
  });

  it("createThread posts an empty JSON body", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      const payload = {
        thread: {
          id: "t1",
          title: "",
          createdAt: 1,
          updatedAt: 1,
        },
      };
      return new Response(JSON.stringify(payload), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const thread = await createThread();
    expect(thread.id).toBe("t1");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe("/api/threads");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.body).toBe("{}");
  });

  it("propagates API errors with JSON error field", async () => {
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ error: "Nope" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    await expect(listThreads()).rejects.toThrow("Nope");
  });

  it("fetchThreadMessages encodes thread id", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push({ input });
      return new Response(JSON.stringify({ messages: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    await fetchThreadMessages("a/b");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe("/api/threads/a%2Fb/messages");
  });
});
