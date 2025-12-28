import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";
import { useCallback, useState } from "react";

import { installDom } from "@/test-utils/dom";

installDom();

const { cleanup, render, screen, waitFor } = await import("@testing-library/react");
const userEvent = (await import("@testing-library/user-event")).default;

type Thread = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

const listThreadsCalls: unknown[] = [];
const createThreadCalls: unknown[] = [];

let listThreadsImpl: () => Promise<Thread[]> = async () => [];
let createThreadImpl: () => Promise<Thread> = async () => {
  return { id: "new", title: "", createdAt: 0, updatedAt: 0 };
};

mock.module("@/lib/client/api", () => {
  return {
    listThreads: async () => {
      listThreadsCalls.push({});
      return await listThreadsImpl();
    },
    createThread: async () => {
      createThreadCalls.push({});
      return await createThreadImpl();
    },
  };
});

const { ThreadSidebar } = await import("@/components/chat/ThreadSidebar");

type HarnessProps = {
  initialThreads: Thread[];
  selectedThreadId: string | null;
  onSelectAction?: (threadId: string, options?: { skipMessageLoad?: boolean }) => void;
  onCloseAction?: () => void;
  onThreadsChangeCapture?: (threads: Thread[]) => void;
};

function ThreadSidebarHarness({
  initialThreads,
  selectedThreadId,
  onSelectAction,
  onCloseAction,
  onThreadsChangeCapture,
}: HarnessProps) {
  const [threads, setThreads] = useState<Thread[]>(initialThreads);

  const handleThreadsChange = useCallback(
    (nextThreads: Thread[]) => {
      onThreadsChangeCapture?.(nextThreads);
      setThreads(nextThreads);
    },
    [onThreadsChangeCapture]
  );

  return (
    <ThreadSidebar
      threads={threads}
      selectedThreadId={selectedThreadId}
      onSelectAction={onSelectAction ?? (() => {})}
      onThreadsChangeAction={handleThreadsChange}
      onCloseAction={onCloseAction}
    />
  );
}

afterEach(() => {
  cleanup();
  listThreadsCalls.length = 0;
  createThreadCalls.length = 0;
  listThreadsImpl = async () => [];
  createThreadImpl = async () => {
    return { id: "new", title: "", createdAt: 0, updatedAt: 0 };
  };
});

describe("ThreadSidebar", () => {
  it("fetches threads on mount and forwards them", async () => {
    const threads: Thread[] = [
      { id: "t1", title: "First", createdAt: 1, updatedAt: 1 },
    ];
    listThreadsImpl = async () => threads;

    const onThreadsChangeCalls: Thread[][] = [];

    render(
      <ThreadSidebarHarness
        initialThreads={[]}
        selectedThreadId={null}
        onThreadsChangeCapture={(next) => onThreadsChangeCalls.push(next)}
      />
    );

    await waitFor(() => {
      expect(listThreadsCalls).toHaveLength(1);
      expect(onThreadsChangeCalls.length).toBeGreaterThan(0);
    });

    const lastThreadsChange = onThreadsChangeCalls[onThreadsChangeCalls.length - 1];
    expect(lastThreadsChange).toEqual(threads);

    expect(await screen.findByRole("button", { name: /First/ })).toBeTruthy();
  });

  it("shows an error when threads fetch fails", async () => {
    listThreadsImpl = async () => {
      throw new Error("Failed to load threads");
    };

    render(
      <ThreadSidebarHarness initialThreads={[]} selectedThreadId={null} />
    );

    expect(await screen.findByText("Failed to load threads")).toBeTruthy();
  });

  it("creates a new thread and selects it", async () => {
    const user = userEvent.setup();

    const existingThreads: Thread[] = [
      { id: "t1", title: "First", createdAt: 1, updatedAt: 1 },
    ];
    const createdThread: Thread = {
      id: "t2",
      title: "",
      createdAt: 2,
      updatedAt: 2,
    };

    createThreadImpl = async () => createdThread;
    listThreadsImpl = async () => existingThreads;

    const onThreadsChangeCalls: Thread[][] = [];
    const onSelectCalls: unknown[] = [];
    const onCloseCalls: unknown[] = [];

    render(
      <ThreadSidebarHarness
        initialThreads={existingThreads}
        selectedThreadId={null}
        onSelectAction={(threadId, options) => onSelectCalls.push({ threadId, options })}
        onCloseAction={() => onCloseCalls.push({})}
        onThreadsChangeCapture={(next) => onThreadsChangeCalls.push(next)}
      />
    );

    await user.click(screen.getByRole("button", { name: "New" }));

    await waitFor(() => {
      expect(createThreadCalls).toHaveLength(1);
      expect(onSelectCalls).toHaveLength(1);
      expect(onCloseCalls).toHaveLength(1);
      expect(onThreadsChangeCalls.length).toBeGreaterThan(0);
    });

    const lastThreadsChange = onThreadsChangeCalls[onThreadsChangeCalls.length - 1];
    expect(lastThreadsChange).toEqual([createdThread, ...existingThreads]);
    expect(onSelectCalls[0]).toEqual({
      threadId: "t2",
      options: { skipMessageLoad: true },
    });
  });

  it("clicking selected thread only closes", async () => {
    const user = userEvent.setup();

    const threads: Thread[] = [
      { id: "t1", title: "First", createdAt: 1, updatedAt: 1 },
      { id: "t2", title: "Second", createdAt: 2, updatedAt: 2 },
    ];

    const onSelectCalls: unknown[] = [];
    const onCloseCalls: unknown[] = [];

    render(
      <ThreadSidebarHarness
        initialThreads={threads}
        selectedThreadId="t1"
        onSelectAction={(threadId) => onSelectCalls.push(threadId)}
        onCloseAction={() => onCloseCalls.push({})}
      />
    );

    await user.click(screen.getByRole("button", { name: /First/ }));

    expect(onCloseCalls).toHaveLength(1);
    expect(onSelectCalls).toHaveLength(0);
  });

  it("merges late listThreads results with a newly created thread", async () => {
    const user = userEvent.setup();

    const existingThreads: Thread[] = [
      { id: "t-existing", title: "Existing", createdAt: 1, updatedAt: 1 },
    ];

    const createdThread: Thread = {
      id: "t-new",
      title: "",
      createdAt: 2,
      updatedAt: 2,
    };

    let resolveList: (threads: Thread[]) => void = () => {
      throw new Error("resolveList not set");
    };

    listThreadsImpl = async () =>
      await new Promise<Thread[]>((resolve) => {
        resolveList = resolve;
      });

    createThreadImpl = async () => createdThread;

    render(<ThreadSidebarHarness initialThreads={[]} selectedThreadId={null} />);

    await waitFor(() => {
      expect(listThreadsCalls).toHaveLength(1);
    });

    await user.click(screen.getByRole("button", { name: "New" }));

    await waitFor(() => {
      expect(createThreadCalls).toHaveLength(1);
    });

    resolveList(existingThreads);

    expect(await screen.findByRole("button", { name: /Untitled thread/ })).toBeTruthy();
    expect(await screen.findByRole("button", { name: /Existing/ })).toBeTruthy();
  });
});

afterAll(() => {
  mock.restore();
});
