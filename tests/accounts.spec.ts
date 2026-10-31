import { test, expect } from "@playwright/test";

test.use({ locale: "de-DE" });
test("mobile account settings validate in English, revoke other sessions and delete private data", async ({
  page,
}) => {
  const email = `account-ui-${Date.now()}@example.test`;
  const password = "initial-ui-account-passphrase";
  const nextPassword = "updated-ui-account-passphrase";
  const headers = { Origin: "http://127.0.0.1:4173", "X-Sunomat-Request": "1" };
  const registered = await page.request.post("/api/register", {
    headers,
    data: { email, password },
  });
  expect(registered.status()).toBe(200);
  const oldCookie = registered.headers()["set-cookie"].split(";")[0];
  expect(
    (
      await page.request.post("/api/login", {
        headers,
        data: { email, password },
      })
    ).status(),
  ).toBe(200);
  await page.request.post("/api/saves", {
    headers,
    data: { song: { title: "Private account song", kind: "template" } },
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByRole("button", { name: "My account", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Account settings" });
  await expect(dialog).toContainText("1 / 100 saved versions");
  const form = dialog.getByRole("form", {
    name: "Change password",
    exact: true,
  });
  await form.getByLabel("Current password", { exact: true }).fill(password);
  await form.getByLabel("New password", { exact: true }).fill(nextPassword);
  await form
    .getByLabel("Confirm new password", { exact: true })
    .fill("does-not-match");
  await form
    .getByRole("button", { name: "Update password", exact: true })
    .click();
  await expect(form.getByRole("alert")).toContainText(
    "Confirm new password: Passwords must match",
  );
  await form
    .getByLabel("Confirm new password", { exact: true })
    .fill(nextPassword);
  await form
    .getByLabel("Current password", { exact: true })
    .fill("incorrect-password");
  await form
    .getByRole("button", { name: "Update password", exact: true })
    .click();
  await expect(form.getByRole("alert")).toContainText(
    "Current password is incorrect",
  );
  await form.getByLabel("Current password", { exact: true }).fill(password);
  await form
    .getByRole("button", { name: "Update password", exact: true })
    .click();
  await expect(form.getByRole("status")).toContainText(
    "This session stays active",
  );
  await expect(
    form.getByLabel("Current password", { exact: true }),
  ).toHaveValue("");
  expect(
    (
      await page.request.get("/api/projects", {
        headers: { Cookie: oldCookie },
      })
    ).status(),
  ).toBe(401);
  expect((await (await page.request.get("/api/me")).json()).usage).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await dialog.locator(".account-danger > summary").click();
  const deletion = dialog.getByRole("form", {
    name: "Delete account",
    exact: true,
  });
  await deletion
    .getByLabel("Confirm account email", { exact: true })
    .fill("different@example.test");
  await deletion
    .getByLabel("Account password", { exact: true })
    .fill(nextPassword);
  await deletion
    .getByRole("button", { name: "Delete my account permanently", exact: true })
    .click();
  await expect(deletion.getByRole("alert")).toContainText(
    "confirmation email does not match",
  );
  await deletion
    .getByLabel("Confirm account email", { exact: true })
    .fill(email);
  await deletion
    .getByLabel("Account password", { exact: true })
    .fill("wrong-password");
  await deletion
    .getByRole("button", { name: "Delete my account permanently", exact: true })
    .click();
  await expect(deletion.getByRole("alert")).toContainText(
    "Current password is incorrect",
  );
  await deletion
    .getByLabel("Account password", { exact: true })
    .fill(nextPassword);
  await deletion
    .getByRole("button", { name: "Delete my account permanently", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Song title", { exact: true })).toHaveValue("");
  expect((await (await page.request.get("/api/me")).json()).user).toBeNull();
  expect(
    (await page.context().cookies()).some((cookie) =>
      cookie.name.includes("sunomat"),
    ),
  ).toBeFalsy();
});
