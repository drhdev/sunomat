import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { z } from "zod";
import { songSchema } from "../shared/song.js";
import { ApiError, createStore } from "./store.js";
import {
  credentialsSchema,
  passwordChangeSchema,
  deleteAccountSchema,
} from "../shared/identity.js";
import { hashPassword, verifyPassword } from "./passwords.js";
import { formatValidationError } from "../shared/setup.js";
import {
  librarySchema,
  libraryValidationMessage,
  MAX_LIBRARY_BYTES,
} from "../shared/library.js";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const saveSchema = z.object({
  song: songSchema,
  projectId: z.uuid().optional(),
  baseId: z.uuid().optional(),
});
const uuid = z.uuid();
type User = { id: string; email: string };
type Config = {
  dbPath: string;
  origin?: string;
  secureCookies?: boolean;
  registration?: boolean;
  clientDir?: string;
};

export function createApp(config: Config) {
  const store = createStore(config.dbPath);
  const attempts = new Map<string, { count: number; until: number }>();
  const authPending = { count: 0 };
  let importingLibrary = false;
  const clientDir = resolve(config.clientDir || "dist/client");
  const secure = config.secureCookies ?? false;
  const cookieName = secure ? "__Host-sunomat" : "sunomat";
  const cleanup = setInterval(() => {
    store.db.prepare("DELETE FROM sessions WHERE expires_at<?").run(Date.now());
    for (const [k, v] of attempts) if (v.until < Date.now()) attempts.delete(k);
  }, 60_000);
  cleanup.unref();

  function json(res: ServerResponse, status: number, data: unknown) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  }
  async function body(req: IncomingMessage, maximumBytes = 80_000) {
    if (!req.headers["content-type"]?.startsWith("application/json"))
      throw new ApiError(415, "Send JSON content");
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const c of req) {
      size += c.length;
      if (size > maximumBytes) throw new ApiError(413, "Request is too large");
      chunks.push(c);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString());
    } catch {
      throw new ApiError(400, "Invalid JSON");
    }
  }
  function sessionHash(req: IncomingMessage): string | null {
    const token = req.headers.cookie
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    return hash(token);
  }
  function session(req: IncomingMessage): User | null {
    const tokenHash = sessionHash(req);
    if (!tokenHash) return null;
    return (
      (store.db
        .prepare(
          "SELECT u.id,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
        )
        .get(tokenHash, Date.now()) as User | undefined) || null
    );
  }
  function requireUser(req: IncomingMessage) {
    const u = session(req);
    if (!u) throw new ApiError(401, "Sign in to access your private library");
    return u;
  }
  function reservePasswordSlot() {
    if (authPending.count >= 8)
      throw new ApiError(429, "Account service is busy. Try again shortly.");
    authPending.count++;
  }
  function requireUnchangedAccount(
    userId: string,
    password: string,
    tokenHash: string,
  ) {
    const live = store.db
      .prepare(
        "SELECT u.password FROM users u JOIN sessions s ON s.user_id=u.id WHERE u.id=? AND s.token_hash=? AND s.expires_at>?",
      )
      .get(userId, tokenHash, Date.now()) as { password: string } | undefined;
    if (!live)
      throw new ApiError(
        401,
        "Your session has expired. Sign in again to continue.",
      );
    if (live.password !== password)
      throw new ApiError(
        409,
        "Your account credentials changed. Sign in again before retrying.",
      );
  }
  function csrf(req: IncomingMessage) {
    // Browser mutations require an exact Origin; no forwarded Host trust.
    const expected = config.origin || `http://${req.headers.host}`;
    if (
      req.headers.origin !== expected ||
      req.headers["x-sunomat-request"] !== "1" ||
      req.headers["sec-fetch-site"] === "cross-site"
    )
      throw new ApiError(403, "Request origin is not allowed");
  }
  function rate(key: string, max: number) {
    const now = Date.now();
    const r = attempts.get(key);
    if (r && r.until > now) {
      r.count++;
      if (r.count > max)
        throw new ApiError(429, "Too many attempts. Try again in 15 minutes.");
    } else {
      if (attempts.size >= 10_000)
        throw new ApiError(429, "Server is busy. Try again shortly.");
      attempts.set(key, { count: 1, until: now + 15 * 60_000 });
    }
  }
  function cookie(res: ServerResponse, token: string, maxAge: number) {
    res.setHeader(
      "Set-Cookie",
      `${cookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? "; Secure" : ""}`,
    );
  }
  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
    );
    if (secure) res.setHeader("Strict-Transport-Security", "max-age=31536000");
    try {
      const url = new URL(req.url || "/", "http://localhost");
      const path = url.pathname;
      const method = req.method || "GET";
      if (path.startsWith("/api/")) {
        if (!["GET", "HEAD", "POST", "DELETE"].includes(method))
          throw new ApiError(405, "Method not allowed");
        if (method === "POST" || method === "DELETE") csrf(req);
        if (path === "/api/health" && method === "GET") {
          store.db.prepare("SELECT 1").get();
          json(res, 200, { status: "ok" });
          return;
        }
        if (path === "/api/me" && method === "GET") {
          const user = session(req);
          json(res, 200, {
            user,
            usage: user ? store.usage(user.id) : 0,
            limit: 100,
            registration: config.registration !== false,
          });
          return;
        }
        if (
          ["/api/register", "/api/login"].includes(path) &&
          method === "POST"
        ) {
          const data = credentialsSchema.parse(await body(req));
          rate(`email:${data.email}`, 12);
          // socket identity cannot be spoofed with X-Forwarded-For; a proxy shares the broader IP allowance.
          rate(`ip:${req.socket.remoteAddress || "unknown"}`, 150);
          if (path === "/api/register" && config.registration === false)
            throw new ApiError(403, "Registration is disabled");
          reservePasswordSlot();
          let user: User;
          try {
            const existing = store.db
              .prepare("SELECT id,email,password FROM users WHERE email=?")
              .get(data.email) as (User & { password: string }) | undefined;
            if (path === "/api/register") {
              const encoded = await hashPassword(data.password);
              if (existing)
                throw new ApiError(
                  409,
                  "Unable to register this email. Try signing in.",
                );
              user = { id: randomUUID(), email: data.email };
              try {
                store.db
                  .prepare("INSERT INTO users(id,email,password) VALUES(?,?,?)")
                  .run(user.id, user.email, encoded);
              } catch (e) {
                if (String(e).includes("UNIQUE"))
                  throw new ApiError(
                    409,
                    "Unable to register this email. Try signing in.",
                  );
                throw e;
              }
            } else {
              const valid = await verifyPassword(
                data.password,
                existing?.password,
              );
              if (!existing || !valid)
                throw new ApiError(401, "Email or password is incorrect");
              user = { id: existing.id, email: existing.email };
            }
          } finally {
            authPending.count--;
          }
          // Replace this browser's old session and cap active sessions per account.
          const old = req.headers.cookie
            ?.split(";")
            .map((c) => c.trim())
            .find((c) => c.startsWith(`${cookieName}=`))
            ?.slice(cookieName.length + 1);
          if (old)
            store.db
              .prepare("DELETE FROM sessions WHERE token_hash=?")
              .run(hash(old));
          store.db
            .prepare("DELETE FROM sessions WHERE expires_at<?")
            .run(Date.now());
          store.db
            .prepare(
              "DELETE FROM sessions WHERE user_id=? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id=? ORDER BY expires_at DESC LIMIT 9)",
            )
            .run(user.id, user.id);
          const token = randomBytes(32).toString("hex");
          store.db
            .prepare(
              "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
            )
            .run(hash(token), user.id, Date.now() + 7 * 86400_000);
          cookie(res, token, 7 * 86400);
          json(res, 200, { user });
          return;
        }
        if (path === "/api/logout" && method === "POST") {
          const token = req.headers.cookie
            ?.split(";")
            .map((c) => c.trim())
            .find((c) => c.startsWith(`${cookieName}=`))
            ?.slice(cookieName.length + 1);
          if (token)
            store.db
              .prepare("DELETE FROM sessions WHERE token_hash=?")
              .run(hash(token));
          cookie(res, "", 0);
          json(res, 200, { ok: true });
          return;
        }
        const user = requireUser(req);
        if (
          (path === "/api/account/password" && method === "POST") ||
          (path === "/api/account" && method === "DELETE")
        ) {
          const change = path === "/api/account/password";
          const input = await body(req);
          const data = change
            ? passwordChangeSchema.parse(input)
            : deleteAccountSchema.parse(input);
          if (
            "confirmationEmail" in data &&
            data.confirmationEmail !== user.email
          )
            throw new ApiError(
              400,
              "The confirmation email does not match this account.",
            );
          rate(`account:${user.id}`, 12);
          rate(`ip:${req.socket.remoteAddress || "unknown"}`, 150);
          reservePasswordSlot();
          try {
            const existing = store.db
              .prepare("SELECT password FROM users WHERE id=?")
              .get(user.id) as { password: string } | undefined;
            const valid = await verifyPassword(
              data.currentPassword,
              existing?.password,
            );
            if (!existing || !valid)
              throw new ApiError(401, "Current password is incorrect.");
            const encoded =
              "newPassword" in data
                ? await hashPassword(data.newPassword)
                : null;
            const tokenHash = sessionHash(req)!;
            store.db.exec("BEGIN IMMEDIATE");
            try {
              requireUnchangedAccount(user.id, existing.password, tokenHash);
              if (encoded) {
                store.db
                  .prepare("UPDATE users SET password=? WHERE id=?")
                  .run(encoded, user.id);
                store.db
                  .prepare(
                    "DELETE FROM sessions WHERE user_id=? AND token_hash<>?",
                  )
                  .run(user.id, tokenHash);
              } else {
                store.db.prepare("DELETE FROM users WHERE id=?").run(user.id);
              }
              store.db.exec("COMMIT");
            } catch (error) {
              store.db.exec("ROLLBACK");
              throw error;
            }
            if (!change) cookie(res, "", 0);
            json(res, 200, { ok: true });
          } finally {
            authPending.count--;
          }
          return;
        }
        if (path === "/api/library/export" && method === "GET") {
          json(res, 200, store.exportLibrary(user.id));
          return;
        }
        if (path === "/api/library/import" && method === "POST") {
          // Bound large-body work to one import per process; ordinary saves stay small.
          if (importingLibrary)
            throw new ApiError(
              429,
              "A library import is already in progress. Try again shortly.",
            );
          importingLibrary = true;
          try {
            const parsed = librarySchema.safeParse(
              await body(req, MAX_LIBRARY_BYTES),
            );
            if (!parsed.success)
              throw new ApiError(400, libraryValidationMessage(parsed.error));
            json(res, 201, store.importLibrary(user.id, parsed.data));
          } finally {
            importingLibrary = false;
          }
          return;
        }
        if (path === "/api/projects" && method === "GET") {
          json(res, 200, {
            projects: store.list(user.id),
            usage: store.usage(user.id),
            limit: 100,
          });
          return;
        }
        if (path === "/api/saves" && method === "POST") {
          const data = saveSchema.parse(await body(req));
          const saved = store.save(
            user.id,
            data.song,
            data.projectId,
            data.baseId,
          );
          json(res, 201, { saved, usage: store.usage(user.id) });
          return;
        }
        const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
        if (projectMatch) {
          const id = uuid.parse(projectMatch[1]);
          if (method === "GET") {
            json(res, 200, { versions: store.history(user.id, id) });
            return;
          }
          if (method === "DELETE") {
            store.deleteProject(user.id, id);
            json(res, 200, { ok: true, usage: store.usage(user.id) });
            return;
          }
        }
        const saveMatch = path.match(/^\/api\/saves\/([^/]+)$/);
        if (saveMatch && method === "DELETE") {
          store.deleteVersion(user.id, uuid.parse(saveMatch[1]));
          json(res, 200, { ok: true, usage: store.usage(user.id) });
          return;
        }
        throw new ApiError(404, "Endpoint not found");
      }
      if (method !== "GET" && method !== "HEAD")
        throw new ApiError(405, "Method not allowed");
      const decoded = decodeURIComponent(path);
      let file = resolve(clientDir, `.${decoded}`);
      if (file !== clientDir && !file.startsWith(clientDir + "/"))
        throw new ApiError(404, "Not found");
      try {
        if (!(await stat(file)).isFile())
          file = resolve(clientDir, "index.html");
      } catch {
        if (extname(decoded)) throw new ApiError(404, "Not found");
        file = resolve(clientDir, "index.html");
      }
      const mime: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".woff2": "font/woff2",
      };
      const bytes = await readFile(file);
      res.writeHead(200, {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
        "Cache-Control": file.includes("/assets/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      });
      res.end(method === "HEAD" ? undefined : bytes);
    } catch (e) {
      if (e instanceof ApiError) {
        json(res, e.status, { error: e.message });
        return;
      }
      if (e instanceof z.ZodError) {
        json(res, 400, {
          error: formatValidationError(e),
        });
        return;
      }
      if (e instanceof URIError) {
        json(res, 400, { error: "Invalid path" });
        return;
      }
      console.error(
        "Request failed",
        e instanceof Error ? e.message : "Unknown error",
      );
      json(res, 500, {
        error:
          "Something went wrong. Your changes have not been saved. Try again.",
      });
    }
  });
  server.requestTimeout = 20_000;
  server.headersTimeout = 15_000;
  server.maxHeadersCount = 50;
  return {
    server,
    store,
    close: () => {
      clearInterval(cleanup);
      store.close();
    },
  };
}
