import { describe, expect, it } from "bun:test";

import { parseMentions } from "@/lib/xlsx/mentions";

describe("parseMentions", () => {
  it("extracts multiple mentions in order", () => {
    const text =
      "Compare @Sheet1!A1:C5 with @Sheet1!D1:D5. Thanks!";

    expect(parseMentions(text)).toEqual([
      { sheet: "Sheet1", range: "A1:C5", raw: "@Sheet1!A1:C5" },
      { sheet: "Sheet1", range: "D1:D5", raw: "@Sheet1!D1:D5" },
    ]);
  });

  it("normalizes Sheet1 and ranges", () => {
    const text = "Explain @sheet1!$b$2";

    expect(parseMentions(text)).toEqual([
      { sheet: "Sheet1", range: "B2", raw: "@sheet1!$b$2" },
    ]);
  });

  it("keeps unsupported sheet names while validating range", () => {
    const text = "Check @Sheet2!A1:B2";

    expect(parseMentions(text)).toEqual([
      { sheet: "Sheet2", range: "A1:B2", raw: "@Sheet2!A1:B2" },
    ]);
  });

  it("ignores invalid ranges", () => {
    const text = "Bad @Sheet1!A0:B2 and @Sheet1!A1:B9999999";

    expect(parseMentions(text)).toEqual([]);
  });

  it("does not treat emails as mentions", () => {
    const text = "Email me at ava.chen@example.com";

    expect(parseMentions(text)).toEqual([]);
  });
});
