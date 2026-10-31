# Sunomat

A lightweight, self-hosted workspace for preparing Suno songs and remembering the settings behind your best results. Public composer; private per-user projects, templates and immutable version history. No Suno account credentials, paid AI service or music-generation API required.

## Run locally

Requires Node.js **24.13+** and npm. SQLite is built into Node; there is no database service to install.

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`. The API runs on port 3000. Development uses HTTP cookies; production requires HTTPS. Drafts remain in memory until explicitly saved or exported. Theme preference is the only localStorage entry.

```sh
npm test
npm run build
APP_ORIGIN=https://songs.example.com NODE_ENV=production npm start
```

## Deploy with Coolify

1. Add this GitHub repository as a **Docker Compose** application using `compose.yaml`.
2. Set `APP_ORIGIN` to the exact public HTTPS origin, e.g. `https://songs.example.com`, without a trailing slash. Leave `REGISTRATION_ENABLED=true` for new users; set it to `false` to close registration later.
3. In Domains, select service `sunomat` and route `https://songs.example.com:3000` to internal port **3000**. Coolify uses `:3000` as the internal routing hint; the public origin remains `https://songs.example.com` for `APP_ORIGIN`. Enable TLS. No host port publication is needed.
4. Deploy. Coolify should report healthy once `/api/health` succeeds. Register an account and test saving a setup.
5. Back up the persistent `sunomat-data` volume. Keep **one replica** on one host; SQLite is not a shared multi-host database.

The Compose service has a 384 MB memory ceiling, read-only root filesystem, dropped Linux capabilities and a non-root user. Its named volume is writable at `/data`. No Redis, Postgres, background worker or external LLM is used. Coolify itself needs additional resources.

Detailed architecture, research, operational caveats and acceptance criteria: [docs/project.md](docs/project.md). Executable work checklist and verification record: [docs/implementationplan.md](docs/implementationplan.md). Backup/recovery: [docs/operations.md](docs/operations.md).

Deployment settings follow the current [Coolify Docker Compose documentation](https://coolify.io/docs/applications/builds/docker-compose).

## Browser checks

```sh
npx playwright install chromium
npm run test:e2e
```

The browser suite starts an isolated server on port 4173 with a temporary database, and removes that database afterward. CI runs API tests, the production build, Chromium workflows and a Docker image build. Browser binaries and test tools are not included in the production image.

## What is stored?

Every save creates an immutable snapshot. Each account has **100 saved snapshots total**, across songs and templates. Editing and saving adds a version; opening a previous version and saving creates a new latest version. Delete individual versions or whole projects to free space. Templates receive stable, unique names derived from their initial title and a UUID.

In **My library**, **Export library** downloads every project and saved version as one private JSON backup. **Import library backup** previews its contents and available space before restoring new copies. Existing records are never overwritten. History order, original timestamps and all song settings are retained. Importing the same backup again creates additional copies, so check the library before retrying an interrupted import. The entire import succeeds or fails together; it cannot exceed your 100-version allowance. No account credentials or sessions are included.

The composer includes v6-family models, Custom/Simple mode, style tags, lyrics and section tags, exclusions, instrumental/vocal choices, creative sliders, Variety, Max Mode, reference notes, personalization context and production tracking. Each field can be copied; export/import supports complete JSON setups, and the handoff offers text for manual use in Suno. In a project's version history, use **Compare with latest version** to review the exact changed fields without changing your saved snapshots or using storage.

All app-owned interface text, guidance, validation and documentation is in English. Dates and counters explicitly use English formatting even when the browser prefers another language; dates still use the user's local time zone. User-written lyrics, titles and notes remain in their original language. Source URLs and established music genre names are retained. Guidance is rule-based, based on the [Sonoya guide](https://sonoya.com/suno-v6-anleitung-eigene-songs-mit-ki-erstellen/) and linked Suno documentation. Recommendations are not guarantees or official validation. Planning values such as target duration do not control Suno unless applied there. Sunomat does not upload media or generate audio.

## License

The repository's existing [GPL-3.0 license](LICENSE) is retained. Locally owned shadcn-style primitives use Radix, CVA and Tailwind conventions; upstream dependency licenses remain applicable.
