import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(process.env.DB_PATH || "data/sunomat.db");
try {
  db.prepare("DELETE FROM sessions").run();
  console.log("All sessions revoked.");
} finally {
  db.close();
}
