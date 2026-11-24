# QA Review — BE-06 candidate `04644b3` (issue #14)

**Review type:** first independent validation of the builder's BE-06 delivery (Docker artifact, compose, readiness probe, deployment docs).
**Verdict: NOT APPROVED — 4 defects returned to builder** (D1–D4; these match the architecture corrections R1–R4 already dispatched). Core deliverables verified working: non-root image with API-only CMD, no auto-migrate/seed, differentiated liveness/readiness, bounded refused-connection failures, sanitized 503s, explicit precheck/migrate/seed path, 78/78 tests.

## Scope and hashes

| Item | Value |
|---|---|
| Candidate | `04644b3a9dded1d5b66bb8bdda950dfd33f473c2` ("feat(docker): preparar artefacto operativo, compose local y readiness probe (BE-06)") on base `7639023` |
| QA workspace | Exact checkout at `04644b3`; `git status` clean at review start |
| Diff scope `7639023..04644b3` | 13 files, all under `backend/` (+794/−31): `Dockerfile`, `compose.yaml`, `.dockerignore`, `.env.example`, `README.md`, `docs/{API_CONTRACT,BACKEND_PLAN,DEPLOYMENT}.md`, `src/index.js`, `src/config/prisma.js`, `tests/api/{api.test.js,harness.js,runner.js}` |
| Protected paths | `git diff --name-only 7639023..04644b3 -- frontend data qa` → **0 files**. `prisma/schema.prisma` and `prisma/migrations/` **unchanged** → F0–F11 migration matrix not re-run (SQL identical), per dispatch |
| Env | Node v24.21.0, npm 11.19.0, Docker 29.10.0, Compose v5.5.1; QA-owned compose projects `qabe06`, `qabe06r2` on ports 55434/35001 and 56434/36001; image tags `uf-qa-be06:04644b3`, `qabe06-api` (all removed after review) |

## Executed evidence

### 1. Install + suite

| Command | Expected | Real |
|---|---|---|
| `npm ci` | Clean lockfile install | Exit 0 (11 pre-existing audit advisories; `install-scripts` warning for prisma engines — harness regenerates client itself) |
| `npm test` | 78 tests pass | **78/78 pass**, 0 fail, 30.3s; ephemeral `uf-test-pg-dd25481eff` created and reaped; teardown reported no orphans |

Suite covers liveness/readiness, readiness-503 on unmigrated schema, ≤5s on refused PG, startup-abort matrix, CORS, auth, isolation, BE-04 concurrency — all green.

### 2. Image build + inspection

`docker build -t uf-qa-be06:04644b3 backend/` → success (layers cached on re-run).

| Check | Real |
|---|---|
| `Config.User` / `id` | `node` / `uid=1000(node) gid=1000` — non-root ✓ |
| `Config.Cmd` | `["node","src/index.js"]` only — no migrate/seed chain ✓ |
| `Config.Env` | PATH, NODE_VERSION, YARN_VERSION only — no baked secrets ✓ |
| Filesystem | `find / -xdev -name '.env*'` → nothing except `.env.example` absent too (dockerignore excludes `.env*`); no logs ✓ |
| Operational CLI files | `prisma/{schema,migrations,seed.js}`, `prisma.config.js`, `tests/migrations/{migration-precheck.js,schemas/}` present; `tests/api/` excluded ✓ |

Note (editorial): docs claim "reproducibilidad bit a bit" — `node:24-bookworm-slim` is a mutable tag and `apt-get install openssl` is unpinned; `npm ci` also installs devDependencies (nodemon ships in the image). Deterministic *dependency* install yes; bit-for-bit no. Not a functional defect.

### 3. Isolated compose lifecycle (project `qabe06`, own ports/volume/network)

Started with `env -u JWT_SECRET -u CORS_ORIGINS NODE_ENV=production POSTGRES_PORT=55434 PORT=35001 docker compose -p qabe06 …` (absent env deliberate — see D1).

| Step | Expected | Real |
|---|---|---|
| `up -d db` | Healthy PG, empty schema | healthy; `information_schema.tables` in `public` = **0** |
| `up -d api` (no DDL yet) | API starts, no DDL | log `Server running on port 35001`; tables still **0** — no DDL created by startup |
| `GET /health` | 200 | `{"status":"ok"}` 200 in 5ms |
| `GET /ready` (schema not ready) | 503 generic | `{"status":"unavailable","message":"Esquema de base de datos no preparado"}` 503 in 8ms — no host/credential/SQL leak |
| `run --rm api npm run db:precheck` | CLEAN_DATABASE | `CLEAN_DATABASE`, destination printed with masked password `urbanfix:***@db` |
| `run --rm api npm run db:migrate` | 3 canonical migrations | `20261007000000_init`, `…_add_last_login_to_usuario`, `…_rechazo_vuelve_a_pendiente` applied |
| `db:migrate` again | Idempotent | `No pending migrations to apply` |
| `/ready` after migrate, 0 rows | 200 (absence of rows valid) | `{"status":"ready"}` 200 in 34ms; `SELECT count(*) FROM "Usuario"` = **0** |
| `compose restart api` | Still 0 users, no auto-seed | `/ready` 200; `Usuario`=0, `SolicitudServicio`=0 — **no seed on restart** |
| `run --rm api npm run db:seed` (explicit lab op) | Demo users created | 3 users: `admin@` ADMIN, `carlos@` TECNICO, `juan@` CLIENTE |
| Login smoke ×3 roles | 200 + token | all three `POST /api/auth/login` → 200 with token |

### 4. CORS + config abort (running stack, NODE_ENV=production)

| Probe | Real |
|---|---|
| `GET /health` Origin `http://localhost:5173` | 200, `Access-Control-Allow-Origin: http://localhost:5173`, `Vary: Origin` |
| `GET /health` Origin `https://evil.example.com` | 403 `CORS_ORIGIN_DENIED` |
| `OPTIONS /api/solicitudes` allowed origin | 204 + allow-methods/headers + `Vary: Origin` |
| `OPTIONS /api/solicitudes` denied origin | 403 `CORS_ORIGIN_DENIED` |
| `docker run` image, NODE_ENV=production, no JWT_SECRET/CORS_ORIGINS | **exit 1**, both errors listed, no values echoed |
| same, `JWT_SECRET` = exact `.env.example` placeholder | exit 1, placeholder rejected |

### 5. Outage, recovery, and the blackhole probe

| Probe | Real |
|---|---|
| `compose stop db` → `/ready` | 503 `Base de datos no disponible` in **57ms** (bounded; refused path) |
| same → `/health` | 200 in 4ms (liveness independent) |
| `compose start db` → `/ready` | **200 without API restart** — pool recovery confirmed |
| Warm pool (5× `/ready` 200 ~5–10ms), then `docker pause db` (SIGSTOP → network blackhole) | **`/ready` hung >20s — killed by external `curl --max-time 20`; the API never returned** (see D4). `/health` stayed 200 during pause; `unpause` → `/ready` 200 in 7ms |

## Defects

### D1 — compose injects a public JWT secret and localhost CORS defaults; production obligatoriedad (#11) bypassed — **functional defect**

`env -u JWT_SECRET -u CORS_ORIGINS NODE_ENV=production docker compose --env-file /dev/null config` yields:
`JWT_SECRET=reemplazar-por-un-secreto-propio-aleatorio-32-chars-min`, `CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173`. The injected secret is 51 chars, differs from the rejected placeholder, so `validateJwtSecret` accepts it — and CORS validation sees an explicit (localhost) allowlist, so the production-required CORS check never fires. **Real startup confirmed:** the API booted in production with both variables absent from the operator environment (`Server running on port 35001`). Anyone reading this repository knows the exact signing key of any deployment that forgets to set it — the #11 "no fallback secrets / explicit operator config" guarantee is void at the compose layer, and production CORS silently permits only dev origins. Fix direction: remove the insecure defaults from `compose.yaml` (fail-closed) or make them dev-only.

### D2 — `POSTGRES_PASSWORD` with reserved characters silently corrupts the interpolated `DATABASE_URL` — **functional defect**

With `POSTGRES_PASSWORD=probe@secret#/`, `compose config` renders `DATABASE_URL=postgresql://urbanfix:probe@secret#/@db:5432/urbanfix_db?schema=public` — the `#` starts a fragment, so the URL decodes to user `urbanfix`, password `probe`, host `secret`, no db name. Real run (`qabe06r2`): the API aborts with `DATABASE_URL sintácticamente inválida: nombre de base de datos ausente` (explicit failure, no invented Postgres encoding — good), but the root cause is invisible to the operator and the container restart-loops forever. Passwords containing `@`, `#`, `/`, `:` etc. are legitimate Postgres credentials; `compose.yaml` neither percent-encodes nor validates/documents the restriction.

### D3 — DEPLOYMENT.md documented flow does not work as written — **documentation defect**

Executed the documented path verbatim against the QA stack (own image tag/names/ports only):

1. `docker run --rm --network host --env-file .env … npm run db:precheck` with a `.env` copied from `.env.example` (quoted values) → `Error ejecutando pre-check: URL de conexión inválida: Invalid URL`. `--env-file` does not strip quotes like dotenv does; only an *unquoted* env file works (then precheck correctly reported `CANONICAL_FULLY_UPDATED`). Doc never warns.
2. Step-3 `docker run -d -p 3001:3001 --env-file .env <image>` (no `--network host`) leaves the API on the bridge with `DATABASE_URL=…@localhost:…` → `localhost` resolves to the container itself → `/ready` **503 permanently** (`Base de datos no disponible`). The doc mixes host-network prepare steps with a bridge-mode API run without stating the different URL/host requirements.
3. Rollback §7.2 `docker stop urbanfix-api` + `docker run -d --name urbanfix-api …` → `Conflict. The container name … is already in use` — missing `docker rm`.
4. The flow never shows `docker build -t urbanfix-backend …` nor how JWT/CORS env reach the container for the production path.

### D4 — `/ready` hangs indefinitely on a stalled/blackholed PostgreSQL over an established connection — **functional gap vs documented ≤5s guarantee**

`connectionTimeoutMillis: 5000` bounds only *new* connection establishment; `statement_timeout: 5000` is **server-side** and cannot fire while PG is frozen or the network drops packets; `node-postgres` `query_timeout` is not set and there is no client-side bound. Measured: warm pool + `docker pause` → `/ready` still pending at 20s (external kill). Refused-connect paths remain fast (57ms) and `/health` keeps working, so a probe with its own timeout still effectively sees "not ready" — but the documented claim "la llamada aborta en <= 5 segundos / sin consultas colgadas en segundo plano" is false for stalls on live sockets, and each hung `/ready` holds a pool connection that accumulates under repeated probes. Fix direction: a real client-side query/socket timeout (e.g. pg `query_timeout`/`keepAlive`+bound, or a bounded race that releases the client) or docs corrected to state the bound only covers connect-refused.

## R4 documentation-accuracy notes (editorial, non-blocking)

- `/ready` verifies **existence of 4 table names only** — a `db push`ed or drifted schema still reports `ready`. Acceptable for the "readiness" criterion, but "verificación real de esquema" should be read as shallow.
- "Reproducibilidad bit a bit" is false (mutable base tag, unpinned apt, devDeps shipped); dependency versions are locked, not the image bits.
- Verified accurate claims: 503 bodies are strictly generic (no host, credential, SQL, or error detail leaked); single shared `PrismaClient` (no per-request instances); `/health` never touches the DB; recovery without restart works.

## Per-criterion verdict (issue #14)

| Criterion | Verdict |
|---|---|
| Imagen reproducible + arranque con PostgreSQL temporal y migraciones reparadas | **PASS** (build, boot, precheck→migrate→/ready all executed; "bit a bit" wording aside) |
| Seed explícito dev/demo, no en inicio productivo | **PASS** (0 users after boot and after restart; seed only via explicit command) |
| Compose local versionado + procedimiento documentado | **FAIL** — compose works for the happy path but D1 (insecure injected defaults), D2 (password charset) and D3 (broken doc steps) require changes |
| Health/readiness diferenciados; readiness detecta base inaccesible sin revelar datos | **PARTIAL** — refused/unmigrated cases pass with sanitized 503 and liveness intact; D4 breaks the documented timeout bound on stalls |
| Probar logs, puertos/config y CORS sin editar frontend | **PASS** (CORS matrix + config abort executed; logs sanitized — precheck masks the password) |
| Documentar pasos y variables para hosting; sin publicación | **PARTIAL** — DEPLOYMENT.md exists but D3 steps fail; nothing published (correct) |

## Resources created and cleaned

- Compose projects `qabe06` (db+api, ports 55434/35001, volume `qabe06_db-data`) and `qabe06r2` (ports 56434/36001): `down -v` executed — containers, volumes, networks gone.
- `docker rm -f qabe06-docapi` (R3 probe container). Images `uf-qa-be06:04644b3` and `qabe06-api` removed with `docker rmi`. `/tmp/qa-be06/` env files deleted (contained only lab credentials).
- Ephemeral `uf-test-pg-*` reaped by the harness. `git status` shows only this report. No push, PR, merge, deploy or issue closure performed.

**Conclusion:** the candidate delivers the core BE-06 behavior correctly, but D1–D4 are reproducible and match the architecture corrections R1–R4; the delivery returns to the builder. Any new candidate hash will be revalidated separately.
