import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app";
import { hashPassword, verifyPassword } from "../server/passwords";

const origin = "http://localhost:5173";
const initialPassword = "current-account-passphrase";
let app: ReturnType<typeof createApp>;
let root: string;
async function call(
  path: string,
  method = "GET",
  data?: unknown,
  cookie = "",
  extra: Record<string, string> = {},
) {
  const r = await fetch(root + path, {
    method,
    headers: {
      Origin: origin,
      "X-Sunomat-Request": "1",
      "Content-Type": "application/json",
      Cookie: cookie,
      ...extra,
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0] || "",
  };
}
async function account(name: string) {
  const email = `${name}@example.test`;
  const r = await call("/register", "POST", {
    email,
    password: initialPassword,
  });
  assert.equal(r.status, 200);
  return { cookie: r.cookie, id: r.data.user.id as string, email };
}
const me = (cookie: string) => call("/me", "GET", undefined, cookie);
before(async () => {
  app = createApp({ dbPath: ":memory:", origin });
  await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
  root = `http://127.0.0.1:${(app.server.address() as { port: number }).port}/api`;
});
after(async () => {
  await new Promise<void>((r) => app.server.close(() => r()));
  app.close();
});

test("password hashes remain compatible, salted and safe for malformed records", async () => {
  const a = await hashPassword(initialPassword);
  const b = await hashPassword(initialPassword);
  assert.notEqual(a, b);
  assert.match(a, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
  assert.equal(await verifyPassword(initialPassword, a), true);
  assert.equal(await verifyPassword("wrong", a), false);
  assert.equal(await verifyPassword(initialPassword, undefined), false);
  assert.equal(await verifyPassword(initialPassword, "malformed"), false);
});

test("password change requires fresh proof and revokes other sessions only", async () => {
  const owner = await account("password-owner");
  const other = await account("untouched-owner");
  const another = await call("/login", "POST", {
    email: owner.email,
    password: initialPassword,
  });
  const saved = await call(
    "/saves",
    "POST",
    { song: { title: "Keep this song" } },
    owner.cookie,
  );
  assert.equal(saved.status, 201);
  assert.equal(
    (
      await call("/account/password", "POST", {
        currentPassword: initialPassword,
        newPassword: "different-valid-passphrase",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await call(
        "/account/password",
        "POST",
        {
          currentPassword: initialPassword,
          newPassword: "different-valid-passphrase",
        },
        owner.cookie,
        { Origin: "https://attacker.invalid" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/account/password",
        "POST",
        { currentPassword: initialPassword, newPassword: "short" },
        owner.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "/account/password",
        "POST",
        { currentPassword: initialPassword, newPassword: initialPassword },
        owner.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "/account/password",
        "POST",
        {
          currentPassword: "wrong-current",
          newPassword: "different-valid-passphrase",
        },
        owner.cookie,
      )
    ).status,
    401,
  );
  assert.equal((await me(another.cookie)).data.user.id, owner.id);
  const changed = await call(
    "/account/password",
    "POST",
    {
      currentPassword: initialPassword,
      newPassword: "different-valid-passphrase",
    },
    owner.cookie,
  );
  assert.equal(changed.status, 200);
  assert.equal(changed.cookie, "");
  assert.equal((await me(owner.cookie)).data.user.id, owner.id);
  assert.equal((await me(owner.cookie)).data.usage, 1);
  assert.equal((await me(another.cookie)).data.user, null);
  assert.equal((await me(other.cookie)).data.user.id, other.id);
  assert.equal(
    (
      await call("/login", "POST", {
        email: owner.email,
        password: initialPassword,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await call("/login", "POST", {
        email: owner.email,
        password: "different-valid-passphrase",
      })
    ).status,
    200,
  );
});

test("competing password changes cannot silently overwrite each other", async () => {
  const owner = await account("racing-owner");
  const values = [
    "first-new-account-passphrase",
    "second-new-account-passphrase",
  ];
  const result = await Promise.all(
    values.map((newPassword) =>
      call(
        "/account/password",
        "POST",
        { currentPassword: initialPassword, newPassword },
        owner.cookie,
      ),
    ),
  );
  assert.equal(result.filter((r) => r.status === 200).length, 1);
  assert.ok(
    result
      .filter((r) => r.status !== 200)
      .every((r) => [401, 409].includes(r.status)),
  );
  const winner = values[result.findIndex((r) => r.status === 200)];
  assert.equal(
    (await call("/login", "POST", { email: owner.email, password: winner }))
      .status,
    200,
  );
  assert.equal((await me(owner.cookie)).data.user.id, owner.id);
  const revoked = await account("revoked-owner");
  const original = app.store.db
    .prepare("SELECT password FROM users WHERE id=?")
    .get(revoked.id) as { password: string };
  app.server.once("request", () =>
    app.store.db
      .prepare("DELETE FROM sessions WHERE user_id=?")
      .run(revoked.id),
  );
  assert.equal(
    (
      await call(
        "/account/password",
        "POST",
        {
          currentPassword: initialPassword,
          newPassword: "another-valid-passphrase",
        },
        revoked.cookie,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      app.store.db
        .prepare("SELECT password FROM users WHERE id=?")
        .get(revoked.id) as { password: string }
    ).password,
    original.password,
  );
});

test("failed session revocation rolls back a password update", async (t) => {
  const owner = await account("rollback-password");
  const another = await call("/login", "POST", {
    email: owner.email,
    password: initialPassword,
  });
  const original = app.store.db
    .prepare("SELECT password FROM users WHERE id=?")
    .get(owner.id) as { password: string };
  app.store.db.exec(
    `CREATE TEMP TRIGGER fail_revoke BEFORE DELETE ON sessions WHEN OLD.user_id='${owner.id}' BEGIN SELECT RAISE(ABORT,'simulated session write failure'); END;`,
  );
  const log = t.mock.method(console, "error", () => {});
  try {
    assert.equal(
      (
        await call(
          "/account/password",
          "POST",
          {
            currentPassword: initialPassword,
            newPassword: "rollback-new-passphrase",
          },
          owner.cookie,
        )
      ).status,
      500,
    );
    assert.equal(
      (
        app.store.db
          .prepare("SELECT password FROM users WHERE id=?")
          .get(owner.id) as { password: string }
      ).password,
      original.password,
    );
    assert.equal((await me(another.cookie)).data.user.id, owner.id);
  } finally {
    app.store.db.exec("DROP TRIGGER fail_revoke");
    log.mock.restore();
  }
  assert.equal(
    (
      await call(
        "/account/password",
        "POST",
        {
          currentPassword: initialPassword,
          newPassword: "rollback-new-passphrase",
        },
        owner.cookie,
      )
    ).status,
    200,
  );
});

test("confirmed account deletion cascades only the owner's data and every session", async () => {
  const owner = await account("delete-owner");
  const other = await account("kept-owner");
  const another = await call("/login", "POST", {
    email: owner.email,
    password: initialPassword,
  });
  const first = (
    await call(
      "/saves",
      "POST",
      { song: { title: "Private draft" } },
      owner.cookie,
    )
  ).data.saved;
  await call(
    "/saves",
    "POST",
    {
      projectId: first.projectId,
      baseId: first.id,
      song: { title: "Private template", kind: "template" },
    },
    owner.cookie,
  );
  await call(
    "/saves",
    "POST",
    { song: { title: "Untouched song" } },
    other.cookie,
  );
  assert.equal(
    (
      await call("/account", "DELETE", {
        currentPassword: initialPassword,
        confirmationEmail: owner.email,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await call(
        "/account",
        "DELETE",
        { currentPassword: initialPassword, confirmationEmail: owner.email },
        owner.cookie,
        { Origin: "https://attacker.invalid" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/account",
        "DELETE",
        {
          currentPassword: initialPassword,
          confirmationEmail: other.email,
          userId: other.id,
        },
        owner.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "/account",
        "DELETE",
        { currentPassword: "wrong", confirmationEmail: owner.email },
        owner.cookie,
      )
    ).status,
    401,
  );
  assert.equal((await me(owner.cookie)).data.usage, 2);
  const deleted = await call(
    "/account",
    "DELETE",
    {
      currentPassword: initialPassword,
      confirmationEmail: owner.email.toUpperCase(),
      userId: other.id,
    },
    owner.cookie,
  );
  assert.equal(deleted.status, 200);
  assert.equal(deleted.cookie, "sunomat=");
  assert.equal((await me(owner.cookie)).data.user, null);
  assert.equal((await me(another.cookie)).data.user, null);
  assert.equal(
    app.store.db.prepare("SELECT id FROM users WHERE id=?").get(owner.id),
    undefined,
  );
  for (const table of ["projects", "saves", "sessions"]) {
    assert.equal(
      (
        app.store.db
          .prepare(`SELECT count(*) AS n FROM ${table} WHERE user_id=?`)
          .get(owner.id) as { n: number }
      ).n,
      0,
    );
  }
  assert.equal((await me(other.cookie)).data.usage, 1);
  assert.equal(
    (
      await call("/login", "POST", {
        email: owner.email,
        password: initialPassword,
      })
    ).status,
    401,
  );
  const replacement = await account("delete-owner");
  assert.notEqual(replacement.id, owner.id);
  assert.equal((await me(replacement.cookie)).data.usage, 0);
  assert.equal((await me(owner.cookie)).data.user, null);
});

test("failed cascading deletion leaves the account, library and sessions unchanged", async (t) => {
  const owner = await account("rollback-delete");
  await call(
    "/saves",
    "POST",
    { song: { title: "Keep on failure" } },
    owner.cookie,
  );
  app.store.db.exec(
    `CREATE TEMP TRIGGER fail_cascade BEFORE DELETE ON saves WHEN OLD.user_id='${owner.id}' BEGIN SELECT RAISE(ABORT,'simulated delete failure'); END;`,
  );
  const log = t.mock.method(console, "error", () => {});
  try {
    assert.equal(
      (
        await call(
          "/account",
          "DELETE",
          { currentPassword: initialPassword, confirmationEmail: owner.email },
          owner.cookie,
        )
      ).status,
      500,
    );
    assert.equal((await me(owner.cookie)).data.user.id, owner.id);
    assert.equal((await me(owner.cookie)).data.usage, 1);
  } finally {
    app.store.db.exec("DROP TRIGGER fail_cascade");
    log.mock.restore();
  }
  assert.equal(
    (
      await call(
        "/account",
        "DELETE",
        { currentPassword: initialPassword, confirmationEmail: owner.email },
        owner.cookie,
      )
    ).status,
    200,
  );
});

test("account credential attempts are throttled without losing the library session", async () => {
  const owner = await account("throttle-account");
  for (let i = 0; i < 12; i++)
    assert.equal(
      (
        await call(
          "/account/password",
          "POST",
          {
            currentPassword: "incorrect-current",
            newPassword: "valid-new-passphrase",
          },
          owner.cookie,
        )
      ).status,
      401,
    );
  assert.equal(
    (
      await call(
        "/account",
        "DELETE",
        { currentPassword: initialPassword, confirmationEmail: owner.email },
        owner.cookie,
      )
    ).status,
    429,
  );
  assert.equal((await me(owner.cookie)).data.user.id, owner.id);
});
