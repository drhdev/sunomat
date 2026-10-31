# Implementation plan

Execute chunks in order. Before marking a chunk complete, run its acceptance checks and record evidence below. Keep this file current in every implementation commit.

- [x] 1. Foundation: document research and scope; strict TypeScript, React/Vite, reusable shadcn/ui primitives, shared validated song schema.
- [x] 2. Persistence: SQLite migrations, WAL, bounded immutable revisions, title-derived names, transactional 100-save limit, ownership checks, conflict detection.
- [x] 3. Identity: registration/login/logout, scrypt password hashing, opaque expiring sessions, same-origin CSRF protection, throttling, secure cookies.
- [x] 4. Composer: public responsive sound/lyrics/controls/production editor, clickable categorized tags, presets, all-field copying, import/export, dark/light mode.
- [x] 5. Guidance: sourced deterministic per-field advice, examples, contradictions, counters, repeatability checks; distinguish suggestions from requirements.
- [x] 6. Library: private search/filter, favorites, templates, revisions, restore, delete, quota display and unsaved-change protection.
- [x] 7. Operations: multi-stage non-root Docker image, Compose health check and volume, Coolify instructions, backup/restore and maintenance guidance.
- [ ] 8. Verification: typecheck, production build, API integration tests covering identity/isolation/quota/versioning/CSRF, guidance tests, available UI verification; push implementation to GitHub.

## Evidence and progress

- 2026-10-31: repository inspected (initial LICENSE only). Research retrieved from Sonoya, Suno help and comparable builders. Implementation started.
- 2026-10-31: chunks 1–7 implemented. `npm test`: 6 tests passed, including ownership isolation, immutable history, optimistic concurrency, a race for slot 100, schema limits, CSRF, session expiry, throttling and conditional handoff.
- 2026-10-31: `npm run build` passed (strict typecheck + Vite + bundled server). Browser payload approximately 137 KB gzip JS and 9 KB gzip CSS. `npm audit`: zero reported vulnerabilities at review time.
- 2026-10-31: Chromium workflows passed (3 committed Playwright tests): account/private library/revisions/template/deletion/logout; 375px dark layout/audio controls/tempo merge/dirty guard; JSON import, invalid import handling, clipboard and TXT export. Additional interactive browser run covered the same core workflow with no page runtime errors. Desktop and mobile screenshots inspected.
- 2026-10-31: Docker image built successfully. Runtime checked with non-root `node`, readonly root filesystem, 384 MB cap, dropped capabilities and writable named volume. Health check passed. Saved data survived container restart. SQLite `VACUUM INTO` backup passed `PRAGMA integrity_check` and retained saved content. Operator password reset and subsequent login passed.
- Pending final source synchronization: commit/push to GitHub and record the returned result. Actual Coolify deployment/domain TLS cannot be verified without access to the user's Coolify server; deployment is an operator step, not an unfinished code chunk.

## Follow-up procedure

For each new task: read `docs/project.md`, this checklist and repository instructions; implement a bounded chunk; run affected checks; update evidence and remaining work; commit. Never check off unverified work. Keep unresolved external-service or deployment limitations explicit.
