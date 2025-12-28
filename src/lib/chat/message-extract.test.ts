import { describe, expect, it } from "bun:test";
import type { UIMessage } from "ai";

import {
  extractContentText,
  extractToolInvocations,
} from "@/lib/chat/message-extract";

describe("message-extract", () => {
  it("extractContentText concatenates only text parts", () => {
    const message: UIMessage = {
      id: "m1",
      role: "assistant",
      parts: [
        { type: "text", text: "Hello" },
        { type: "reasoning", text: "(hidden reasoning)" } as any,
        { type: "text", text: " world" },
      ],
    };

    expect(extractContentText(message)).toBe("Hello world");
  });

  it("extractContentText returns null when no text parts exist", () => {
    const message: UIMessage = {
      id: "m2",
      role: "assistant",
      parts: [{ type: "step-start" } as any],
    };

    expect(extractContentText(message)).toBeNull();
  });

  it("extractToolInvocations returns tool-* and dynamic-tool parts", () => {
    const message: UIMessage = {
      id: "m3",
      role: "assistant",
      parts: [
        { type: "text", text: "hi" },
        { type: "tool-confirmAction", toolCallId: "t1" } as any,
        { type: "dynamic-tool", toolName: "sendInvites" } as any,
        { type: "step-start" } as any,
      ],
    };

    const parts = extractToolInvocations(message);
    expect(parts.map((part: any) => part.type)).toEqual([
      "tool-confirmAction",
      "dynamic-tool",
    ]);
  });
});
