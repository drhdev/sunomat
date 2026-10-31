# Operations

## Coolify deployment

Use a Git-based Docker Compose application from this repository, file `compose.yaml`. Under General / Build pipeline select Compose, Base Directory `/`, Compose Location `/compose.yaml`. In Domains, select service `sunomat` and enter `https://songs.example.com:3000`. The port suffix tells Coolify which internal port receives requests; public traffic still uses HTTPS port 443. Set APP_ORIGIN to `https://songs.example.com` without that routing suffix. Enable TLS at the reverse proxy. Avoid public host-port mappings that bypass the proxy. These steps follow the current [Coolify Compose guide](https://coolify.io/docs/applications/builds/docker-compose), checked 2026-10-31.

The persistent named volume mounts `/data`; database, WAL and SHM all live there. Do not mount only the database file. Start one replica. A fresh named volume inherits `/data` ownership (UID/GID 1000). For an existing bind mount, the operator must provision ownership for UID 1000. Never solve volume permissions by running the app as root.

`REGISTRATION_ENABLED=false` closes registration but preserves login. No default account or password is shipped. Create your account, then close registration if the instance is for a known group. Use the Coolify proxy's request/body limits and login-path rate limiting for a public installation. The application does not trust arbitrary X-Forwarded-For headers.

The Compose configuration is intended for current Docker Compose / Coolify support. No Coolify server credentials are part of this project, so actual domain routing and deployment must be completed on the operator's server.

## Backup

Create an application-consistent backup using SQLite's `VACUUM INTO`; a raw copy of the main file while WAL is active may miss recent commits. The backup contains private email addresses, password hashes and lyrics. Keep encrypted copies outside the production host.

```sh
docker compose exec -T sunomat node scripts/backup.mjs /data/backup.db
```

The script refuses to overwrite an existing file. Copy it to a secure location using your Coolify volume tools or `docker compose cp sunomat:/data/backup.db ./sunomat-backup.db`. Remove the temporary volume copy after verifying the off-host backup. Include a timestamp in the path for scheduled backups and apply a retention policy. Test restores periodically.

## Restore

### User-level library backup and restore

Users can choose **My library → Export library** for a portable JSON backup of their own projects and every saved version. This is separate from the database backup above: it does not contain credentials, sessions or other accounts. Store exported files privately because they contain lyrics, notes and reference descriptions.

To restore, sign in, open **My library → Import library backup**, choose the JSON file and review the preview. Each imported version counts toward the account's 100-version limit. The operation creates new project/version identities and new copies; it never replaces existing data. Reimporting the same backup creates additional copies. If a connection fails during import, check the library before retrying. Invalid archives, insufficient quota and write failures leave no partial import. Original version timestamps and order are retained. This feature is suitable for moving settings between accounts or instances, not restoring account authentication or synchronizing libraries.

Archives are limited to 100 total versions and 20 MiB. Ensure any reverse-proxy body limit allows the required backup size for `/api/library/import`; other application endpoints retain their 80 KB body cap. Only one import per Node process is accepted at a time to bound resource usage. There are no new services, dependencies or schema migrations.

### Full database restore

1. Stop the service and take a final backup of the old volume if possible.
2. Restore the backup database into the volume at `/data/sunomat.db`, owned by UID/GID 1000. Remove stale `sunomat.db-wal` and `sunomat.db-shm` **only while the service is stopped**, after preserving the old database files together.
3. Start the service. Check `/api/health`, sign in, inspect a song and its history.
4. A restored backup also restores sessions. To revoke them all, run `docker compose exec -T sunomat node scripts/revoke-sessions.mjs` after startup.

Never run `docker compose down -v` unless you intentionally want to erase the database volume. Do not roll back across a schema change without restoring the matching backup.

## Account recovery

There is no email reset service. An authorized server operator can reset a user's password through stdin; no password is accepted as a command-line argument. Verify the requesting person's identity outside this application first. Run interactively in a trusted terminal, or use a password manager to supply stdin:

```sh
docker compose exec -T sunomat node scripts/reset-password.mjs user@example.com
```

Supply the new password followed by EOF on stdin. Be aware that a normal terminal may echo stdin; prefer a password-manager pipe or a terminal with echo disabled. Passwords must be 12–128 characters. Resetting revokes that account's sessions. The script prints only the completion status. Do not store passwords in shell history or backup scripts.

## Local production check

`npm run build && npm start` serves the production bundle with development cookies when NODE_ENV is unset. For a real production launch, set NODE_ENV=production and APP_ORIGIN to the public HTTPS origin behind your TLS proxy. HTTP localhost testing is intentionally separate from production cookie settings.

Health: GET `/api/health`; logs contain operational failures, not request bodies. On disk-full or permission failures, saving returns an error and the editor retains its unsaved contents. Export the draft while the operator repairs storage. Check disk usage, volume ownership and SQLite integrity before restarting repeatedly.

## Upgrades

Back up, review dependency and schema changes, rebuild the image, deploy, check health and a saved record. `npm ci` uses the committed lockfile. Run `npm test`, `npm run build` and `npm audit` when changing dependencies. Automatic application migrations are transactional; unknown newer schema versions fail startup. Keep this documentation and the implementation checklist synchronized with code.
