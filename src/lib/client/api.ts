import type { UIMessage } from "ai";

type ThreadsResponse = {
  threads: Thread[];
};

type ThreadResponse = {
  thread: Thread;
};

type MessagesResponse = {
  messages: UIMessage[];
};

export type Thread = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error?: unknown }).error)
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export async function listThreads(): Promise<Thread[]> {
  const data = await fetchJson<ThreadsResponse>("/api/threads");
  return data.threads;
}

export async function createThread(): Promise<Thread> {
  const data = await fetchJson<ThreadResponse>("/api/threads", {
    method: "POST",
    body: JSON.stringify({}),
  });
  return data.thread;
}

export async function fetchThreadMessages(threadId: string): Promise<UIMessage[]> {
  const data = await fetchJson<MessagesResponse>(
    `/api/threads/${encodeURIComponent(threadId)}/messages`
  );
  return data.messages;
}
