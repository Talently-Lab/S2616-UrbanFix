# QA Review — BE-02 corrected candidate `0829fc0` (issue #10)

**Review type:** revalidation of the builder's second version. **Verdict: TECHNICAL APPROVAL** — all B1–B6 defects verified resolved at runtime; M1 residual resolved in practice. Preceded by `be-02-review-1cd134f.md` (CHANGES REQUESTED on the first version).

## Scope and hashes

| Item | Value |
|---|---|
| Candidate | `0829fc0f799d3f718b731230b341fb6ddb0d64a5` ("fix(tests): robustecer ciclo de vida…") on top of `1cd134f` |
| QA application | cherry-pick into detached worktree `/tmp/uf-qa-be02-1cd134f` → QA hash `d399359`; all 4 changed files verified **byte-identical** to `0829fc0` via sha256 |
| Diff scope | backend-only: `tests/api/{api.test.js,harness.js,runner.js}`, `tests/migrations/verify-migrations.js` (+363/−97). `frontend/`, `data/`, `qa/` untouched |
| Env | Node v24.21.0, npm 11.19.0, Docker `postgres:16-alpine`, lab `uf-be02-lab` @127.0.0.1:55435; no `.env`; npm install-scripts blocked → genuine no-client clean state |

## Fix verification — each prior defect re-tested live

| Defect | Fix | Executed verification | Result |
|---|---|---|---|
| **B1** missing `prisma generate` | `ensurePrismaClient` step before migrate/seed | `rm -rf node_modules && npm ci` (client absent — verified via require probe) → `npm test` | **RESOLVED**: `[Harness Prisma] Verificando / generando` → 31/31 → exit 0 |
| **B2** leak before env registration | container **ID** registered in `activeResources` immediately after `docker run`, before readiness; DB names registered before `CREATE` | docker shim → sleeper container → readiness timeout | **RESOLVED**: exit 1, container removed by ID, `NO ORPHAN CONTAINER` |
| **B3** signal race → API orphan | handler only marks `isShuttingDown` + `killAllChildProcesses` (PGID `kill(-pid)`); teardown once in `finally`; `apiServerProcess` registered right after `spawn` | SIGTERM to runner PID at "Arrancando proceso de API" log line | **RESOLVED**: exit 143, container removed, `NO API ORPHAN` (v1 leaked `node src/index.js`) |
| **B4** cleanup errors → exit 0 | `teardownTestEnvironment` accumulates `cleanupErrors` → throws → runner `process.exit(1)` | docker shim → `docker rm` always fails | **RESOLVED**: tests passed yet `REAL_EXIT:1` with "fallos durante la limpieza" (was exit 0 in v1) |
| **B5** localhost:3001 fallback | hard abort when `API_BASE_URL`/`HEALTH_URL` unset | `node --test tests/api/api.test.js` direct | **RESOLVED**: security error, **0 HTTP attempts** (v1 fired 31 requests at :3001) |
| **B6** unbounded readiness fetch | `AbortSignal.timeout(2000)` per readiness request; `5000` on all test fetches | code-verified + mechanism proven earlier | **RESOLVED** (bounded per request; loop timeout no longer sole bound) |
| **M1** (verify-migrations) create-in-flight race | DB name **pre-registered** before `CREATE`; children killed via process group | SIGINT during F2 in-flight `migrate resolve` | **RESOLVED in practice**: exit 130, all registered DBs + own sentinel dropped, 0 leftovers. Residual *theoretical* limit: a `CREATE DATABASE` committing server-side after teardown's `DROP IF EXISTS` (sub-ms ordering race, not reproducible — documented, not a blocker) |

## Additional executed checks

- **Early signal during container readiness** → exit 143, container removed by ID, no procs/containers.
- **Signal during test phase (v1, E7)** → clean; same path now kills test child via PGID.
- **Negative regression** → temp copy with 5 broken assertions → `fail 5` → `REAL_EXIT:1`, cleanup clean. Suite detects regressions.
- **TEST_DATABASE_URL dedicated mode** → 31/31, `uf_test_api_*` dropped, 0 leftovers, URL masked `postgres:***@`.
- **Docker auto mode (clean install)** → 31/31, exit 0, container + processes reaped; generated `testpass_*` never printed.
- **Migration path**: `prisma migrate deploy` + `prisma/seed.js` — never `db push` (code + logs).
- `MIGRATION_GUIDE.md`'s M1-resolution claim is now accurate for the practical window.

## #10 acceptance-matrix coverage

Identical suite to v1: 31 real HTTP cases covering registration (CLIENTE/TECNICO 201, ADMIN 400, dup 409, validation 400), 3-role logins, uniform 401s, 401/403 matrix, profile + passwordHash secrecy, client isolation, técnico pool/exclusion, rejection+motive+history privacy, concurrent accept (1×200 / rest 409), lifecycle + illegal transitions + cancel windows, admin list/pagination/PATCH/estado-filter, CORS preflight, health. **Unchanged gaps:** admin `?rol=` filter unasserted (baseline defect — silently ignored); seed-run-twice idempotency not exercised by `npm test` (covered by `test:migrations` F0).

## Limits and pending observations

- Signal windows are timing-dependent; each probe was executed live (deterministic log-triggered watcher); the surviving M1 residual is the non-reproducible server-side ordering race noted above.
- `runCommandAsync` grandchildren (prisma CLI via `sh -c`) are now killed via process groups — verified through clean exits; not separately orphanned-tested.
- Non-blocking gap from v1 remains: `?rol=` admin filter and seed-twice coverage.
- All `uf-test-pg-*`/`uf_*` resources and the `uf-be02-lab` container will be removed after report; worktree `/tmp/uf-qa-be02-1cd134f` removed after delivery.

**Conclusion:** issue #10 is technically satisfied by `0829fc0`: `npm test` reproducibly runs 31 real integration cases against a migrated, seeded, isolated PostgreSQL with deterministic exit codes and no leaked resources. Integration/push/closure remain pending user approval — this certifies the tested tree only.
