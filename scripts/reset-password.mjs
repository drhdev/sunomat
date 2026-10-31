import { DatabaseSync } from "node:sqlite";
import { scryptSync, randomBytes } from "node:crypto";
const email = process.argv[2]?.trim().toLowerCase();
if (!email)
  throw new Error(
    "Usage: node scripts/reset-password.mjs user@example.com (password on stdin)",
  );
const chunks = [];
let size = 0;
for await (const chunk of process.stdin) {
  size += chunk.length;
  if (size > 1024) throw new Error("Input too long");
  chunks.push(chunk);
}
const password = Buffer.concat(chunks)
  .toString()
  .replace(/\r?\n$/, "");
if (password.length < 12 || password.length > 128)
  throw new Error("Use 12–128 characters");
const db = new DatabaseSync(process.env.DB_PATH || "data/sunomat.db");
try {
  const user = db.prepare("SELECT id FROM users WHERE email=?").get(email);
  if (!user) throw new Error("Account not found");
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64).toString("hex");
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE users SET password=? WHERE id=?").run(
      `${salt}:${key}`,
      user.id,
    );
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  console.log("Password reset. Account sessions revoked.");
} finally {
  db.close();
}
