import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { emptySong } from "../shared/song";
import { parseLibrary, libraryVersionCount } from "../shared/library";

test("full library download, mobile preview, additive restore and quota guard", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const created = await page.request.post("/api/register", {
    headers: { Origin: "http://127.0.0.1:4173", "X-Sunomat-Request": "1" },
    data: {
      email: `backup-owner-${Date.now()}@example.test`,
      password: "library-test-passphrase",
    },
  });
  expect(created.status()).toBe(200);
  const headers = { Origin: "http://127.0.0.1:4173", "X-Sunomat-Request": "1" };
  const first = (
    await (
      await page.request.post("/api/saves", {
        headers,
        data: {
          song: {
            ...emptySong(),
            title: "Saved acoustic song",
            style: "indie folk, 92 BPM",
          },
        },
      })
    ).json()
  ).saved;
  await page.request.post("/api/saves", {
    headers,
    data: {
      projectId: first.projectId,
      baseId: first.id,
      song: {
        ...first.song,
        changeNote: "Add a dry vocal",
        style: "indie folk, 92 BPM, dry vocals",
      },
    },
  });
  await page.request.post("/api/saves", {
    headers,
    data: {
      song: {
        ...emptySong(),
        title: "Favorite synth template",
        kind: "template",
        favorite: true,
        rating: 5,
      },
    },
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "My account", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^My library/ }).click();
  await expect(page.locator(".project-card")).toHaveCount(2);
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export library", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^sunomat-library-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const text = await readFile((await download.path())!, "utf8");
  const archive = parseLibrary(text);
  expect(libraryVersionCount(archive)).toBe(3);
  await page.getByRole("button", { name: "My account", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign out", exact: true })
    .click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("button", { name: "New here? Create an account" })
    .click();
  await page
    .getByLabel("Email", { exact: true })
    .fill(`restore-owner-${Date.now()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("library-test-passphrase");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".project-card")).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  const file = {
    name: "library-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(text),
  };
  await page.getByLabel("Choose library backup").setInputFiles(file);
  const preview = page.getByRole("dialog", {
    name: "Restore a library backup",
  });
  await expect(preview).toContainText("2 projects");
  await expect(preview).toContainText("3 saved versions");
  await expect(preview).toContainText("100 save slots available");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await preview
    .getByRole("button", { name: "Import 3 saved versions", exact: true })
    .click();
  await expect(preview).not.toBeVisible();
  await expect(page.locator(".project-card")).toHaveCount(2);
  const copy = parseLibrary(
    JSON.stringify(
      await (await page.request.get("/api/library/export")).json(),
    ),
  );
  expect(copy.projects.map((p) => p.versions)).toEqual(
    archive.projects.map((p) => p.versions),
  );
  await page.getByLabel("Choose library backup").setInputFiles(file);
  await expect(preview).toContainText(
    "Importing the same backup again creates additional copies.",
  );
  await preview
    .getByRole("button", { name: "Import 3 saved versions", exact: true })
    .click();
  await expect(preview).not.toBeVisible();
  await expect(page.locator(".project-card")).toHaveCount(4);
  const tooLarge = {
    ...archive,
    projects: [
      {
        name: "Too many versions",
        versions: Array.from(
          { length: 95 },
          () => archive.projects[0].versions[0],
        ),
      },
    ],
  };
  await page
    .getByLabel("Choose library backup")
    .setInputFiles({
      name: "large-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(tooLarge)),
    });
  await expect(preview.getByRole("alert")).toContainText(
    "only 94 are available",
  );
  await expect(
    preview.getByRole("button", {
      name: "Import 95 saved versions",
      exact: true,
    }),
  ).toBeDisabled();
  await preview.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByLabel("Choose library backup")
    .setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from("{"),
    });
  await expect(page.getByRole("alert")).toContainText(
    "This file is not valid JSON",
  );
  expect(errors).toEqual([]);
});
