import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
const destination = process.argv[2];
if (!destination)
  throw new Error("Usage: node scripts/backup.mjs /data/unique-backup.db");
const db = new DatabaseSync(process.env.DB_PATH || "data/sunomat.db");
try {
  db.prepare("VACUUM INTO ?").run(resolve(destination));
  console.log(
    "Backup created. Store it securely outside the production volume.",
  );
} finally {
  db.close();
}
