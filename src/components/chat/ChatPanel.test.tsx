import { afterEach, describe, expect, it, mock } from "bun:test";
import { useState } from "react";
import type { UIMessage } from "ai";

import { installDom } from "@/test-utils/dom";

installDom();

const { cleanup, render, screen } = await import("@testing-library/react");
const userEvent = (await import("@testing-library/user-event")).default;

const sendMessageCalls: unknown[] = [];
const addToolOutputCalls: unknown[] = [];

mock.module("@ai-sdk/react", () => {
  return {
    useChat: (options: any) => {
      const [messages, setMessages] = useState<UIMessage[]>(options.messages ?? []);

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
        status: "ready",
        error: null,
      };
    },
  };
});

mock.module("ai", () => {
  class DefaultChatTransport {
    constructor(_opts: unknown) {
      void _opts;
    }
  }

  return {
    DefaultChatTransport,
    lastAssistantMessageIsCompleteWithToolCalls: () => true,
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
          } as any,
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

    const firstCall = addToolOutputCalls[0] as any;
    const secondCall = addToolOutputCalls[1] as any;

    expect(firstCall.tool).toBe("confirmAction");
    expect(firstCall.toolCallId).toBe("call-1");
    expect(firstCall.output.approved).toBe(true);
    expect(firstCall.output.action).toBe("deleteThread");
    expect(firstCall.output.actionPayload).toEqual({ threadId: "thread-1" });
    expect(typeof firstCall.output.confirmationToken).toBe("string");
    expect(firstCall.output.confirmationToken.length).toBeGreaterThan(0);

    expect(secondCall.output.confirmationToken).toBe(
      firstCall.output.confirmationToken
    );

    addToolOutputCalls.length = 0;

    await user.click(screen.getByRole("button", { name: "Decline" }));

    expect(addToolOutputCalls).toHaveLength(1);
    const declined = addToolOutputCalls[0] as any;
    expect(declined.output.approved).toBe(false);
    expect(declined.output.reason).toBe("User declined");
  });
});
