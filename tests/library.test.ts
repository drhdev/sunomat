import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app";
import { request as httpRequest } from "node:http";
import { emptySong } from "../shared/song";
import {
  librarySchema,
  libraryVersionCount,
  parseLibrary,
  type LibraryArchive,
} from "../shared/library";

const origin = "http://localhost:5173";
let app: ReturnType<typeof createApp>;
let root: string;
async function call(
  path: string,
  method = "GET",
  data?: unknown,
  cookie = "",
  extra: Record<string, string> = {},
) {
  const response = await fetch(root + path, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "X-Sunomat-Request": "1",
      Cookie: cookie,
      ...extra,
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
  };
}
async function account(name: string) {
  const r = await call("/register", "POST", {
    email: `${name}@example.test`,
    password: "library-test-passphrase",
  });
  assert.equal(r.status, 200);
  return { cookie: r.cookie, id: r.data.user.id as string };
}
before(async () => {
  app = createApp({ dbPath: ":memory:", origin });
  await new Promise<void>((resolve) =>
    app.server.listen(0, "127.0.0.1", resolve),
  );
  root = `http://127.0.0.1:${(app.server.address() as { port: number }).port}/api`;
});
after(async () => {
  await new Promise<void>((resolve) => app.server.close(() => resolve()));
  app.close();
});

test(
  "only one import body is accepted at a time and validation failure releases the slot",
  { timeout: 5000 },
  async () => {
    const owner = await account("queued-owner");
    let ready!: () => void;
    const arrived = new Promise<void>((resolve) => {
      ready = resolve;
    });
    app.server.once("request", () => ready());
    let finish!: () => void;
    const first = new Promise<number>((resolve, reject) => {
      const request = httpRequest(
        root + "/library/import",
        {
          method: "POST",
          headers: {
            Origin: origin,
            "Content-Type": "application/json",
            "X-Sunomat-Request": "1",
            Cookie: owner.cookie,
          },
        },
        (response) => {
          response.resume();
          response.on("end", () => resolve(response.statusCode!));
        },
      );
      request.on("error", reject);
      request.write("{");
      finish = () => request.end("}");
    });
    await arrived;
    try {
      assert.equal(
        (await call("/library/import", "POST", {}, owner.cookie)).status,
        429,
      );
    } finally {
      finish();
    }
    assert.equal(await first, 400);
    const valid: LibraryArchive = {
      format: "sunomat-library-v1",
      exportedAt: "2026-10-31T12:00:00Z",
      projects: [
        {
          name: "A new project",
          versions: [{ createdAt: "2026-10-01T12:00:00Z", song: emptySong() }],
        },
      ],
    };
    assert.equal(
      (await call("/library/import", "POST", valid, owner.cookie)).status,
      201,
    );
  },
);

test("private library round trip preserves every version and creates independent copies", async () => {
  const a = await account("export-owner");
  const b = await account("restore-owner");
  assert.equal((await call("/library/export")).status, 401);
  assert.equal((await call("/library/import", "POST", {})).status, 401);
  const first = {
    ...emptySong(),
    title: "Porch light",
    lyrics: "[Verse]\nAn original line",
    notes: "Keep the dry vocal",
    favorite: true,
    rating: 4,
    hasAudio: true,
    referenceNotes: "Original guitar demo",
    audioInfluence: 65,
  };
  const initial = (await call("/saves", "POST", { song: first }, a.cookie)).data
    .saved;
  const second = {
    ...first,
    title: "Porch light, take two",
    style: "indie folk, 92 BPM, felt piano",
    changeNote: "Add piano only",
    weirdness: 35,
  };
  await call(
    "/saves",
    "POST",
    { song: second, projectId: initial.projectId, baseId: initial.id },
    a.cookie,
  );
  await call(
    "/saves",
    "POST",
    {
      song: {
        ...emptySong(),
        title: "Proven acoustic template",
        kind: "template",
        stage: "finished",
        persona: "My acoustic persona",
      },
    },
    a.cookie,
  );
  const exported = await call("/library/export", "GET", undefined, a.cookie);
  assert.equal(exported.status, 200);
  const archive = parseLibrary(JSON.stringify(exported.data));
  assert.equal(libraryVersionCount(archive), 3);
  assert.equal(archive.projects.length, 2);
  assert.deepEqual(
    archive.projects[0].versions.map((v) => v.song),
    [first, second],
  );
  assert.equal(archive.projects[0].versions[0].createdAt, initial.createdAt);
  assert.deepEqual(Object.keys(archive).sort(), [
    "exportedAt",
    "format",
    "projects",
  ]);
  assert.ok(!JSON.stringify(archive).includes("export-owner@example.test"));
  assert.ok(!JSON.stringify(archive).includes("password"));
  assert.equal(
    (
      await call("/library/import", "POST", archive, b.cookie, {
        Origin: "https://attacker.invalid",
      })
    ).status,
    403,
  );
  const restored = await call(
    "/library/import",
    "POST",
    { ...archive, userId: a.id },
    b.cookie,
  );
  assert.equal(restored.status, 201);
  assert.deepEqual(restored.data, { projects: 2, versions: 3, usage: 3 });
  const copy = (await call("/library/export", "GET", undefined, b.cookie))
    .data as LibraryArchive;
  assert.deepEqual(
    copy.projects.map((p) => p.versions),
    archive.projects.map((p) => p.versions),
  );
  assert.notEqual(copy.projects[0].name, archive.projects[0].name);
  const listed = (await call("/projects", "GET", undefined, b.cookie)).data
    .projects;
  const project = listed.find(
    (p: { song: { title: string } }) => p.song.title === second.title,
  );
  assert.notEqual(project.projectId, initial.projectId);
  const history = (
    await call(`/projects/${project.projectId}`, "GET", undefined, b.cookie)
  ).data.versions;
  assert.deepEqual(
    history.map((v: { song: unknown }) => v.song),
    [second, first],
  );
  assert.equal(
    (await call(`/projects/${initial.projectId}`, "GET", undefined, b.cookie))
      .status,
    404,
  );
  assert.equal((await call("/me", "GET", undefined, a.cookie)).data.usage, 3);
  const repeated = await call("/library/import", "POST", archive, b.cookie);
  assert.equal(repeated.status, 201);
  assert.equal(repeated.data.usage, 6);
  assert.equal(
    (await call("/projects", "GET", undefined, b.cookie)).data.projects.length,
    4,
  );
  const invalid = structuredClone(archive);
  invalid.projects[1].versions[0].song.weirdness = 101;
  assert.equal(
    (await call("/library/import", "POST", invalid, b.cookie)).status,
    400,
  );
  assert.equal((await call("/me", "GET", undefined, b.cookie)).data.usage, 6);
});

test("quota preflight and database failures never leave a partial restore", async () => {
  const owner = await account("full-owner");
  for (let i = 0; i < 98; i++)
    app.store.save(owner.id, { ...emptySong(), title: `Existing ${i}` });
  const archive: LibraryArchive = {
    format: "sunomat-library-v1",
    exportedAt: "2026-10-31T12:00:00Z",
    projects: [
      {
        name: "One",
        versions: [
          { createdAt: "2026-10-01T12:00:00Z", song: emptySong() },
          {
            createdAt: "2026-10-02T12:00:00Z",
            song: { ...emptySong(), title: "Second" },
          },
        ],
      },
      {
        name: "Two",
        versions: [
          {
            createdAt: "2026-10-03T12:00:00Z",
            song: { ...emptySong(), title: "Third" },
          },
        ],
      },
    ],
  };
  const quota = await call("/library/import", "POST", archive, owner.cookie);
  assert.equal(quota.status, 409);
  assert.match(quota.data.error, /No projects were imported/);
  assert.equal(app.store.usage(owner.id), 98);
  assert.equal(app.store.list(owner.id).length, 98);
  const fresh = await account("rollback-owner");
  app.store.db.exec(
    "CREATE TEMP TRIGGER reject_library_snapshot BEFORE INSERT ON saves WHEN json_extract(NEW.content,'$.title')='Third' BEGIN SELECT RAISE(ABORT,'simulated disk write failure'); END;",
  );
  try {
    const failed = await call("/library/import", "POST", archive, fresh.cookie);
    assert.equal(failed.status, 500);
    assert.ok(!failed.data.error.includes("simulated"));
    assert.equal(app.store.usage(fresh.id), 0);
    assert.equal(app.store.list(fresh.id).length, 0);
    assert.equal(
      (
        app.store.db
          .prepare("SELECT count(*) AS n FROM projects WHERE user_id=?")
          .get(fresh.id) as { n: number }
      ).n,
      0,
    );
  } finally {
    app.store.db.exec("DROP TRIGGER reject_library_snapshot");
  }
  assert.equal(
    (await call("/library/import", "POST", archive, fresh.cookie)).status,
    201,
  );
});

test("large valid backups use the dedicated limit, while empty and invalid backups do not write", async () => {
  const owner = await account("large-owner");
  const empty = (await call("/library/export", "GET", undefined, owner.cookie))
    .data;
  assert.equal(librarySchema.safeParse(empty).success, true);
  assert.equal(
    (await call("/library/import", "POST", empty, owner.cookie)).status,
    400,
  );
  const archive: LibraryArchive = {
    format: "sunomat-library-v1",
    exportedAt: "2026-10-31T12:00:00Z",
    projects: [
      {
        name: "Long lyrics",
        versions: Array.from({ length: 6 }, () => ({
          createdAt: "2026-10-01T12:00:00Z",
          song: {
            ...emptySong(),
            lyrics: "a".repeat(5000),
            prompt: "b".repeat(5000),
            notes: "c".repeat(5000),
          },
        })),
      },
    ],
  };
  assert.ok(JSON.stringify(archive).length > 80_000);
  assert.equal(
    (await call("/library/import", "POST", archive, owner.cookie)).status,
    201,
  );
  const tooMany = {
    ...archive,
    projects: [
      {
        ...archive.projects[0],
        versions: Array.from(
          { length: 100 },
          () => archive.projects[0].versions[0],
        ),
      },
      { ...archive.projects[0], versions: [archive.projects[0].versions[0]] },
    ],
  };
  assert.equal(
    (await call("/library/import", "POST", tooMany, owner.cookie)).status,
    400,
  );
  assert.equal(app.store.usage(owner.id), 6);
  assert.throws(() => parseLibrary("{"), /not valid JSON/);
  assert.throws(
    () => parseLibrary(JSON.stringify({ song: emptySong() })),
    /Sunomat library backup/,
  );
  assert.throws(
    () =>
      parseLibrary(JSON.stringify({ ...archive, exportedAt: "not-a-date" })),
    /Library backup/,
  );
});
