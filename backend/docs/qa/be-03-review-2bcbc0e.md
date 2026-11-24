# QA Review — BE-03 candidate `2bcbc0e` (issue #11)

**Review type:** independent validation of the first BE-03 candidate. **Verdict: CHANGES REQUESTED** — runtime API behaviour is largely correct (55/55 suite, startup matrix, migrations), but two defects returned to the builder are confirmed on this revision: CORS error messages leak credentials embedded in the offending origin (C1), and the negative startup tests are not isolated from a developer `backend/.env` (C2). Minor observation C3 (incomplete `Vary: Origin`) also confirmed by code inspection and runtime probe on the successor commit.

## Scope and hashes

| Item | Value |
|---|---|
| Candidate | `2bcbc0ef3f422adcf32d39c1cb3837f886e35d8d` ("feat(config): validar entorno en arranque, JWT sin fallback y CORS configurable (BE-03)") on top of `ce44c1c` |
| Diff scope | backend-only (12 files, +789/−42): new `src/config/env.js`, `src/middlewares/cors.middleware.js`, auth JWT wiring, `.env.example`/README/API_CONTRACT updates, 24 new cases in `api.test.js`. `frontend/`, `data/`, `qa/` untouched; `prisma/migrations/` byte-identical to base (canonical SQL intact) |
| Env | Node v24.21.0, npm 11.19.0, Docker `postgres:16-alpine`; ephemeral Docker DB for `npm test`; exclusive lab container `uf-be11-qa-lab` @127.0.0.1:38995 for `test:migrations` and probes; no `backend/.env` present except during the C2 fixture run (created and deleted by QA, gitignored) |

## Executed checks — results

| Check | Command / method | Result |
|---|---|---|
| Clean install | `npm ci` | **PASS** — 268 pkgs; install-scripts blocked on host → genuine no-generated-client state; harness `prisma generate` step covers it |
| Integration suite | `npm test` (Docker auto mode) | **PASS** — 55/55 tests (31 prior HTTP cases + 24 BE-03 cases), exit 0, ephemeral container + API process reaped, no orphans |
| Migration matrix | `TEST_DATABASE_URL=<lab> npm run test:migrations` | **PASS** — F0–F11 all pass on exclusive lab server; QA sentinel DB survived; all `uf_*` DBs dropped |
| Startup matrix (QA probe, `/tmp/uf-qa-be11/probe-startup.mjs`) | 37 negative `spawnSync node src/index.js` cases + 2 positive | **36 PASS / 1 FAIL (C1)** — every invalid var aborts with exit 1 naming the variable and never opens the port; valid env and `JWT_EXPIRES_IN=15m` listen normally |
| Prisma CLI independence | `env -u JWT_SECRET -u CORS_ORIGINS` → `prisma validate`, `prisma generate`, `db:precheck`; migrate/seed via test:migrations | **PASS** — none require JWT_SECRET nor production CORS |
| JWT claims | suite assertions (register/login decode `exp-iat === 604800`) + `jwt.sign` wiring via `getJwtConfig().expiresInSeconds` | **PASS** at suite level for 7d default; independent non-7d runtime probe deferred to successor review |
| Expired token | suite case `expiresIn: '-1s'` → 401 `UNAUTHORIZED` | **PASS** — no long sleeps |

Environment note: the first `npm test` attempt reported "Docker no está disponible" — a transient `docker info` slowdown on this shared host (manual retry: 0.49s; re-run passed). The readable failure path worked as designed; not a product defect, but the 3s probe timeout is a real flake source under load.

## Confirmed defects

### C1 — CORS config errors echo the offending origin, leaking credentials (CONFIRMED, security)

`validateCorsOrigins` interpolates the raw entry into error messages at `env.js:187,191,195,199,203,207`. Startup reproduction with a lab marker (no real secrets):

```
CORS_ORIGINS='https://probe_user:probe_password@example.org' NODE_ENV=production node src/index.js
→ stderr: Variable de entorno CORS_ORIGINS inválida: "https://probe_user:probe_password@example.org" no debe incluir credenciales.
```

`probe_password` appears verbatim in stderr — contradicts the no-secrets-in-logs rule (README: "sin exponer secretos ni contraseñas"). The same interpolation leaks userinfo/query/fragment in the URL-parse, protocol, path, query and hash branches; a malformed-URL marker is also echoed. `validateNodeEnv` also interpolates `env.NODE_ENV` into its message — lower sensitivity, same pattern.

**Required change:** never include the raw variable value in `ConfigError` messages (name the variable and the violated rule only; at most a sanitized scheme/host).

### C2 — negative startup tests not isolated from `backend/.env` (CONFIRMED)

`runStartup` (`api.test.js:1012`) spawns `node src/index.js` with `cwd: backendRoot` and deletes overridden keys from the child env — but `src/index.js` loads `dotenv`, so a real `backend/.env` silently restores the "absent" variables. Reproduced in a QA-owned fixture (`.env` with sentinel values, gitignored, deleted after):

```
API_BASE_URL=… HEALTH_URL=… node --test --test-name-pattern='Startup aborta' tests/api/api.test.js
→ fail 3/13: JWT_SECRET ausente, DATABASE_URL ausente, CORS_ORIGINS ausente (production)
  each: expected status 1, actual null — the child LISTENED and was killed by the 8s timeout
```

Suite green therefore depends on `backend/.env` not existing — the tests verify nothing about an absent variable in a real developer checkout. API behaviour itself is correct (probe proves real abort without `.env`); the isolation defect is in the test. Secondary issue: `runStartup` hardcodes `PORT: '39999'` — concurrent suites on one host can collide.

**Required change:** spawn startup probes with a `cwd` that has no `.env` (temp dir) while keeping normal dotenv loading for production code; avoid fixed ports.

### C3 — `Vary: Origin` only on the allowed branch (observation, minor)

`cors.middleware.js` sets `Vary` only after the allowlist check. Denied (403) and no-`Origin` responses return no `Vary: Origin`, so shared caches can't distinguish per-origin variants. No auth-bypass implication — confirmed by suite. Suggest emitting `Vary: Origin` (merged with any existing value, no duplication) on all branches.

## Risks / limits

- JWT non-7d runtime claim verification and per-branch `Vary` HTTP probes were executed against the successor commit `4b1cc2d` (see `be-03-review-4b1cc2d.md`); suite-level 7d assertions passed here.
- `runStartup` fixed port 39999 can flake under concurrent suites (noted, not reproduced).
- The 3s `docker info` availability probe can produce readable false negatives on a loaded host (observed once; retry passed).

## Per-criterion verdict (#11)

| Criterion | Status on `2bcbc0e` |
|---|---|
| Config validated before listen; invalid aborts w/o port/DB | PASS (37-case probe) |
| JWT_SECRET required/≥32/no-placeholder, no fallback, no leak | PASS |
| JWT_EXPIRES_IN syntax + overflow, default 7d, real claims | PASS (suite + unit probes) |
| DATABASE_URL syntax validation, no credential leak | PASS |
| PORT/NODE_ENV validation | PASS |
| CORS allowlist normalization, prod-required, wildcards/null/path/query/creds rejected | PASS enforcement / **FAIL secrecy (C1)** |
| CORS runtime: reflect+Vary, preflight, 403 denied no-ACAO, no-Origin→auth | PASS (minor C3 gap) |
| Prisma CLI free of JWT/prod-CORS | PASS |
| `npm test` + `test:migrations` isolated, canonical SQL intact | PASS runtime / **FAIL test isolation (C2)** |
| Docs coherent with implementation | PASS (README/API_CONTRACT/.env.example match code) |

**Conclusion:** `2bcbc0e` correctly implements the BE-03 behaviour at runtime but ships a credential-leak in config errors (C1) and non-isolated negative tests (C2). CHANGES REQUESTED — corrections verified in the follow-up review `be-03-review-4b1cc2d.md`. No push/PR/merge/closure performed.
