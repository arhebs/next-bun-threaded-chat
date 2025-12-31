import { describe, expect, it } from "bun:test";
import type { UIMessage } from "ai";

import { normalizeToolParts } from "@/lib/chat/tool-part-normalize";

function makeMessage(parts: UIMessage["parts"], id = "msg-1"): UIMessage {
  return { id, role: "assistant", parts };
}

describe("normalizeToolParts", () => {
  it("returns messages unchanged when no tool parts exist", () => {
    const messages: UIMessage[] = [
      makeMessage([{ type: "text", text: "Hello" }]),
    ];

    const result = normalizeToolParts(messages);

    expect(result).toEqual(messages);
  });

  it("deduplicates tool parts by toolCallId, keeping higher-scored state", () => {
    const messages: UIMessage[] = [
      makeMessage([
        {
          type: "tool-readRange",
          toolCallId: "call-1",
          state: "input-streaming",
          input: { sheet: "Sheet1", range: "A1" },
        } as any,
        {
          type: "tool-readRange",
          toolCallId: "call-1",
          state: "output-available",
          output: { sheet: "Sheet1", range: "A1", values: [[1]] },
        } as any,
      ]),
    ];

    const result = normalizeToolParts(messages);

    expect(result).toHaveLength(1);
    expect(result[0].parts).toHaveLength(1);

    const part = result[0].parts[0] as any;
    expect(part.toolCallId).toBe("call-1");
    expect(part.state).toBe("output-available");
    expect(part.input).toEqual({ sheet: "Sheet1", range: "A1" });
    expect(part.output).toEqual({ sheet: "Sheet1", range: "A1", values: [[1]] });
  });

  it("returns original message when part count is unchanged", () => {
    const messages: UIMessage[] = [
      makeMessage([
        { type: "text", text: "Before" },
        {
          type: "tool-readRange",
          toolCallId: "call-1",
          state: "output-available",
          output: { values: [] },
        } as any,
        { type: "text", text: "After" },
      ]),
    ];

    const result = normalizeToolParts(messages);

    expect(result[0]).toBe(messages[0]);
  });

  it("fills missing input from later duplicate", () => {
    const messages: UIMessage[] = [
      makeMessage([
        {
          type: "tool-updateCell",
          toolCallId: "call-2",
          state: "output-available",
          output: { sheet: "Sheet1", cell: "A1", value: 42 },
        } as any,
        {
          type: "tool-updateCell",
          toolCallId: "call-2",
          state: "input-available",
          input: { sheet: "Sheet1", cell: "A1", value: 42 },
        } as any,
      ]),
    ];

    const result = normalizeToolParts(messages);

    const part = result[0].parts[0] as any;
    expect(part.input).toEqual({ sheet: "Sheet1", cell: "A1", value: 42 });
    expect(part.output).toEqual({ sheet: "Sheet1", cell: "A1", value: 42 });
    expect(part.state).toBe("output-available");
  });

  it("merges errorText from incoming part while preserving input", () => {
    const messages: UIMessage[] = [
      makeMessage([
        {
          type: "tool-readRange",
          toolCallId: "call-3",
          state: "input-available",
          input: { sheet: "Sheet1", range: "A1" },
        } as any,
        {
          type: "tool-readRange",
          toolCallId: "call-3",
          state: "output-error",
          errorText: "Range too large",
        } as any,
      ]),
    ];

    const result = normalizeToolParts(messages);

    const part = result[0].parts[0] as any;
    expect(part.errorText).toBe("Range too large");
    expect(part.input).toEqual({ sheet: "Sheet1", range: "A1" });
  });

  it("skips tool parts with empty toolCallId", () => {
    const messages: UIMessage[] = [
      makeMessage([
        {
          type: "tool-readRange",
          toolCallId: "   ",
          state: "input-available",
          input: {},
        } as any,
        {
          type: "tool-readRange",
          toolCallId: "valid-id",
          state: "output-available",
          output: { values: [] },
        } as any,
      ]),
    ];

    const result = normalizeToolParts(messages);

    expect(result[0].parts).toHaveLength(1);
    expect((result[0].parts[0] as any).toolCallId).toBe("valid-id");
  });

  it("handles dynamic-tool type parts", () => {
    const messages: UIMessage[] = [
      makeMessage([
        {
          type: "dynamic-tool",
          toolCallId: "dyn-1",
          toolName: "customTool",
          state: "input-available",
          input: { foo: "bar" },
        } as any,
        {
          type: "dynamic-tool",
          toolCallId: "dyn-1",
          state: "output-available",
          output: { result: "ok" },
        } as any,
      ]),
    ];

    const result = normalizeToolParts(messages);

    expect(result[0].parts).toHaveLength(1);

    const part = result[0].parts[0] as any;
    expect(part.type).toBe("dynamic-tool");
    expect(part.toolName).toBe("customTool");
    expect(part.state).toBe("output-available");
    expect(part.input).toEqual({ foo: "bar" });
    expect(part.output).toEqual({ result: "ok" });
  });

  it("preserves approval field from incoming part", () => {
    const messages: UIMessage[] = [
      makeMessage([
        {
          type: "tool-confirmAction",
          toolCallId: "call-6",
          state: "input-available",
          input: { action: "updateCell" },
        } as any,
        {
          type: "tool-confirmAction",
          toolCallId: "call-6",
          state: "output-available",
          approval: "approved",
          output: { approved: true },
        } as any,
      ]),
    ];

    const result = normalizeToolParts(messages);

    const part = result[0].parts[0] as any;
    expect(part.approval).toBe("approved");
  });

  it("returns empty parts array unchanged", () => {
    const messages: UIMessage[] = [makeMessage([])];

    const result = normalizeToolParts(messages);

    expect(result).toEqual(messages);
  });

  it("preserves tool part order based on first occurrence", () => {
    const messages: UIMessage[] = [
      makeMessage([
        {
          type: "tool-readRange",
          toolCallId: "first",
          state: "input-available",
          input: {},
        } as any,
        {
          type: "tool-updateCell",
          toolCallId: "second",
          state: "input-available",
          input: {},
        } as any,
        {
          type: "tool-readRange",
          toolCallId: "first",
          state: "output-available",
          output: { values: [] },
        } as any,
      ]),
    ];

    const result = normalizeToolParts(messages);

    expect(result[0].parts).toHaveLength(2);
    expect((result[0].parts[0] as any).toolCallId).toBe("first");
    expect((result[0].parts[1] as any).toolCallId).toBe("second");
  });
});
