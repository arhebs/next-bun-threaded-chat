import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";
import { useState } from "react";
import type { UIMessage } from "ai";

import { installDom } from "@/test-utils/dom";

installDom();

const { cleanup, fireEvent, render, screen, within } = await import("@testing-library/react");
const userEvent = (await import("@testing-library/user-event")).default;

const sendMessageCalls: unknown[] = [];
const addToolOutputCalls: unknown[] = [];

mock.module("@ai-sdk/react", () => {
  class Chat {
    id: string;
    messages: UIMessage[];

    constructor({ id, messages }: { id: string; messages?: UIMessage[] }) {
      this.id = id;
      this.messages = messages ?? [];
    }
  }

  return {
    Chat,
    useChat: (options: any) => {
      const chat = options?.chat;
      const initialMessages: UIMessage[] = Array.isArray(chat?.messages)
        ? chat.messages
        : options.messages ?? [];

      const [messages, setMessagesState] = useState<UIMessage[]>(initialMessages);

      const setMessages = (next: unknown) => {
        setMessagesState((current) => {
          const resolved =
            typeof next === "function"
              ? (next as (messages: UIMessage[]) => UIMessage[])(current)
              : (next as UIMessage[]);

          if (chat) {
            chat.messages = resolved;
          }

          return resolved;
        });
      };

      const clearError = () => {
        // no-op
      };

      const addToolOutput = async (call: unknown) => {
        addToolOutputCalls.push(call);
      };

      const sendMessage = async (call: unknown) => {
        sendMessageCalls.push(call);
      };

      return {
        messages,
        setMessages,
        addToolOutput,
        sendMessage,
        clearError,
        status: "ready",
        error: null,
      };
    },
  };
});


const { ChatPanel } = await import("@/components/chat/ChatPanel");

const THREAD = {
  id: "thread-1",
  title: "",
  createdAt: 0,
  updatedAt: 0,
};


afterEach(() => {
  cleanup();
  sendMessageCalls.length = 0;
  addToolOutputCalls.length = 0;
});

afterAll(() => {
  mock.restore();
});

describe("ChatPanel", () => {
  it("renders a placeholder when no thread is selected", () => {
    render(
      <ChatPanel
        thread={null}
        initialMessages={[]}
        isLoading={false}
        error={null}
      />
    );

    expect(
      screen.getByRole("heading", { name: "No thread selected" })
    ).toBeTruthy();
    expect(
      screen.queryByPlaceholderText("Type a message to get started...")
    ).toBeNull();
  });

  it("trims input, clears draft, and calls sendMessage", async () => {
    const user = userEvent.setup();

    render(
      <ChatPanel
        thread={THREAD}
        initialMessages={[]}
        isLoading={false}
        error={null}
      />
    );

    const textarea = screen.getByPlaceholderText(
      "Type a message to get started..."
    ) as HTMLTextAreaElement;

    await user.type(textarea, "  hello world  ");

    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(sendMessageCalls).toHaveLength(1);
    expect(sendMessageCalls[0]).toEqual({ text: "hello world" });
    expect(textarea.value).toBe("");
  });

  it("keeps drafts isolated per thread", async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <ChatPanel
        thread={THREAD}
        initialMessages={[]}
        isLoading={false}
        error={null}
      />
    );

    const textarea = screen.getByPlaceholderText(
      "Type a message to get started..."
    ) as HTMLTextAreaElement;

    await user.type(textarea, "draft A");
    expect(textarea.value).toBe("draft A");

    rerender(
      <ChatPanel
        thread={{ ...THREAD, id: "thread-2" }}
        initialMessages={[]}
        isLoading={false}
        error={null}
      />
    );

    const textareaThread2 = screen.getByPlaceholderText(
      "Type a message to get started..."
    ) as HTMLTextAreaElement;
    expect(textareaThread2.value).toBe("");

    await user.type(textareaThread2, "draft B");
    expect(textareaThread2.value).toBe("draft B");

    rerender(
      <ChatPanel
        thread={THREAD}
        initialMessages={[]}
        isLoading={false}
        error={null}
      />
    );

    const textareaThread1Again = screen.getByPlaceholderText(
      "Type a message to get started..."
    ) as HTMLTextAreaElement;
    expect(textareaThread1Again.value).toBe("draft A");
  });

  it("opens a table modal when clicking the readRange preview", async () => {
    const user = userEvent.setup();

    const messages: UIMessage[] = [
      {
        id: "assistant-range",
        role: "assistant",
        parts: [
           {
             type: "tool-readRange",
             toolCallId: "call-range",
             state: "output-available",
             output: {
               sheet: "Sheet1",
               range: "A1:F1",
               values: [
                 ["ID", "Name", "Email", "Region", "SalesAmount", "Commission"],
               ],
             },
           } as unknown as UIMessage["parts"][number],
        ],
      },
    ];

    render(
      <ChatPanel
        thread={THREAD}
        initialMessages={messages}
        isLoading={false}
        error={null}
      />
    );

    expect(screen.getByText("Sheet1!A1:F1")).toBeTruthy();
    const preview = screen.getByRole("table", {
      name: /preview sheet1!a1:f1/i,
    });
    expect(preview).toBeTruthy();

    await user.click(preview);

    const dialog = screen.getByRole("dialog", { name: /sheet1!a1:f1/i });
    expect(dialog).toBeTruthy();
    expect(within(dialog).getByText("ID")).toBeTruthy();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("inserts a mention for a dragged table selection", async () => {
    const user = userEvent.setup();

    const messages: UIMessage[] = [
      {
        id: "assistant-range",
        role: "assistant",
        parts: [
           {
             type: "tool-readRange",
             toolCallId: "call-range",
             state: "output-available",
             output: {
               sheet: "Sheet1",
               range: "A1:B2",
               values: [
                 ["ID", "Name"],
                 [1, "Ava Chen"],
               ],
             },
           } as unknown as UIMessage["parts"][number],
        ],
      },
    ];

    render(
      <ChatPanel
        thread={THREAD}
        initialMessages={messages}
        isLoading={false}
        error={null}
      />
    );

    const textarea = screen.getByPlaceholderText(
      "Type a message to get started..."
    ) as HTMLTextAreaElement;

    await user.type(textarea, "Check");

    const preview = screen.getByRole("table", {
      name: /preview sheet1!a1:b2/i,
    });

    await user.click(preview);

    const dialog = screen.getByRole("dialog", { name: /sheet1!a1:b2/i });

    const startCell = within(dialog).getByLabelText("Cell A2");
    const endCell = within(dialog).getByLabelText("Cell B2");

    fireEvent.mouseDown(startCell);
    fireEvent.mouseEnter(endCell);
    fireEvent.mouseUp(endCell);

    expect(within(dialog).getByText("@Sheet1!A2:B2")).toBeTruthy();

    const insertButton = within(dialog).getByRole("button", {
      name: "Insert mention",
    });

    await user.click(insertButton);

    expect(textarea.value).toBe("Check @Sheet1!A2:B2");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders markdown tables as a UI table", () => {
    const messages: UIMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: ["| ID | Name |", "| --- | --- |", "| 1 | Ava Chen |"].join("\n"),
          },
        ],
      },
    ];

    render(
      <ChatPanel
        thread={THREAD}
        initialMessages={messages}
        isLoading={false}
        error={null}
      />
    );

    const table = screen.getByRole("table", { name: "Markdown table" });
    expect(table).toBeTruthy();

    const tableScope = within(table);
    expect(tableScope.getByText("ID")).toBeTruthy();
    expect(tableScope.getByText("Name")).toBeTruthy();
    expect(tableScope.getByText("1")).toBeTruthy();
    expect(tableScope.getByText("Ava Chen")).toBeTruthy();
  });

  it("emits confirmAction tool output on approve/decline", async () => {
    const user = userEvent.setup();

    const messages: UIMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
           {
             type: "tool-confirmAction",
             toolCallId: "call-1",
             state: "input-available",
             input: {
               action: "deleteThread",
               actionPayload: { threadId: "thread-1" },
               prompt: "Confirm delete",
             },
           } as unknown as UIMessage["parts"][number],
        ],
      },
    ];

    render(
      <ChatPanel
        thread={THREAD}
        initialMessages={messages}
        isLoading={false}
        error={null}
      />
    );

    await user.click(screen.getByRole("button", { name: "Approve" }));
    await user.click(screen.getByRole("button", { name: "Approve" }));

    expect(addToolOutputCalls).toHaveLength(2);

    const firstCall = addToolOutputCalls[0] as unknown as {
      tool?: unknown;
      toolCallId?: unknown;
      output?: unknown;
    };
    const secondCall = addToolOutputCalls[1] as unknown as {
      tool?: unknown;
      toolCallId?: unknown;
      output?: unknown;
    };

    expect(firstCall.tool).toBe("confirmAction");
    expect(firstCall.toolCallId).toBe("call-1");

    const firstOutput = firstCall.output as unknown as {
      approved?: unknown;
      action?: unknown;
      actionPayload?: unknown;
      confirmationToken?: unknown;
    };

    const secondOutput = secondCall.output as unknown as {
      confirmationToken?: unknown;
    };

    expect(firstOutput.approved).toBe(true);
    expect(firstOutput.action).toBe("deleteThread");
    expect(firstOutput.actionPayload).toEqual({ threadId: "thread-1" });
    expect(typeof firstOutput.confirmationToken).toBe("string");
    expect((firstOutput.confirmationToken as string).length).toBeGreaterThan(0);

    expect(secondOutput.confirmationToken).toBe(firstOutput.confirmationToken);

    addToolOutputCalls.length = 0;

    await user.click(screen.getByRole("button", { name: "Decline" }));

    expect(addToolOutputCalls).toHaveLength(1);

    const declined = addToolOutputCalls[0] as unknown as { output?: unknown };
    const declinedOutput = declined.output as unknown as {
      approved?: unknown;
      reason?: unknown;
    };

    expect(declinedOutput.approved).toBe(false);
    expect(declinedOutput.reason).toBe("User declined");
  });
});
