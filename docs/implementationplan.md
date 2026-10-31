# Implementation plan

Execute chunks in order. Before marking a chunk complete, run its acceptance checks and record evidence below. Keep this file current in every implementation commit.

- [x] 1. Foundation: document research and scope; strict TypeScript, React/Vite, reusable shadcn/ui primitives, shared validated song schema.
- [x] 2. Persistence: SQLite migrations, WAL, bounded immutable revisions, title-derived names, transactional 100-save limit, ownership checks, conflict detection.
- [x] 3. Identity: registration/login/logout, scrypt password hashing, opaque expiring sessions, same-origin CSRF protection, throttling, secure cookies.
- [x] 4. Composer: public responsive sound/lyrics/controls/production editor, clickable categorized tags, presets, all-field copying, import/export, dark/light mode.
- [x] 5. Guidance: sourced deterministic per-field advice, examples, contradictions, counters, repeatability checks; distinguish suggestions from requirements.
- [x] 6. Library: private search/filter, favorites, templates, revisions, restore, delete, quota display and unsaved-change protection.
- [x] 7. Operations: multi-stage non-root Docker image, Compose health check and volume, Coolify instructions, backup/restore and maintenance guidance.
- [x] 8. Verification: typecheck, production build, API integration tests covering identity/isolation/quota/versioning/CSRF, guidance tests, available UI verification; push implementation to GitHub.

## Follow-up implementation chunks

- [x] 9. English-language audit: fixed English date/number formatting, readable labels for every field, shared account validation, controlled import/network errors and English documentation.
- [x] 10. Version comparison: compare earlier snapshots against the latest version with exact per-field changes; preserve saved data and storage usage.
- [x] 11. Account request consistency: ignore delayed responses after sign-out, account changes or a newer refresh, keeping each user's workspace private.
- [x] 12. Verify follow-up: API/presentation tests, non-English-browser regression coverage, version-comparison and delayed-account-response browser workflows, production build and push to main.

## Library portability chunks

- [x] 13. Private library export: include every project and immutable version in a validated, versioned JSON archive; exclude account credentials and session data.
- [x] 14. Additive library restore: preview contents, preserve history order and timestamps, generate new identities, enforce quota atomically and never overwrite existing projects.
- [x] 15. Verification and delivery: test archive validation, account isolation, round-trip fidelity, quota/rollback, browser download/import and account switching; document and push to main.

## Account management chunks

- [x] 16. Authenticated password change: current-password confirmation, shared validation, bounded password work and revocation of other sessions; preserve the current session.
- [x] 17. Self-service account deletion: password plus email confirmation, owner-only transactional removal of records and sessions, clear backup guidance and complete browser-state cleanup.
- [x] 18. Verify and deliver account management: API isolation, session invalidation, failed-operation rollback and concurrency, English mobile forms, regression checks, documentation and push to main.

## Library discovery chunks

- [x] 19. Library discovery: combined minimum-rating and project filters, all production stages, stable date/rating/title sorting and context search, without changing saved snapshots.
- [ ] 20. Verify and deliver discovery: unit and mobile browser coverage, full regression checks, production build, documentation and push to main.

## Verification record

- 2026-10-31 library discovery: added combined minimum-rating and project/stage filters, numeric English title/date/rating sorting and context search over latest snapshots. `npm test` passed 22 tests; production build/typecheck passed; Chromium passed all 11 workflows, including combined filters at 375px, empty results, no horizontal overflow and unchanged storage usage. Browser JS is approximately 143 KB gzip. No dependencies, migrations or runtime services were added.

- 2026-10-31: repository inspected (initial LICENSE only). Research retrieved from Sonoya, Suno help and comparable builders. Implementation started.
- 2026-10-31: chunks 1–7 implemented. `npm test`: 6 tests passed, including ownership isolation, immutable history, optimistic concurrency, a race for slot 100, schema limits, CSRF, session expiry, throttling and conditional handoff.
- 2026-10-31: `npm run build` passed (strict typecheck + Vite + bundled server). Browser payload approximately 137 KB gzip JS and 9 KB gzip CSS. `npm audit`: zero reported vulnerabilities at review time.
- 2026-10-31: Chromium workflows passed (3 committed Playwright tests): account/private library/revisions/template/deletion/logout; 375px dark layout/audio controls/tempo merge/dirty guard; JSON import, invalid import handling, clipboard and TXT export. Additional interactive browser run covered the same core workflow with no page runtime errors. Desktop and mobile screenshots inspected.
- 2026-10-31: Docker image built successfully. Runtime checked with non-root `node`, readonly root filesystem, 384 MB cap, dropped capabilities and writable named volume. Health check passed. Saved data survived container restart. SQLite `VACUUM INTO` backup passed `PRAGMA integrity_check` and retained saved content. Operator password reset and subsequent login passed.
- 2026-10-31: final Chromium suite passed again after adding mobile account/sign-out access. Final Docker rebuild passed after cleaning this session's temporary Docker build cache (an intermediate attempt exhausted this environment's disk). Runtime health also passed for the final image. An earlier idle runtime sample used approximately 24 MiB; this is an observation, not a production sizing guarantee.
- 2026-10-31: GitHub write access confirmed after the earlier blocked synchronization attempt. Implementation commit `55a6f9b` and verification record `c2f1f29` successfully pushed to `drhdev/sunomat` branch `main` using a normal fast-forward push. All eight implementation chunks are complete.
- 2026-10-31 follow-up: completed the English-language audit. App-owned labels, date/number formatting, account validation and import/connection errors use English. User-authored song content, source URLs and conventional genre names are preserved. Added exhaustive field labels and shared import/credential validation without database changes or new dependencies.
- 2026-10-31 follow-up: added read-only saved-version comparison, including lyrics, controls, references and production notes. Mobile comparison stacks earlier/latest values and the browser test verifies that comparison leaves quota usage unchanged.
- 2026-10-31 follow-up: scoped asynchronous library/history/save/delete/account-status results to the current account. Three browser cases hold an earlier user's library, history and save responses until after another account signs in and confirm the private workspace remains empty for the new account.
- 2026-10-31 follow-up checks: `npm test` passed 10 tests; production build/typecheck passed; Chromium passed 7 workflows, including a `de-DE` browser with English counters, account validation, dates and connection errors, plus mobile version comparison. Browser JS remains approximately 139 KB gzip; no database migration or additional runtime service is required. Implementation commit `613f93d` was successfully pushed to `main`; follow-up chunks 9–12 are complete.
- Actual Coolify deployment/domain TLS cannot be verified without access to the user's Coolify server; deployment is an operator step, not an unfinished code chunk.
- 2026-10-31 library portability: implemented owner-only full-history JSON export and additive transactional restore, with a mobile preview, account-switch-safe downloads, new identities, preserved timestamps/order and the same 100-version quota. Archives contain no account records or sessions. Existing projects are never changed; repeated imports intentionally create additional copies and the preview explains this.
- 2026-10-31 library checks: `npm test` passed 14 tests, including authenticated export isolation, exact version/template round trips, archives above the ordinary 80 KB request cap, malformed/empty archives, quota rejection, rollback after a simulated second-project write failure and release of the single-import slot after validation failure. Production build/typecheck passed. Chromium passed 9 workflows including complete library download and restore at 375px, duplicate-copy warnings, client quota guards and suppression of a delayed export after switching accounts. Browser JS is approximately 141 KB gzip. No dependencies, services or migrations were added. Implementation commit `235cbde` was successfully pushed to `main`; library portability chunks 13–15 are complete.
- 2026-10-31 account management: added current-password-protected password change and typed-email/password-confirmed account deletion. Password changes preserve the current session's existing expiry and revoke other sessions. Transactions recheck live session and credential hash after asynchronous derivation; failures and competing updates cannot silently replace credentials or partially remove records. Deletion cascades only the authenticated owner's account/library/sessions and clears their browser workspace. Shared scrypt helpers retain compatibility with existing hashes and the operator reset script. No migration, dependency or service was added.
- 2026-10-31 account checks: `npm test` passed 21 tests, including salted/malformed hash handling, current-password proof, CSRF, session revocation, competing changes, revoked-session rejection, rollback of password updates and cascading deletion, owner isolation, re-registration without old data and account throttling. Production build/typecheck passed. Chromium passed 10 workflows, including English account validation and account deletion at 375px in a `de-DE` browser. Documentation covers library/draft export before deletion, retained external backups and operator-assisted forgotten-password recovery. Browser JS is approximately 143 KB gzip. Implementation commit `00e15f4` was successfully pushed to `main`; account management chunks 16–18 are complete.

## Follow-up procedure

For each new task: read `docs/project.md`, this checklist and repository instructions; implement a bounded chunk; run affected checks; update evidence and remaining work; commit. Never check off unverified work. Keep unresolved external-service or deployment limitations explicit.
