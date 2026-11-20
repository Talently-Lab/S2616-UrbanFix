# QA Review — BE-02 candidate `1cd134f` (issue #10)

**Review type:** first independent review. **Verdict: CHANGES REQUESTED** (7 reproduced defects). This is not a certification of any future revision; the corrected candidate `0829fc0` is reviewed separately.

## Scope and environment

| Item | Value |
|---|---|
| Candidate | `1cd134f0248a82085014bb22688b84c202ed9a5e` ("feat(api): restaurar npm test con suite de integracion aislada y resolver residual M1") |
| Parent | `793ec1a` (coordination branch with docs 9376830/83531f8) |
| Test method | `git worktree add /tmp/uf-qa-be02-1cd134f 1cd134f --detach` — QA-owned temporary worktree; builder branch and production untouched |
| Env | Node v24.21.0, npm 11.19.0, Docker `postgres:16-alpine`; lab container `uf-be02-lab` @127.0.0.1:55435 (`TEST_DATABASE_URL` mode); no `.env` |
| Constraint | npm install-scripts blocked in this env → `npm ci` produces **no generated Prisma client** — ideal for B1 verification |

## Diff verification

`git diff --stat 793ec1a..1cd134f` → 8 files, **all under `backend/`**: `.env.example`, `README.md`, `docs/MIGRATION_GUIDE.md`, `package.json`, `tests/api/{api.test.js,harness.js,runner.js}`, `tests/migrations/verify-migrations.js`. `frontend/`, `data/`, `qa/` untouched. `npm test` redefined `bash ../scripts/test-api.sh` → `node tests/api/runner.js`.

## Cases actually executed (with exit codes)

| # | Command | Exit | Result |
|---|---|---|---|
| E1 | `npm ci` (clean, no generated client) + `npm test`, Docker auto | 1 (runner error branch; probe B2 confirmed real non-zero) | **B1 reproduced**: fails at `applySeed` — `SyntaxError: '@prisma/client' does not provide an export named 'PrismaClient'` |
| E2 | `npx prisma generate` then `npm test`, Docker auto | **0** | 31/31 pass in 6.7s; ephemeral container `uf-test-pg-*` removed; no orphan processes; generated password never printed (`grep testpass_` = 0); `migrate deploy` used (not `db push`) |
| E3 | `TEST_DATABASE_URL=<lab> npm test` | **0** | 31/31 pass; `uf_test_api_*` DB dropped; 0 leftover DBs; URL masked `postgres:***@` |
| E4 | B2 probe: docker shim → `docker run` starts non-Postgres sleeper → readiness timeout | **1** | **B2 reproduced**: `uf-test-pg-b301d68182` orphaned (env never received it). Manually removed |
| E5 | B4 probe: docker shim → `docker rm` fails | **0** | **B4 reproduced (severe)**: 31/31 "PASARON", `Error eliminando contenedor` logged, exit 0 anyway, container `uf-test-pg-10e1f1a124` orphaned. Falsely green run |
| E6 | B3 probe: SIGTERM to runner during `startApiServer` spawn | 143 | **B3 reproduced**: container removed (env.db registered) but spawned `node src/index.js` (PID 116257) **orphaned** — `env.apiServer` not yet assigned when handler ran teardown + `process.exit` |
| E7 | SIGINT during test phase | 130 | Clean: test child SIGTERM'd, container removed, no orphans. Test child reports artificial failure "event loop resolved" — cosmetic |
| E8 | B5 probe: `node --test tests/api/api.test.js` directly | 1 | **B5 reproduced**: all 31 requests to `127.0.0.1:3001` → `ECONNREFUSED`. On a machine with a real server there, the suite would write to it |
| E9 | B6 proof: `fetch` to TCP-accept-never-respond server | — | **B6 confirmed**: fetch pending >20s while the 15s loop timeout is irrelevant — it only checks elapsed *between* attempts; one hung request stalls readiness forever |
| E10 | Controlled regression: temp copy of api.test.js with 5 assertions expecting 999 | **1** | `fail 5`, real exit 1, container cleaned — suite detects regressions (not vacuously green) |
| E11 | M1 revalidation: SIGINT to `verify-migrations.js` mid-F2-Mislabeled | — | **M1 NOT resolved**: log interleaves `[SIGINT recibido] [Limpieza unificada] ... Creada base aislada: uf_f2_mislabeled_baaeebc257 - Eliminada: uf_f0_* - Eliminada: uf_f2_*` → the in-flight `CREATE DATABASE` registered *after* cleanup enumerated → **orphan DB** (manually removed) |
| E12 | Second unplanned SIGINT during setup (dead-shell run) | — | Corroborates class: container `uf-test-pg-8ab742498b` orphaned when its runner died pre-registration (removed manually) |

## #10 acceptance-matrix coverage (31 cases, all executed and passing in E2/E3)

| Baseline criterion | Covered by | Status |
|---|---|---|
| Public endpoints + CORS preflight | health, categorías, OPTIONS `allow-origin: *` | ✓ |
| Registration CLIENTE/TECNICO, ADMIN blocked | 201s + `400 VALIDATION_ERROR` | ✓ |
| Login 3 roles, invalid credentials (uniform 401) | seeded logins, wrong pass, unknown email | ✓ |
| 401/403 matrix | no token, tampered token, TECNICO can't create, cross-client 403, admin 403 | ✓ |
| Profile + passwordHash never exposed | `/auth/me`, register, login, admin list | ✓ |
| Client isolation | Cliente B can't see/list A's solicitudes | ✓ |
| Técnico pending pool + own requests | rejection excludes from pool, detail 403 | ✓ |
| Rejection: required motive, history privacy | asserted | ✓ |
| Concurrent accept: exactly one 200, rest 409 | "Aceptación simultánea (KAN-216)" | ✓ |
| Legal/illegal transitions + cancel windows | full lifecycle PENDIENTE→FINALIZADA | ✓ |
| Admin users list/pagination, PATCH usuario | asserted | ✓ |
| Admin solicitudes filter by estado | asserted | ✓ |
| Seed idempotent (run twice) | suite seeds once; idempotency covered by test:migrations F0 | partial |
| Admin `?rol=` filter | **not asserted** (baseline defect: filter silently ignored — still unverified) | gap |
| Clean resources | teardown verified incl. failure paths | ✓ w/ B2–B4 caveats |

DB really migrated: harness runs `prisma migrate deploy` + `prisma/seed.js` — code- and log-verified; never `db push`.

## Defects (by impact)

1. **D-B4 (critical):** teardown errors swallowed → exit 0 with orphaned resources (E5).
2. **D-B1 (high):** `npm test` lacks `prisma generate` → fails on clean install without client (E1).
3. **D-B2 (high):** Docker container created before `env` registration → readiness failure orphans it (E4).
4. **D-B3 (high):** `handleSignal` teardown+exit races `main()`; API spawned before registration → orphan process (E6). Same class allows orphans if signaled during `docker run`/readiness (E12).
5. **D-M1 (medium):** verify-migrations fix incomplete — in-flight `CREATE DATABASE` registers after cleanup enumeration → orphan `uf_f2_mislabeled_*` (E11); `MIGRATION_GUIDE.md` claims "impidiendo la creación de bases huérfanas durante el teardown" — disproven.
6. **D-B5 (medium):** `API_BASE_URL` fallback `127.0.0.1:3001` — direct `node --test` hits a real dev server if present (E8).
7. **D-B6 (medium):** readiness `fetch` has no per-request timeout; hung connection stalls loop indefinitely (E9).
8. **D-Cov (minor):** admin `?rol=` filter and seed-run-twice not exercised by `npm test`.

## Limits

- B3/B4/M1 windows are timing-dependent; each reproduced once (B3/E6 deterministic via log-triggered signal). A second API-startup SIGINT attempt raced past the window and the suite passed cleanly — the race is real but narrow.
- SIGKILL cleanup not required nor tested.
- The `sh -c` wrapper in `runCommandAsync` spawns untracked grandchildren (prisma CLI); not observed to leak (short-lived) but teardown doesn't reap them.
- `npm test` exit code on the B1 path: runner prints error branch → `process.exit(1)`; verified as non-zero via E4 (same code path family), E1's piped capture masked it.

## Cleanup evidence

All `uf-test-pg-*` containers, `uf_test_api_*`/`uf_*` lab DBs, orphan `node src/index.js` (PID 116257), sentinel DBs removed; `/tmp` probes retained as logs only. Worktree `/tmp/uf-qa-be02-1cd134f` retained for the `0829fc0` revalidation.
