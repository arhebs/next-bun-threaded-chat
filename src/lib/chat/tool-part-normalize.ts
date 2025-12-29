import type { UIMessage } from "ai";

type MessagePart = UIMessage["parts"][number];

type ToolState = string;

type ToolPartRecord = Record<string, unknown> & {
  type: string;
  toolCallId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isToolPart(part: unknown): part is ToolPartRecord {
  if (!isRecord(part)) {
    return false;
  }

  const type = part.type;
  if (type === "dynamic-tool") {
    return typeof part.toolCallId === "string";
  }

  return typeof type === "string" && type.startsWith("tool-") && typeof part.toolCallId === "string";
}

function scoreState(state: ToolState | undefined): number {
  if (!state) {
    return 0;
  }

  // Higher score wins.
  if (state === "output-error") return 50;
  if (state === "output-denied") return 45;
  if (state === "output-available") return 40;
  if (state === "output-streaming") return 35;
  if (state === "input-available") return 30;
  if (state === "input-streaming") return 20;

  if (state.startsWith("output")) return 10;
  if (state.startsWith("input")) return 5;
  return 1;
}

function mergeToolPart(base: ToolPartRecord, incoming: ToolPartRecord): ToolPartRecord {
  const merged: ToolPartRecord = { ...base };

  // Preserve the most informative state.
  const baseState = typeof base.state === "string" ? base.state : undefined;
  const incomingState = typeof incoming.state === "string" ? incoming.state : undefined;
  if (scoreState(incomingState) > scoreState(baseState)) {
    merged.state = incomingState;
  }

  // Prefer existing input, but fill if missing.
  if (!("input" in merged) && "input" in incoming) {
    merged.input = incoming.input;
  }

  // Prefer existing output, but fill if missing.
  if (!("output" in merged) && "output" in incoming) {
    merged.output = incoming.output;
  }

  // Preserve error text.
  if (!("errorText" in merged) && "errorText" in incoming) {
    merged.errorText = incoming.errorText;
  }

  // Preserve approval.
  if (!("approval" in merged) && "approval" in incoming) {
    merged.approval = incoming.approval;
  }

  // Preserve dynamic tool name.
  if (merged.type === "dynamic-tool" && !("toolName" in merged) && "toolName" in incoming) {
    merged.toolName = incoming.toolName;
  }

  return merged;
}

function normalizeToolPartsInMessage(message: UIMessage): UIMessage {
  const originalParts = Array.isArray(message.parts) ? message.parts : [];
  if (originalParts.length === 0) {
    return message;
  }

  const otherParts: MessagePart[] = [];
  const toolPartsById = new Map<string, ToolPartRecord>();
  const toolPartOrder: string[] = [];

  for (const part of originalParts) {
    if (!isToolPart(part)) {
      otherParts.push(part);
      continue;
    }

    const toolCallId = part.toolCallId.trim();
    if (!toolCallId) {
      continue;
    }

    const existing = toolPartsById.get(toolCallId);
    if (existing) {
      toolPartsById.set(toolCallId, mergeToolPart(existing, part));
    } else {
      toolPartsById.set(toolCallId, { ...part, toolCallId });
      toolPartOrder.push(toolCallId);
    }
  }

  if (toolPartOrder.length === 0) {
    return message;
  }

  const normalizedToolParts = toolPartOrder
    .map((toolCallId) => toolPartsById.get(toolCallId))
    .filter((part): part is ToolPartRecord => Boolean(part))
    .map((part) => {
      const state = typeof part.state === "string" ? part.state : "";

      // Ensure a tool-result-like part has a stable output-ish state.
      if (!("input" in part) && "output" in part && !state.startsWith("output")) {
        return { ...part, state: "output-available" };
      }

      // Ensure a tool-call-like part has a stable input-ish state.
      if ("input" in part && !state.startsWith("input") && !("output" in part)) {
        return { ...part, state: "input-available" };
      }

      return part;
    });

  const parts: MessagePart[] = [...otherParts, ...(normalizedToolParts as unknown as MessagePart[])];

  return parts.length === message.parts.length ? message : { ...message, parts };
}

export function normalizeToolParts(messages: UIMessage[]): UIMessage[] {
  return messages.map(normalizeToolPartsInMessage);
}
