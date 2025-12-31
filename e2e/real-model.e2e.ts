import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/test/reset");
  expect(response.status()).toBe(200);
});

test.setTimeout(90_000);

test.describe("1. Thread Management", () => {
  test("1.1 Create thread", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New" }).click();
    await expect(page.getByRole("heading", { name: "Untitled thread" })).toBeVisible();
    await expect(page.getByPlaceholder("Type a message to get started...")).toBeFocused();
  });

  test("1.2 Thread title derivation", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New" }).click();
    const input = page.getByPlaceholder("Type a message to get started...");
    await input.fill("Hello world");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("button", { name: /Hello world/ })).toBeVisible({ timeout: 45_000 });
  });

  test("1.3 Long title truncation", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New" }).click();
    const input = page.getByPlaceholder("Type a message to get started...");
    const longMsg = "This is a very long message that should be truncated";
    await input.fill(longMsg);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("button", { name: /This is a very long/ })).toBeVisible({ timeout: 60_000 });
  });

  test("1.4 Switch threads", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "New" }).click();
    const input = page.getByPlaceholder("Type a message to get started...");
    await input.fill("Alpha");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("button", { name: /Alpha/ })).toBeVisible({ timeout: 60_000 });

    await page.getByRole("button", { name: "New" }).click();
    await page.waitForTimeout(500);
    await input.fill("Beta");
    await expect(page.getByRole("button", { name: "Send" })).toBeEnabled({ timeout: 30_000 });
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("button", { name: /Beta/ })).toBeVisible({ timeout: 60_000 });

    await page.getByRole("button", { name: /Alpha/ }).click();
    await expect(page.getByRole("heading", { name: /Alpha/ })).toBeVisible();

    await page.getByRole("button", { name: /Beta/ }).click();
    await expect(page.getByRole("heading", { name: /Beta/ })).toBeVisible();
  });

  test("1.5 Thread persistence", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New" }).click();
    const input = page.getByPlaceholder("Type a message to get started...");
    await input.fill("Persist me");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("button", { name: /Persist me/ })).toBeVisible({ timeout: 45_000 });

    await page.reload();
    await expect(page.getByRole("button", { name: /Persist me/ })).toBeVisible();
    await expect(page.getByRole("log", { name: "Chat messages" }).getByText("Persist me")).toBeVisible();
  });

  test("1.7 Empty state", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("No threads yet")).toBeVisible();
  });
});

test.describe("2. Chat Input & Sending", () => {
  test("2.1 Send button disabled when empty", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New" }).click();
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  test("2.2 Send button enabled when text entered", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New" }).click();
    await page.getByPlaceholder("Type a message to get started...").fill("Hello");
    await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
  });

  test("2.7 Input clears on send", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New" }).click();
    const input = page.getByPlaceholder("Type a message to get started...");
    await input.fill("Clear me");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(input).toHaveValue("");
  });
});

test.describe("3. Spreadsheet Mentions", () => {
  test("3.1 Single mention shows range preview", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New" }).click();
    const input = page.getByPlaceholder("Type a message to get started...");
    await input.fill("Show @Sheet1!A1:B2");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByRole("table", { name: /Preview Sheet1!A1:B2/ })).toBeVisible({ timeout: 45_000 });
  });

  test("3.3 Single cell mention", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New" }).click();
    const input = page.getByPlaceholder("Type a message to get started...");
    await input.fill("What is in @Sheet1!A1?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByRole("table", { name: /Preview Sheet1!A1/ })).toBeVisible({ timeout: 45_000 });
  });
});

test.describe("4. Table Modal & Cell Selection", () => {
  test("4.1 Click preview opens modal", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New" }).click();
    const input = page.getByPlaceholder("Type a message to get started...");
    await input.fill("Show @Sheet1!A1:C3");
    await page.getByRole("button", { name: "Send" }).click();

    const preview = page.getByRole("table", { name: /Preview Sheet1!A1:C3/ });
    await expect(preview).toBeVisible({ timeout: 45_000 });
    await preview.click();

    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("4.5 Insert mention from modal", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New" }).click();
    const input = page.getByPlaceholder("Type a message to get started...");
    await input.fill("Show @Sheet1!A1:C3");
    await page.getByRole("button", { name: "Send" }).click();

    const preview = page.getByRole("table", { name: /Preview Sheet1!A1:C3/ });
    await expect(preview).toBeVisible({ timeout: 45_000 });
    await preview.click();

    const dialog = page.getByRole("dialog");
    const startCell = dialog.getByLabel("Cell A2");
    const endCell = dialog.getByLabel("Cell B2");

    await startCell.hover();
    await page.mouse.down();
    await endCell.hover();
    await page.mouse.up();

    await dialog.getByRole("button", { name: "Insert mention" }).click();
    await expect(dialog).toBeHidden();
    await expect(input).toHaveValue("@Sheet1!A2:B2");
  });

  test("4.7 Escape closes modal", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New" }).click();
    const input = page.getByPlaceholder("Type a message to get started...");
    await input.fill("Show @Sheet1!A1:B2");
    await page.getByRole("button", { name: "Send" }).click();

    const preview = page.getByRole("table", { name: /Preview Sheet1!A1:B2/ });
    await expect(preview).toBeVisible({ timeout: 45_000 });
    await preview.click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});

test.describe("5. Confirmation Flow", () => {
  test("5.1 Confirm card appears", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New" }).click();
    const input = page.getByPlaceholder("Type a message to get started...");
    await input.fill("Please delete this thread");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByRole("heading", { name: "Delete this thread", exact: true })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Decline" })).toBeVisible();
  });

  test("5.2 Approve deletes thread", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "New" }).click();
    const input = page.getByPlaceholder("Type a message to get started...");
    await input.fill("Apples and oranges");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("button", { name: /Apples and oranges/ })).toBeVisible({ timeout: 60_000 });

    await page.getByRole("button", { name: "New" }).click();
    await page.waitForTimeout(500);
    await input.fill("Bananas and grapes");
    await expect(page.getByRole("button", { name: "Send" })).toBeEnabled({ timeout: 30_000 });
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("button", { name: /Bananas and grapes/ })).toBeVisible({ timeout: 60_000 });

    await input.fill("Please delete this thread");
    await expect(page.getByRole("button", { name: "Send" })).toBeEnabled({ timeout: 30_000 });
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByRole("heading", { name: "Delete this thread", exact: true })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Approve" }).click();
    
    await expect(page.getByText("Approved", { exact: true })).toBeVisible({ timeout: 30_000 });

    await page.waitForTimeout(3000);
    await expect(page.getByRole("button", { name: /Bananas and grapes/ })).toBeHidden({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /Apples and oranges/ })).toBeVisible();
  });

  test("5.3 Decline preserves thread", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New" }).click();
    const input = page.getByPlaceholder("Type a message to get started...");
    await input.fill("Keep me");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("button", { name: /Keep me/ })).toBeVisible({ timeout: 45_000 });

    await input.fill("Please delete this thread");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByRole("heading", { name: "Delete this thread", exact: true })).toBeVisible({ timeout: 45_000 });
    await page.getByRole("button", { name: "Decline" }).click();

    await expect(page.getByText("Action canceled.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Keep me/ })).toBeVisible();
  });
});

test.describe("6. Spreadsheet Read", () => {
  test("6.1 Read headers", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New" }).click();
    const input = page.getByPlaceholder("Type a message to get started...");
    await input.fill("Show headers @Sheet1!A1:F1");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByRole("table", { name: /Preview Sheet1!A1:F1/ })).toBeVisible({ timeout: 45_000 });
  });
});

test.describe("7. XLSX Multi-Step Manipulation", () => {
  test("7.1 Update cell, verify, update again, revert - all in one thread", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New" }).click();
    const input = page.getByPlaceholder("Type a message to get started...");
    const send = page.getByRole("button", { name: "Send" });
    const statusReady = page.getByText("Ready", { exact: true });

    // Step 1: Read original value of E2 (should be 12000)
    await input.fill("What is the value in @Sheet1!E2?");
    await send.click();
    await expect(page.getByRole("table", { name: /Preview Sheet1!E2/ })).toBeVisible({ timeout: 60_000 });
    await expect(statusReady).toBeVisible({ timeout: 60_000 });

    // Step 2: Update E2 to 99999
    await input.fill("Please update @Sheet1!E2 to 99999. Use confirmAction with actionPayload {\"sheet\":\"Sheet1\",\"cell\":\"E2\",\"value\":99999}.");
    await send.click();
    await expect(page.getByRole("heading", { name: /Update a spreadsheet cell/i })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Approved", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(statusReady).toBeVisible({ timeout: 60_000 });

    // Step 3: Verify E2 is now 99999
    await input.fill("Show me @Sheet1!E2 again");
    await send.click();
    const preview1 = page.getByRole("table", { name: /Preview Sheet1!E2/ }).last();
    await expect(preview1).toBeVisible({ timeout: 60_000 });
    await expect(preview1.getByText(/99,?999/)).toBeVisible();
    await expect(statusReady).toBeVisible({ timeout: 60_000 });

    // Step 4: Update E2 to 50000
    await input.fill("Please update @Sheet1!E2 to 50000. Use confirmAction with actionPayload {\"sheet\":\"Sheet1\",\"cell\":\"E2\",\"value\":50000}.");
    await send.click();
    await expect(page.getByRole("heading", { name: /Update a spreadsheet cell/i }).last()).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Approve" }).last().click();
    await expect(page.getByText("Approved", { exact: true }).last()).toBeVisible({ timeout: 30_000 });
    await expect(statusReady).toBeVisible({ timeout: 60_000 });

    // Step 5: Verify E2 is now 50000
    await input.fill("What does @Sheet1!E2 contain now?");
    await send.click();
    const preview2 = page.getByRole("table", { name: /Preview Sheet1!E2/ }).last();
    await expect(preview2).toBeVisible({ timeout: 60_000 });
    await expect(preview2.getByText(/50,?000/)).toBeVisible();
    await expect(statusReady).toBeVisible({ timeout: 60_000 });

    // Step 6: Revert E2 back to original value 12000
    await input.fill("Please update @Sheet1!E2 to 12000. Use confirmAction with actionPayload {\"sheet\":\"Sheet1\",\"cell\":\"E2\",\"value\":12000}.");
    await send.click();
    await expect(page.getByRole("heading", { name: /Update a spreadsheet cell/i }).last()).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Approve" }).last().click();
    await expect(page.getByText("Approved", { exact: true }).last()).toBeVisible({ timeout: 30_000 });
    await expect(statusReady).toBeVisible({ timeout: 60_000 });

    // Step 7: Final verification - E2 should be 12000 again
    await input.fill("Confirm @Sheet1!E2 value");
    await send.click();
    const preview3 = page.getByRole("table", { name: /Preview Sheet1!E2/ }).last();
    await expect(preview3).toBeVisible({ timeout: 60_000 });
    await expect(preview3.getByText(/12,?000/)).toBeVisible();
  });
});

test.describe("Quick Smoke Test", () => {
  test("Full flow: create, mention, modal, confirm decline", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "New" }).click();
    const input = page.getByPlaceholder("Type a message to get started...");

    await input.fill("Show me @Sheet1!A1:F5");
    await page.getByRole("button", { name: "Send" }).click();

    const preview = page.getByRole("table", { name: /Preview Sheet1!A1:F5/ });
    await expect(preview).toBeVisible({ timeout: 45_000 });

    await preview.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const startCell = dialog.getByLabel("Cell A2");
    const endCell = dialog.getByLabel("Cell B3");
    await startCell.hover();
    await page.mouse.down();
    await endCell.hover();
    await page.mouse.up();
    await dialog.getByRole("button", { name: "Insert mention" }).click();
    await expect(dialog).toBeHidden();
    await expect(input).toHaveValue("@Sheet1!A2:B3");

    await input.clear();
    await input.fill("Please delete this thread");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByRole("heading", { name: "Delete this thread", exact: true })).toBeVisible({ timeout: 45_000 });
    await page.getByRole("button", { name: "Decline" }).click();
    await expect(page.getByText("Action canceled.")).toBeVisible();
  });
});
