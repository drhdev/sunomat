import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { songSchema, type Song } from "../shared/song.js";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type Saved = {
  id: string;
  projectId: string;
  name: string;
  song: Song;
  createdAt: string;
};
type Row = {
  id: string;
  project_id: string;
  name: string;
  content: string;
  created_at: string;
};
const serialize = (r: Row): Saved => ({
  id: r.id,
  projectId: r.project_id,
  name: r.name,
  song: songSchema.parse(JSON.parse(r.content)),
  createdAt: r.created_at,
});

export function createStore(path: string) {
  if (path !== ":memory:")
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec(
    `PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL;`,
  );
  // Versioned, transactional migrations; never rewrite existing user snapshots.
  const version = (
    db.prepare("PRAGMA user_version").get() as { user_version: number }
  ).user_version;
  if (version > 1) throw new Error("Database is newer than this application");
  if (version === 0)
    db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE INDEX sessions_expiry ON sessions(expires_at);
    CREATE TABLE projects (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL UNIQUE);
    CREATE INDEX projects_owner ON projects(user_id);
    CREATE TABLE saves (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, content TEXT NOT NULL CHECK(json_valid(content)), created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
    CREATE INDEX saves_owner ON saves(user_id);
    CREATE INDEX saves_project ON saves(project_id, created_at DESC);
    CREATE TRIGGER saves_quota BEFORE INSERT ON saves WHEN (SELECT count(*) FROM saves WHERE user_id=NEW.user_id)>=100 BEGIN SELECT RAISE(ABORT, 'save quota exceeded'); END;
    CREATE TRIGGER saves_owner_matches BEFORE INSERT ON saves WHEN NOT EXISTS(SELECT 1 FROM projects WHERE id=NEW.project_id AND user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT, 'owner mismatch'); END;
    PRAGMA user_version=1; COMMIT;`);
  const owned = (userId: string, projectId: string) => {
    if (
      !db
        .prepare("SELECT id FROM projects WHERE id=? AND user_id=?")
        .get(projectId, userId)
    )
      throw new ApiError(404, "Project not found");
  };
  const usage = (userId: string) =>
    (
      db
        .prepare("SELECT count(*) AS count FROM saves WHERE user_id=?")
        .get(userId) as { count: number }
    ).count;
  return {
    db,
    usage,
    list(userId: string) {
      const rows = db
        .prepare(
          `SELECT s.id,s.project_id,p.name,s.content,s.created_at,
        (SELECT count(*) FROM saves x WHERE x.project_id=p.id) AS versions
        FROM projects p JOIN saves s ON s.rowid=(SELECT rowid FROM saves WHERE project_id=p.id ORDER BY rowid DESC LIMIT 1)
        WHERE p.user_id=? ORDER BY s.rowid DESC`,
        )
        .all(userId) as unknown as (Row & { versions: number })[];
      return rows.map((r) => ({ ...serialize(r), versions: r.versions }));
    },
    history(userId: string, projectId: string) {
      owned(userId, projectId);
      return (
        db
          .prepare(
            "SELECT s.*,p.name FROM saves s JOIN projects p ON p.id=s.project_id WHERE s.project_id=? AND s.user_id=? ORDER BY s.rowid DESC",
          )
          .all(projectId, userId) as unknown as Row[]
      ).map(serialize);
    },
    save(userId: string, song: Song, projectId?: string, baseId?: string) {
      db.exec("BEGIN IMMEDIATE");
      try {
        if (usage(userId) >= 100)
          throw new ApiError(
            409,
            "Your 100 saved versions are full. Delete a version or project before saving again.",
          );
        let name: string;
        if (projectId) {
          owned(userId, projectId);
          const latest = db
            .prepare(
              "SELECT id FROM saves WHERE project_id=? ORDER BY rowid DESC LIMIT 1",
            )
            .get(projectId) as { id: string } | undefined;
          if (latest?.id !== baseId)
            throw new ApiError(
              409,
              "This project changed in another tab. Export your draft, then reload its latest version before saving.",
            );
          name = (
            db
              .prepare("SELECT name FROM projects WHERE id=?")
              .get(projectId) as { name: string }
          ).name;
        } else {
          projectId = randomUUID();
          const slug =
            (song.title || "untitled-idea")
              .normalize("NFKD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "")
              .slice(0, 60) || "song";
          name = `${slug}-${projectId}`;
          db.prepare("INSERT INTO projects(id,user_id,name) VALUES(?,?,?)").run(
            projectId,
            userId,
            name,
          );
        }
        const id = randomUUID();
        db.prepare(
          "INSERT INTO saves(id,project_id,user_id,content) VALUES(?,?,?,?)",
        ).run(id, projectId, userId, JSON.stringify(song));
        const row = db
          .prepare(
            "SELECT s.*,p.name FROM saves s JOIN projects p ON p.id=s.project_id WHERE s.id=?",
          )
          .get(id) as Row;
        db.exec("COMMIT");
        return serialize(row);
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    deleteProject(userId: string, projectId: string) {
      owned(userId, projectId);
      db.prepare("DELETE FROM projects WHERE id=? AND user_id=?").run(
        projectId,
        userId,
      );
    },
    deleteVersion(userId: string, id: string) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const row = db
          .prepare("SELECT project_id FROM saves WHERE id=? AND user_id=?")
          .get(id, userId) as { project_id: string } | undefined;
        if (!row) throw new ApiError(404, "Version not found");
        db.prepare("DELETE FROM saves WHERE id=? AND user_id=?").run(
          id,
          userId,
        );
        db.prepare(
          "DELETE FROM projects WHERE id=? AND NOT EXISTS(SELECT 1 FROM saves WHERE project_id=?)",
        ).run(row.project_id, row.project_id);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    close: () => db.close(),
  };
}
