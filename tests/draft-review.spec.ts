import { test, expect } from "@playwright/test";
import { emptySong } from "../shared/song";

test("draft review uses the loaded snapshot, preserves edits and never consumes quota", async ({ page }) => {
  const headers = { Origin: "http://127.0.0.1:4173", "X-Sunomat-Request": "1" };
  expect((await page.request.post("/api/register", { headers, data: {
    email: `draft-review-${Date.now()}@example.test`, password: "review-test-passphrase",
  } })).ok()).toBeTruthy();
  const firstResponse = await page.request.post("/api/saves", { headers, data: {
    song: { ...emptySong(), title: "Controlled experiment", style: "indie folk, 92 BPM" },
  } });
  expect(firstResponse.ok()).toBeTruthy();
  const first = (await firstResponse.json()).saved;
  const secondResponse = await page.request.post("/api/saves", { headers, data: {
    projectId: first.projectId, baseId: first.id,
    song: { ...first.song, style: "synth-pop, 118 BPM" },
  } });
  expect(secondResponse.ok()).toBeTruthy();
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Review changes", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /^My library/ }).click();
  await page.getByRole("button", { name: "Version history for Controlled experiment" }).click();
  await expect(page.locator(".history-list article")).toHaveCount(2);
  await page.locator(".history-list article").last().getByRole("button", { name: "Open", exact: true }).click();
  const review = page.getByRole("button", { name: "Review changes", exact: true });
  await review.click();
  let dialog = page.getByRole("dialog", { name: "Review draft changes" });
  await expect(dialog).toContainText("No changes since the loaded snapshot.");
  await expect(dialog).toContainText("Loaded saved snapshot");
  await expect(dialog).toContainText("Not saved");
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await page.getByLabel("Style of music", { exact: true }).fill("indie folk, 92 BPM, dry vocals");
  await review.click();
  dialog = page.getByRole("dialog", { name: "Review draft changes" });
  await expect(dialog).toContainText("1 field changed");
  const change = dialog.getByRole("article", { name: "Style of music comparison" });
  await expect(change.locator("pre")).toHaveText(["indie folk, 92 BPM", "indie folk, 92 BPM, dry vocals"]);
  await expect(dialog).not.toContainText("synth-pop");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect((await (await page.request.get("/api/me")).json()).usage).toBe(2);
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByLabel("Style of music", { exact: true })).toHaveValue("indie folk, 92 BPM, dry vocals");
  const savedResponse = page.waitForResponse(response =>
    response.url().endsWith("/api/saves") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save version", exact: true }).click();
  expect((await savedResponse).ok()).toBeTruthy();
  await expect(review).toBeEnabled();
  await review.click();
  dialog = page.getByRole("dialog", { name: "Review draft changes" });
  await expect(dialog).toContainText("0 fields changed");
  expect((await (await page.request.get("/api/me")).json()).usage).toBe(3);
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: /^My library/ }).click();
  await page.getByRole("button", { name: "Use as template", exact: true }).click();
  await expect(review).toHaveCount(0);
});
