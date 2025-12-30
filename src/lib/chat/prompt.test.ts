import { describe, expect, it } from "bun:test";

import { SYSTEM_PROMPT } from "@/lib/chat/prompt";

describe("SYSTEM_PROMPT", () => {
  it("includes strict confirm-before-mutate guidance", () => {
    expect(SYSTEM_PROMPT).toContain("Confirmation policy (strict):");
    expect(SYSTEM_PROMPT).toContain("Never call dangerous tools");
    expect(SYSTEM_PROMPT).toContain("If denied: respond with 'Action canceled.'");
    expect(SYSTEM_PROMPT).toContain(
      "Do not include the confirmationToken in tool arguments. It is handled automatically."
    );
  });
});
