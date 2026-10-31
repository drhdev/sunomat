import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app";
import { emptySong } from "../shared/song";
import type { Saved } from "../server/store";

const origin = "http://localhost:5173";
let dir: string;
let app: ReturnType<typeof createApp>;
let root: string;
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = "",
  extra: Record<string, string> = {},
) {
  const r = await fetch(root + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      "X-Sunomat-Request": "1",
      Cookie: cookie,
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0] || "",
  };
}
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "sunomat-test-"));
  app = createApp({ dbPath: join(dir, "test.db"), origin });
  await new Promise<void>((resolve) =>
    app.server.listen(0, "127.0.0.1", resolve),
  );
  root = `http://127.0.0.1:${(app.server.address() as { port: number }).port}/api`;
});
after(async () => {
  await new Promise<void>((r) => app.server.close(() => r()));
  app.close();
  await rm(dir, { recursive: true, force: true });
});

test("identity, private ownership, immutable revisions, quota, conflicts and deletion", async () => {
  assert.equal((await request("/health")).status, 200);
  assert.equal((await request("/me")).data.user, null);
  assert.equal((await request("/projects")).status, 401);
  assert.equal(
    (
      await request("/register", "POST", {
        email: "a@example.test",
        password: "short",
      })
    ).status,
    400,
  );
  const a = await request("/register", "POST", {
    email: "A@example.test",
    password: "very-long-test-password-a",
  });
  assert.equal(a.status, 200);
  assert.equal(a.data.user.email, "a@example.test");
  assert.ok(a.cookie);
  const b = await request("/register", "POST", {
    email: "b@example.test",
    password: "very-long-test-password-b",
  });
  assert.equal(b.status, 200);
  assert.equal(
    (
      await request("/login", "POST", {
        email: "a@example.test",
        password: "incorrect-password",
      })
    ).status,
    401,
  );
  const login = await request("/login", "POST", {
    email: "a@example.test",
    password: "very-long-test-password-a",
  });
  assert.equal(login.status, 200);
  const aCookie = login.cookie;
  assert.equal(
    (await request("/projects", "GET", undefined, aCookie)).status,
    200,
  );
  const song = {
    ...emptySong(),
    title: "Moonlight caf\u00e9",
    style: "indie folk, 92 BPM, felt piano",
    notes: "Private words",
  };
  const first = await request("/saves", "POST", { song }, aCookie);
  assert.equal(first.status, 201);
  assert.equal(first.data.usage, 1);
  const saved = first.data.saved as Saved;
  assert.match(saved.name, /^moonlight-cafe-[a-f0-9-]+$/);
  assert.equal(
    (await request(`/projects/${saved.projectId}`, "GET", undefined, b.cookie))
      .status,
    404,
  );
  assert.equal(
    (
      await request(
        `/projects/${saved.projectId}`,
        "DELETE",
        undefined,
        b.cookie,
      )
    ).status,
    404,
  );
  assert.equal(
    (await request(`/saves/${saved.id}`, "DELETE", undefined, b.cookie)).status,
    404,
  );
  assert.equal(
    (
      await request(
        "/saves",
        "POST",
        { song, projectId: saved.projectId, baseId: saved.id },
        b.cookie,
      )
    ).status,
    404,
  );
  const updated = {
    ...song,
    title: "New title",
    style: "ambient, 72 BPM",
    kind: "template",
  };
  const second = await request(
    "/saves",
    "POST",
    { song: updated, projectId: saved.projectId, baseId: saved.id },
    aCookie,
  );
  assert.equal(second.status, 201);
  assert.equal(second.data.saved.name, saved.name);
  const history = await request(
    `/projects/${saved.projectId}`,
    "GET",
    undefined,
    aCookie,
  );
  assert.equal(history.data.versions.length, 2);
  assert.equal(history.data.versions[1].song.style, song.style);
  const list = await request("/projects", "GET", undefined, aCookie);
  assert.equal(list.data.projects.length, 1);
  assert.equal(list.data.projects[0].versions, 2);
  assert.equal(list.data.projects[0].song.title, "New title");
  assert.equal(
    (await request("/projects", "GET", undefined, b.cookie)).data.projects
      .length,
    0,
  );
  assert.equal(
    (
      await request(
        "/saves",
        "POST",
        { song, projectId: saved.projectId, baseId: saved.id },
        aCookie,
      )
    ).status,
    409,
  );
  const bad = await request(
    "/saves",
    "POST",
    { song: { ...song, weirdness: 101 } },
    aCookie,
  );
  assert.equal(bad.status, 400);
  assert.equal(
    (
      await request(
        "/saves",
        "POST",
        { song: { ...song, style: "x".repeat(1001) } },
        aCookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/saves",
        "POST",
        { song: { ...song, resultUrl: "javascript:alert(1)" } },
        aCookie,
      )
    ).status,
    400,
  );
  // Fill through the actual API, then race for the final slot. A DB trigger also enforces quota.
  for (let i = 2; i < 99; i++)
    assert.equal(
      (
        await request(
          "/saves",
          "POST",
          { song: { ...song, title: `Idea ${i}` } },
          aCookie,
        )
      ).status,
      201,
    );
  const raced = await Promise.all([
    request("/saves", "POST", { song }, aCookie),
    request("/saves", "POST", { song }, aCookie),
  ]);
  assert.deepEqual(raced.map((r) => r.status).sort(), [201, 409]);
  assert.equal(
    (await request("/me", "GET", undefined, aCookie)).data.usage,
    100,
  );
  const userId = first.data.saved && a.data.user.id;
  const projectId = saved.projectId;
  assert.throws(
    () =>
      app.store.db
        .prepare(
          "INSERT INTO saves(id,project_id,user_id,content) VALUES(?,?,?,?)",
        )
        .run("bypass", projectId, userId, JSON.stringify(song)),
    /quota/,
  );
  assert.equal(
    (await request(`/saves/${saved.id}`, "DELETE", undefined, aCookie)).data
      .usage,
    99,
  );
  assert.equal(
    (await request("/saves", "POST", { song }, aCookie)).status,
    201,
  );
  assert.equal(
    (
      await request(
        `/projects/${saved.projectId}`,
        "DELETE",
        undefined,
        aCookie,
      )
    ).data.usage,
    99,
  );
  assert.equal(
    (await request(`/projects/${saved.projectId}`, "GET", undefined, aCookie))
      .status,
    404,
  );
  assert.equal((await request("/logout", "POST", {}, aCookie)).status, 200);
  assert.equal(
    (await request("/projects", "GET", undefined, aCookie)).status,
    401,
  );
  app.store.db
    .prepare("UPDATE sessions SET expires_at=0 WHERE user_id=?")
    .run(b.data.user.id);
  assert.equal(
    (await request("/projects", "GET", undefined, b.cookie)).status,
    401,
  );
});

test("CSRF, body validation, throttling and headers", async () => {
  assert.equal(
    (
      await request(
        "/register",
        "POST",
        { email: "csrf@example.test", password: "a-long-safe-password" },
        "",
        { Origin: "https://attacker.invalid" },
      )
    ).status,
    403,
  );
  assert.equal(
    (await request("/register", "POST", {}, "", { "X-Sunomat-Request": "" }))
      .status,
    403,
  );
  const tooLarge = await request("/login", "POST", {
    email: "x".repeat(81000),
  });
  assert.equal(tooLarge.status, 413);
  const invalid = await fetch(root + "/login", {
    method: "POST",
    headers: {
      Origin: origin,
      "X-Sunomat-Request": "1",
      "Content-Type": "application/json",
    },
    body: "{",
  });
  assert.equal(invalid.status, 400);
  const html = await fetch(root + "/login", {
    method: "POST",
    headers: {
      Origin: origin,
      "X-Sunomat-Request": "1",
      "Content-Type": "text/plain",
    },
    body: "hi",
  });
  assert.equal(html.status, 415);
  for (let i = 0; i < 12; i++)
    assert.equal(
      (
        await request("/login", "POST", {
          email: "missing@example.test",
          password: "invalid-password",
        })
      ).status,
      401,
    );
  assert.equal(
    (
      await request("/login", "POST", {
        email: "missing@example.test",
        password: "invalid-password",
      })
    ).status,
    429,
  );
  const r = await fetch(root + "/me");
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.match(
    r.headers.get("content-security-policy")!,
    /frame-ancestors 'none'/,
  );
});

test("production cookies and registration configuration", async () => {
  const isolated = createApp({
    dbPath: ":memory:",
    origin: "https://music.example.test",
    secureCookies: true,
    registration: false,
  });
  await new Promise<void>((r) => isolated.server.listen(0, "127.0.0.1", r));
  try {
    const url = `http://127.0.0.1:${(isolated.server.address() as { port: number }).port}`;
    const r = await fetch(url + "/api/register", {
      method: "POST",
      headers: {
        Origin: "https://music.example.test",
        "X-Sunomat-Request": "1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "closed@example.test",
        password: "closed-password-long",
      }),
    });
    assert.equal(r.status, 403);
    const logout = await fetch(url + "/api/logout", {
      method: "POST",
      headers: {
        Origin: "https://music.example.test",
        "X-Sunomat-Request": "1",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.match(
      logout.headers.get("set-cookie")!,
      /__Host-sunomat=.*HttpOnly; SameSite=Lax; Path=\/; Max-Age=0; Secure/,
    );
  } finally {
    await new Promise<void>((r) => isolated.server.close(() => r()));
    isolated.close();
  }
});
