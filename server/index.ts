import { createApp } from "./app.js";
const production = process.env.NODE_ENV === "production";
const origin = process.env.APP_ORIGIN;
if (
  production &&
  (!origin ||
    new URL(origin).origin !== origin ||
    !origin.startsWith("https://"))
)
  throw new Error(
    "Production APP_ORIGIN must be your exact HTTPS origin (no trailing slash)",
  );
const app = createApp({
  dbPath: process.env.DB_PATH || "data/sunomat.db",
  origin,
  secureCookies: production,
  registration: process.env.REGISTRATION_ENABLED !== "false",
});
const port = Number(process.env.PORT || 3000);
app.server.listen(port, "0.0.0.0", () =>
  console.log(`Sunomat listening on ${port}`),
);
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  app.server.close(() => {
    app.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
