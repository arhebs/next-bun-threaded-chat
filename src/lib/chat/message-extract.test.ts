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
        { type: "tool-confirmAction", toolCallId: "t-ignore" } as unknown as UIMessage["parts"][number],
        { type: "text", text: " world" },
      ],
    };

    expect(extractContentText(message)).toBe("Hello world");
  });

  it("extractContentText returns null when no text parts exist", () => {
    const message: UIMessage = {
      id: "m2",
      role: "assistant",
      parts: [
        { type: "tool-confirmAction", toolCallId: "t2" } as unknown as UIMessage["parts"][number],
      ],
    };

    expect(extractContentText(message)).toBeNull();
  });

  it("extractToolInvocations returns tool-* and dynamic-tool parts", () => {
    const message: UIMessage = {
      id: "m3",
      role: "assistant",
      parts: [
        { type: "text", text: "hi" },
        { type: "tool-confirmAction", toolCallId: "t1" } as unknown as UIMessage["parts"][number],
        { type: "dynamic-tool", toolName: "sendInvites" } as unknown as UIMessage["parts"][number],
      ],
    };

    const parts = extractToolInvocations(message);
    expect(parts.map((part) => part.type)).toEqual([
      "tool-confirmAction",
      "dynamic-tool",
    ]);
  });
});
