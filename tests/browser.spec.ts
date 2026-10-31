import { test, expect, type Page } from "@playwright/test";

for (const operation of ["library", "history", "save"] as const) {
  test(`late ${operation} responses cannot repopulate a different user's workspace`, async ({
    page,
  }) => {
    const response = await page.request.post("/api/register", {
      headers: { Origin: "http://127.0.0.1:4173", "X-Sunomat-Request": "1" },
      data: {
        email: `owner-a-${Date.now()}@example.test`,
        password: "test-passphrase-long-enough",
      },
    });
    expect(response.status()).toBe(200);
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "My account", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Song title", { exact: true })
      .fill("Owner A private song");
    await save(page);
    const project = (await (await page.request.get("/api/projects")).json())
      .projects[0];
    if (operation === "history") {
      await page.getByRole("button", { name: /^My library/ }).click();
      await expect(
        page.getByRole("heading", {
          name: "Owner A private song",
          exact: true,
        }),
      ).toBeVisible();
    }
    if (operation === "save")
      await page
        .getByLabel("Style of music", { exact: true })
        .fill("ambient, 72 BPM");
    const heldPath =
      operation === "save"
        ? "/api/saves"
        : operation === "history"
          ? `/api/projects/${project.projectId}`
          : "/api/projects";

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requestReady!: () => void;
    const ready = new Promise<void>((resolve) => {
      requestReady = resolve;
    });
    await page.route(
      `**${heldPath}`,
      async (route) => {
        const result = await route.fetch();
        requestReady();
        await gate;
        await route.fulfill({ response: result });
      },
      { times: 1 },
    );
    if (operation === "save")
      await page
        .getByRole("button", { name: "Save version", exact: true })
        .click();
    else if (operation === "history")
      await page
        .getByRole("button", {
          name: "Version history for Owner A private song",
        })
        .click();
    else await page.getByRole("button", { name: /^My library/ }).click();
    await ready;
    await page.getByRole("button", { name: "My account", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Sign out", exact: true })
      .click();
    if (operation === "save")
      await page
        .getByRole("button", { name: "Discard changes", exact: true })
        .click();
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByRole("button", { name: "New here? Create an account" })
      .click();
    await page
      .getByLabel("Email", { exact: true })
      .fill(`owner-b-${Date.now()}@example.test`);
    await page
      .getByLabel("Password", { exact: true })
      .fill("test-passphrase-long-enough");
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByRole("button", { name: /^My library/ }).click();
    await expect(
      page.getByRole("heading", { name: "The first song is yours to make." }),
    ).toBeVisible();

    const lateResponse = page.waitForResponse(async (r) => {
      if (!r.url().endsWith(heldPath)) return false;
      const data = await r.json();
      return (
        (data.saved || data.versions?.[0] || data.projects?.[0])?.song.title ===
        "Owner A private song"
      );
    });
    release();
    await (await lateResponse).finished();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page.locator(".project-card")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "The first song is yours to make." }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByRole("button", { name: "Composer", exact: true }).click();
    await expect(
      page.getByText("Owner A private song", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Song title", { exact: true })).toHaveValue(
      "",
    );
  });
}

async function save(page: Page) {
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/saves") &&
        r.request().method() === "POST" &&
        r.status() === 201,
    ),
    page.getByRole("button", { name: "Save version", exact: true }).click(),
  ]);
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
}

test("private projects, immutable history, template reuse, deletion and logout", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByLabel("Song title", { exact: true }).fill("Midnight windows");
  await page.getByRole("button", { name: "indie folk", exact: false }).click();
  await expect(page.getByLabel("Style of music", { exact: true })).toHaveValue(
    "indie folk",
  );
  await page
    .getByLabel("Style of music", { exact: true })
    .fill(
      "indie folk, 92 BPM, warm, felt piano, soft female vocals, intimate dry mix",
    );
  await page.getByRole("button", { name: "Save song", exact: true }).click();
  await page
    .getByRole("button", { name: "New here? Create an account" })
    .click();
  await page
    .getByLabel("Email", { exact: true })
    .fill(`browser-${Date.now()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("test-passphrase-long-enough");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await save(page);
  await page.getByRole("tab", { name: /Lyrics & structure/ }).click();
  await page
    .getByLabel("Lyrics", { exact: true })
    .fill(
      "[Verse 1]\nA silver thread across the night\nThe windows catch the passing light",
    );
  await save(page);
  await page.getByRole("button", { name: /^My library/ }).click();
  await page
    .getByRole("button", { name: "Version history for Midnight windows" })
    .click();
  await expect(page.locator(".history-list article")).toHaveCount(2);
  await page.setViewportSize({ width: 375, height: 812 });
  await page
    .locator(".history-list article")
    .last()
    .getByRole("button", { name: "Compare with latest version" })
    .click();
  const comparison = page.getByRole("dialog", {
    name: "Compare saved versions",
  });
  await expect(
    comparison.getByRole("article", { name: "Lyrics comparison" }),
  ).toContainText("Not set");
  await expect(
    comparison.getByRole("article", { name: "Lyrics comparison" }),
  ).toContainText("A silver thread across the night");
  await expect(comparison).toContainText("1 field changed");
  expect((await (await page.request.get("/api/me")).json()).usage).toBe(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await comparison.getByRole("button", { name: "Close dialog" }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .locator(".history-list article")
    .last()
    .getByRole("button", { name: "Open", exact: true })
    .click();
  await page.getByRole("tab", { name: /Lyrics & structure/ }).click();
  await expect(page.getByLabel("Lyrics", { exact: true })).toHaveValue("");
  await save(page);
  await page.getByRole("button", { name: /^My library/ }).click();
  await expect(page.getByText("3 versions", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Use as template", exact: true })
    .click();
  await expect(page.getByLabel("Song title", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Style of music", { exact: true })).toHaveValue(
    /indie folk/,
  );
  await page.getByLabel("Song title", { exact: true }).fill("Another window");
  await save(page);
  await page.getByRole("button", { name: /^My library/ }).click();
  await expect(page.locator(".project-card")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Version history for Midnight windows" })
    .click();
  await expect(page.locator(".history-list article")).toHaveCount(3);
  await page
    .locator(".history-list article")
    .last()
    .getByRole("button", { name: "Delete this version" })
    .click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByText("2 versions", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "My account", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign out", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your best settings deserve a home." }),
  ).toBeVisible();
  await expect(page.locator(".project-card")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test.describe("English interface with a non-English browser", () => {
  test.use({ locale: "de-DE", timezoneId: "UTC" });
  test("English counters, account validation, dates and network errors", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByText("0 / 1,000", { exact: true })).toBeVisible();
    await page
      .getByLabel("Song title", { exact: true })
      .fill("English workspace");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const auth = page.getByRole("dialog");
    await page.getByLabel("Email", { exact: true }).fill("invalid-email");
    await page.getByLabel("Password", { exact: true }).fill("short");
    await auth.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(auth.getByRole("alert")).toContainText(
      "Email: Enter a valid email address",
    );
    await expect(auth.getByRole("alert")).toContainText(
      "Password: Use at least 12 characters",
    );
    await page
      .getByRole("button", { name: "New here? Create an account" })
      .click();
    await page
      .getByLabel("Email", { exact: true })
      .fill(`english-${Date.now()}@example.test`);
    await page
      .getByLabel("Password", { exact: true })
      .fill("test-passphrase-long-enough");
    await auth
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(auth).not.toBeVisible();
    await save(page);
    await page.getByRole("button", { name: /^My library/ }).click();
    const data = await (await page.request.get("/api/projects")).json();
    const expectedDate = new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(data.projects[0].createdAt));
    await expect(page.locator(".project-date")).toHaveText(expectedDate);
    await page.route("**/api/projects", (route) => route.abort());
    await page.getByRole("button", { name: "Refresh library" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Cannot reach Sunomat. Check your connection and try again.",
    );
  });
});

test("mobile dark mode, audio controls, tempo merge and unsaved draft guard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveClass("dark");
  await page
    .getByLabel("Style of music", { exact: true })
    .fill("ambient, 100 BPM");
  await page.getByRole("tab", { name: /Fine-tune/ }).click();
  await page
    .getByRole("switch", { name: "Audio reference", exact: true })
    .click();
  await expect(
    page.getByLabel("Audio influence", { exact: true }),
  ).toBeVisible();
  await page.getByText("Personalization & planning", { exact: true }).click();
  await page.getByRole("button", { name: "Add tempo & key to Style" }).click();
  await page.getByRole("tab", { name: /Sound & style/ }).click();
  await expect(page.getByLabel("Style of music", { exact: true })).toHaveValue(
    "ambient, 100 BPM",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Quiet orbit", exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "Keep this draft?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByLabel("Style of music", { exact: true })).toHaveValue(
    "ambient, 100 BPM",
  );
  await page.reload(); // Playwright dismisses beforeunload; only theme persists.
  await expect(page.locator("html")).toHaveClass("dark");
});

test("JSON portability, field handoff and clipboard", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByLabel("Import JSON setup").setInputFiles({
    name: "setup.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        song: {
          title: "Portable song",
          style: "ambient, 72 BPM",
          instrumental: true,
          lyrics: "Retained words",
        },
      }),
    ),
  });
  await expect(page.getByLabel("Song title", { exact: true })).toHaveValue(
    "Portable song",
  );
  await page.getByRole("button", { name: "Suno handoff" }).click();
  await expect(page.locator(".handoff-fields")).not.toContainText(
    "Retained words",
  );
  await page.getByRole("button", { name: "Copy full setup" }).click();
  await expect(
    page.getByRole("button", { name: "Copied", exact: true }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export text" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    "Portable song-suno.txt",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByLabel("Import JSON setup").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{"),
  });
  await expect(page.getByRole("alert")).toContainText("Import failed");
  await expect(page.getByLabel("Song title", { exact: true })).toHaveValue(
    "Portable song",
  );
});
