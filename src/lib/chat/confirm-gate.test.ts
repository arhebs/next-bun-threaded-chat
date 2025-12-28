import { describe, expect, it } from "bun:test";
import type { UIMessage } from "ai";

import { assertConfirmed, getContextMessages } from "@/lib/chat/confirm-gate";

function messageWithConfirmOutput(output: unknown): UIMessage {
  return {
    id: "assistant-1",
    role: "assistant",
    parts: [
      {
        type: "tool-confirmAction",
        toolCallId: "call-1",
        output,
      } as any,
    ],
  };
}

describe("confirm-gate", () => {
  it("getContextMessages throws when context is missing", () => {
    expect(() => getContextMessages(undefined)).toThrow("Missing confirmation context");
    expect(() => getContextMessages({})).toThrow("Missing confirmation context");
    expect(() => getContextMessages({ uiMessages: {} })).toThrow(
      "Missing confirmation context"
    );
  });

  it("allows execution when a matching approval exists", () => {
    const messages: UIMessage[] = [
      messageWithConfirmOutput({
        approved: true,
        confirmationToken: "token-1",
        action: "updateCell",
        actionPayload: { sheet: "Sheet1", cell: "A1", value: 10 },
      }),
    ];

    expect(() =>
      assertConfirmed(messages, {
        token: "token-1",
        action: "updateCell",
        expectedPayload: { sheet: "Sheet1", cell: "A1", value: 10 },
      })
    ).not.toThrow();
  });

  it("throws 'Confirmation denied' when matching denial exists", () => {
    const messages: UIMessage[] = [
      messageWithConfirmOutput({
        approved: false,
        confirmationToken: "token-2",
        action: "deleteThread",
        actionPayload: { threadId: "thread-1" },
      }),
    ];

    expect(() =>
      assertConfirmed(messages, {
        token: "token-2",
        action: "deleteThread",
        expectedPayload: { threadId: "thread-1" },
      })
    ).toThrow("Confirmation denied");
  });

  it("throws 'Missing confirmation' when no matching output exists", () => {
    const messages: UIMessage[] = [
      messageWithConfirmOutput({
        approved: true,
        confirmationToken: "token-3",
        action: "updateCell",
        actionPayload: { sheet: "Sheet1", cell: "A1", value: 10 },
      }),
    ];

    expect(() =>
      assertConfirmed(messages, {
        token: "different-token",
        action: "updateCell",
        expectedPayload: { sheet: "Sheet1", cell: "A1", value: 10 },
      })
    ).toThrow("Missing confirmation");
  });

  it("requires exact payload match (deep equal)", () => {
    const messages: UIMessage[] = [
      messageWithConfirmOutput({
        approved: true,
        confirmationToken: "token-4",
        action: "sendInvites",
        actionPayload: { emails: ["a@example.com", "b@example.com"], message: "Hi" },
      }),
    ];

    expect(() =>
      assertConfirmed(messages, {
        token: "token-4",
        action: "sendInvites",
        expectedPayload: { emails: ["b@example.com", "a@example.com"], message: "Hi" },
      })
    ).toThrow("Missing confirmation");
  });
});
