import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
const dir = mkdtempSync(join(tmpdir(), "sunomat-browser-"));
const child = spawn(process.execPath, ["dist/server.js"], {
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: "4173",
    DB_PATH: join(dir, "test.db"),
    APP_ORIGIN: "http://127.0.0.1:4173",
    NODE_ENV: "test",
    REGISTRATION_ENABLED: "true",
  },
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill("SIGTERM"));
child.on("exit", (code) => {
  rmSync(dir, { recursive: true, force: true });
  process.exit(code || 0);
});
