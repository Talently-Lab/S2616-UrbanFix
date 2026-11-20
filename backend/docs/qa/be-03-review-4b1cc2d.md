# QA Review — BE-03 corrected candidate `4b1cc2d` (issue #11)

**Review type:** revalidation of the builder's second BE-03 version. **Verdict: TECHNICAL APPROVAL** — all three defects returned on `2bcbc0e` (C1 credential leak in CORS config errors, C2 non-isolated negative startup tests, C3 missing `Vary: Origin` on two branches) verified resolved at runtime, with stronger independent probes than the shipped tests. Full suite: **59/59** (builder's count confirmed). Preceded by `be-03-review-2bcbc0e.md` (CHANGES REQUESTED).

## Scope and hashes

| Item | Value |
|---|---|
| Candidate | `4b1cc2d2d06599be9101341345d366ba980a466e` ("fix(config): sanear errores CORS, aislar sondas dotenv y fijar Vary en middleware (BE-03)") on top of `2bcbc0e` (base `ce44c1c`) |
| Diff scope | backend-only, 3 files (+164/−34): `src/config/env.js`, `src/middlewares/cors.middleware.js`, `tests/api/api.test.js`. `frontend/`, `data/`, `qa/` untouched; `prisma/` byte-identical to base (canonical SQL intact — verified `git diff ce44c1c..4b1cc2d -- prisma/` = empty) |
| Env | Node v24.21.0, npm 11.19.0, Docker `postgres:16-alpine`; ephemeral Docker DB for `npm test`; exclusive QA lab container `uf-be11-qa-lab` @127.0.0.1:38995 (created + removed by QA) for `test:migrations` and runtime probes; `backend/.env` sentinel fixture created/deleted by QA only |

## Fix verification — each prior defect re-tested live

| Defect | Fix | Executed verification | Result |
|---|---|---|---|
| **C1** `ConfigError` interpolated raw `CORS_ORIGINS`/`NODE_ENV` values → credentials/query/fragment in logs | Positional messages (`entrada N` + violated rule); `NODE_ENV` value no longer echoed | 6 new marker cases added to QA probe matrix (`probe_user`/`probe_password`, `query_marker`, `frag_marker`, broken-URL marker, `NODE_ENV` marker, 2nd-entry creds) → startup `spawnSync`, stdout+stderr scanned | **RESOLVED** — 43/43 probe cases pass; e.g. stderr now: `entrada 1 no debe incluir credenciales.` (no marker) |
| **C2** `runStartup` used `cwd: backendRoot` → `dotenv` restored "absent" vars from a real `backend/.env` | `runStartup` spawns from `fs.mkdtempSync` dir (no `.env`) + absolute entrypoint; temp dir removed in `finally` | Same repro that produced 3 failures on `2bcbc0e`: created sentinel `backend/.env` → `node --test --test-name-pattern='Startup aborta'` → **13/13 pass** | **RESOLVED** — negative tests now prove real absence |
| **C3** `Vary: Origin` only on allowed branch | `res.vary('Origin')` unconditionally at middleware top (Express merge, dedup) + manual-merge fallback | Runtime probes: no-Origin `/health`, allowed origin, denied origin, denied preflight, `Origin: null` → all carry `Vary: Origin`; `vary="Origin"` single-valued | **RESOLVED** — all branches covered, no duplication |

## Additional executed checks (4b1cc2d)

- **`npm ci`** — clean reinstall reused from prior run on this tree (lockfile unchanged between `2bcbc0e`→`4b1cc2d`); `npm test` passes.
- **`npm test` (Docker auto)** — **59/59** pass, exit 0, ephemeral `uf-test-pg-*` container + API reaped, no orphans, no leaked `testpass_*` secrets in output.
- **`test:migrations` on exclusive lab server** — F0–F11 all pass; QA sentinel DB survived; every `uf_*` test DB dropped.
- **Startup matrix** (`/tmp/uf-qa-be11/probe-startup.mjs`, 41 negative + 2 positive): every invalid `JWT_SECRET`/`DATABASE_URL`/`PORT`/`NODE_ENV`/`JWT_EXPIRES_IN`/`CORS_ORIGINS` aborts with exit 1 naming the variable, **before** opening the port (status 1, never `null`/listened); multi-error aggregation reports all missing vars; valid env and `JWT_EXPIRES_IN=15m` listen normally.
- **dotenv semantics preserved** (`/tmp/uf-qa-be11/probe-runtime.mjs`, cwd = fixture dir with sentinel `.env`, lab DB `uf_qa_runtime`): absent `JWT_SECRET` is restored from `.env` → API listens and signs with the file's secret; explicit env wins over `.env` for `JWT_SECRET` (token verifies with env secret B, not sentinel A), `DATABASE_URL` (login succeeds against env's lab URL vs `.env`'s dead URL), `CORS_ORIGINS` (env allowlist enforced, `.env` origin denied) and `JWT_EXPIRES_IN` (env `15m` beats `.env` `30s`).
- **JWT claims at runtime**: login **and** register tokens carry `exp-iat = 900` with `JWT_EXPIRES_IN=15m` (non-default proven); default `7d`=604800 asserted by suite; expired token → **401 in 7ms** (no sleeps).
- **CORS runtime**: allowed origin reflected + `Vary`; preflight 204 with `Authorization`/`Content-Type` + methods + `Vary`; denied/`null` → 403 `CORS_ORIGIN_DENIED` without ACAO; no-`Origin` request to protected route → **401** (CORS pass-through is not authorization).
- **Prisma CLI independence**: `prisma validate`, `generate`, `db:precheck`, `migrate deploy`, `seed` all run with `JWT_SECRET`/`CORS_ORIGINS`/`NODE_ENV` unset — none require JWT or production CORS.
- **Test isolation**: 0 leftover `uf-startup-isolated-*`/`uf-sentinel-*` temp dirs after suite; no stray `node src/index.js`; harness injects test config and never falls back to `DATABASE_URL`.

## Shipped-test quality notes (non-blocking)

- The new C2 test "variables ausentes no heredan .env" creates a sentinel `.env` fixture but never uses it as `cwd` — it re-proves the isolation mechanism rather than fixture consumption. The sibling test does use `cwd: fixtureDir` but aborts on `PORT`, so it can't itself prove `DATABASE_URL` precedence. QA's independent probes above cover both gaps directly, so the verification is solid, but the shipped tests are weaker than they look.
- `runStartup` still hardcodes `PORT: '39999'` — a concurrent suite on the same host can flake the positive/aborted-startup paths (not reproduced; transient risk only).
- The 3s `docker info` availability probe produced one readable false-negative on this loaded host during the `2bcbc0e` run (retry passed in 0.49s). Cosmetic env flake, not a product defect.

## Per-criterion verdict (#11)

| Criterion | Status on `4b1cc2d` |
|---|---|
| Config validated before listen; invalid aborts w/o port/DB | PASS (43-case probe) |
| JWT_SECRET required/≥32/no-placeholder, no fallback, no leak | PASS |
| JWT_EXPIRES_IN syntax + overflow, default 7d, real claims | PASS (runtime 15m + suite 7d) |
| DATABASE_URL syntax validation, no credential leak | PASS |
| PORT/NODE_ENV validation | PASS |
| CORS allowlist: normalize, prod-required, reject `*`/`null`/path/query/creds | PASS — **no leak (C1 resolved)** |
| CORS runtime: reflect+`Vary` all branches, preflight, 403 no-ACAO, no-Origin→auth | **PASS (C3 resolved)** |
| Prisma CLI free of JWT/prod-CORS | PASS |
| `npm test` + `test:migrations` isolated, canonical SQL intact | **PASS (C2 resolved)** — 59/59 + F0–F11 |
| Docs coherent with implementation | PASS |

## Resources created and cleaned

- `uf-be11-qa-lab` container + `uf_qa_runtime` DB + `/tmp/uf-qa-be11/` probes + `backend/.env` sentinel fixture — all removed post-review (verified `docker ps`, `pgrep`, `/tmp` globs clean).
- No push, PR, merge, deploy or issue closure performed — pending explicit user approval per AGENTS.md.

**Conclusion:** `4b1cc2d` satisfies issue #11 technically: environment is validated before listening with no secret leakage, JWT has no fallback and honours configurable real expirations, CORS enforces a normalized allowlist with coherent `Vary`, tests are isolated from user `.env`, and the 31 prior integration cases plus migration matrix show no regression.
