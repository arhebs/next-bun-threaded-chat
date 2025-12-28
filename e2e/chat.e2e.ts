import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/test/reset");
  expect(response.status()).toBe(200);
});

test("creates a thread and updates title after first message", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "New" }).click();

  const input = page.getByPlaceholder("Type a message to get started...");
  const longTitle = "This is a very long title that should be truncated nicely";

  await input.fill(longTitle);
  await expect(input).toHaveValue(longTitle);

  const send = page.getByRole("button", { name: "Send" });
  await expect(send).toBeEnabled();
  await send.click();

  await expect(page.getByText("Mock response.")).toBeVisible();

  await expect(
    page.getByRole("button", { name: /This is a very long title that\.\.\./ })
  ).toBeVisible();
});

test("switches between threads and shows the correct history", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "New" }).click();

  const input = page.getByPlaceholder("Type a message to get started...");
  const send = page.getByRole("button", { name: "Send" });

  await input.fill("Alpha");
  await send.click();
  await expect(page.getByText("Mock response.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Alpha/ })).toBeVisible();

  await page.getByRole("button", { name: "New" }).click();

  await input.fill("Beta");
  await send.click();
  await expect(page.getByRole("button", { name: /Beta/ })).toBeVisible({ timeout: 15000 });

  await expect(page.getByRole("heading", { name: "Beta" })).toBeVisible();

  await page.getByRole("button", { name: /Alpha/ }).click();

  await expect(page.getByRole("heading", { name: "Alpha" })).toBeVisible();
  await expect(
    page
      .getByRole("log", { name: "Chat messages" })
      .getByText("Alpha", { exact: true })
  ).toBeVisible();

  await page.getByRole("button", { name: /Beta/ }).click();

  await expect(page.getByRole("heading", { name: "Beta" })).toBeVisible();
  await expect(
    page
      .getByRole("log", { name: "Chat messages" })
      .getByText("Beta", { exact: true })
  ).toBeVisible();
});

test("opens a table modal and inserts a mention from selection", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "New" }).click();

  const input = page.getByPlaceholder("Type a message to get started...");
  const send = page.getByRole("button", { name: "Send" });

  await input.fill("Show @Sheet1!A1:B2");
  await send.click();

  await expect(page.getByText("Loaded mentioned range.")).toBeVisible();

  const preview = page
    .getByRole("log", { name: "Chat messages" })
    .getByRole("table", { name: "Preview Sheet1!A1:B2" });
  await expect(preview).toBeVisible();
  await preview.click();

  const dialog = page.getByRole("dialog", { name: "Sheet1!A1:B2" });
  await expect(dialog).toBeVisible();

  const startCell = dialog.getByLabel("Cell A2");
  const endCell = dialog.getByLabel("Cell B2");

  await startCell.hover();
  await page.mouse.down();
  await endCell.hover();
  await page.mouse.up();

  await expect(dialog.getByText("@Sheet1!A2:B2")).toBeVisible();

  await dialog.getByRole("button", { name: "Insert mention" }).click();

  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(input).toHaveValue("@Sheet1!A2:B2");
});

test("approving a confirmation deletes the active thread", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "New" }).click();

  const input = page.getByPlaceholder("Type a message to get started...");
  const send = page.getByRole("button", { name: "Send" });

  await input.fill("Alpha");
  await send.click();
  await expect(page.getByRole("button", { name: /Alpha/ })).toBeVisible();

  await page.getByRole("button", { name: "New" }).click();

  await input.fill("Beta");
  await send.click();
  await expect(page.getByRole("button", { name: /Beta/ })).toBeVisible({ timeout: 15000 });

  await input.fill("Please delete this thread");
  await send.click();

  await expect(
    page.getByRole("heading", { name: "Delete this thread", exact: true })
  ).toBeVisible();

  await page.getByRole("button", { name: "Approve" }).click();

  await expect(page.getByText("Action confirmed.")).toBeVisible();

  await expect(page.getByRole("button", { name: /Beta/ })).toBeHidden();
  await expect(page.getByRole("heading", { name: "Alpha" })).toBeVisible();
});

test("declining a confirmation yields 'Action canceled.'", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "New" }).click();

  const input = page.getByPlaceholder("Type a message to get started...");
  await input.fill("Please delete this thread");

  const send = page.getByRole("button", { name: "Send" });
  await expect(send).toBeEnabled();
  await send.click();

  await expect(
    page.getByRole("heading", { name: "Delete this thread", exact: true })
  ).toBeVisible();

  await page.getByRole("button", { name: "Decline" }).click();

  await expect(page.getByText("Action canceled.")).toBeVisible();
});
