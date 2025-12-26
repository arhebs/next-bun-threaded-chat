import type { UIMessage } from "ai";

type MessagePart = UIMessage["parts"][number];

function isToolPart(part: MessagePart): boolean {
  if (part.type === "dynamic-tool") {
    return true;
  }
  return typeof part.type === "string" && part.type.startsWith("tool-");
}

export function extractContentText(message: UIMessage): string | null {
  const text = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");

  return text.length > 0 ? text : null;
}

export function extractToolInvocations(message: UIMessage): MessagePart[] {
  return message.parts.filter(isToolPart);
}
