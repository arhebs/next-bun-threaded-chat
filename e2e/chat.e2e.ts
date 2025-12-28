import { expect, test } from "@playwright/test";

test("creates a thread and updates title after first message", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "New" }).click();

  const input = page.getByPlaceholder("Type a message to get started...");
  const longTitle = "This is a very long title that should be truncated nicely";

  await input.click();
  await input.type(longTitle);
  await expect(input).toHaveValue(longTitle);

  const send = page.getByRole("button", { name: "Send" });
  await expect(send).toBeEnabled();
  await send.click();

  await expect(page.getByText("Mock response.")).toBeVisible();

  await expect(
    page.getByRole("button", { name: /This is a very long title that\.\.\./ })
  ).toBeVisible();
});

test("declining a confirmation yields 'Action canceled.'", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "New" }).click();

  const input = page.getByPlaceholder("Type a message to get started...");
  await input.click();
  await input.type("Please delete this thread");

  const send = page.getByRole("button", { name: "Send" });
  await expect(send).toBeEnabled();
  await send.click();

  await expect(
    page.getByRole("heading", { name: "Delete this thread", exact: true })
  ).toBeVisible();

  await page.getByRole("button", { name: "Decline" }).click();

  await expect(page.getByText("Action canceled.")).toBeVisible();
});
