# QA Review — BE-06 corrected candidate `84d5db6` (issue #14)

**Review type:** final revalidation of the builder's corrected BE-06 delivery.
**Verdict: TECHNICAL APPROVAL** — all four defects from `be-06-review-04644b3.md` (D1–D4, matching architecture corrections R1–R4) are verified resolved with executed evidence on the exact candidate tree. Full suite: **78/78**. Two editorial documentation inaccuracies remain (E1, E2 below) — precision fixes requested, not functional regressions; recommended for correction in the BE-05/#13 documentation consolidation rather than blocking this delivery.

## Scope and hashes

| Item | Value |
|---|---|
| Candidate | `84d5db6309bd0d725261e227fd8bfa050245ed93` ("fix(docker): resolver D1-D4 con client query_timeout, flujos unificados y encoding") on `a35f0fd5b379d1a855631e241bff811cf34a7645` on `04644b3` |
| QA workspace | Cherry-picked `a35f0fd` + `84d5db6` onto report commit `5614165` → local `aed1bfc`+`cfd52d8`; `git diff 84d5db6 HEAD` = **only the prior QA report** — file equality with candidate verified |
| Diff `04644b3..84d5db6` | `compose.yaml`, `.env.example`, `README.md`, `docs/{API_CONTRACT,BACKEND_PLAN,DEPLOYMENT}.md`, `src/config/prisma.js` — all under `backend/` |
| Protected paths | `frontend/`, `data/`, `qa/` → **0 changes**. `prisma/schema.prisma` + `prisma/migrations/` unchanged (F0–F11 matrix not re-run) |
| Env | Node v24.21.0, npm 11.19.0, Docker 29.10.0, Compose v5.5.1; QA projects `qabe06v2`/`qabe06v3` (ports 55434/35001, 56434/36001), standalone net `qabe06net`, image `uf-qa-be06:84d5db6` rebuilt from candidate tree |

## Defect revalidation

### D1 — RESOLVED. Compose no longer invents secrets; absent env aborts startup

`env -u JWT_SECRET -u CORS_ORIGINS -u DOCKER_DATABASE_URL NODE_ENV=production docker compose --env-file /dev/null config` renders `JWT_SECRET:""`, `CORS_ORIGINS:""`, `DATABASE_URL:""` — empty, no defaults injected.
Real startup (`qabe06v2`): `up -d db` alone starts healthy **without requiring JWT**; `up -d api` aborts in a restart loop logging `DATABASE_URL no configurada`, `JWT_SECRET no configurada`, `CORS_ORIGINS requerida en producción` — all three missing-var errors, zero invented values. D1 fixed.

### D2 — RESOLVED. Reserved-character password connects end-to-end

Fixture `.env` with quoted values (as `.env.example`): `POSTGRES_PASSWORD="probe@secret#/"` (raw to the server), `DOCKER_DATABASE_URL="postgresql://urbanfix:probe%40secret%23%2F@db:5432/urbanfix_db?schema=public"` (RFC 3986 percent-encoded). Executed documented flow on `qabe06v3`: `up -d db` healthy → `run --rm api npm run db:precheck` → `CLEAN_DATABASE` (destination printed masked `urbanfix:***@db`) → `db:migrate` applied 3 canonical migrations → re-run `No pending migrations to apply` → `up -d api` → `/health` 200 (21ms), `/ready` 200 (228ms), `Usuario` count **0** → `restart api` → `/ready` 200, still **0 users**. Explicit `db:seed` → 3 users, login 200. The pg driver decodes credentials correctly — real authentication against a reserved-char password works.

### D3 — RESOLVED. Documented standalone flow executes verbatim

Following DEPLOYMENT.md §5 with own names/ports (`qabe06net`, `qabe06-vol`, `qabe06-pg`, `qabe06-api2`, tag `uf-qa-be06:84d5db6`): dedicated network + volume → PG on the network → `precheck` `CLEAN_DATABASE` → `migrate deploy` applied → API container on same network → `/health` 200, `/ready` 200. Rollback §5.1 (`docker stop && docker rm`, then `docker run` same name) → `/ready` 200. No more host-network/bridge mismatch or name conflicts.

### D4 — RESOLVED. Client-side `query_timeout` bounds the warm-pool blackhole

`src/config/prisma.js`: `connectionTimeoutMillis: 4000`, `query_timeout: 4000` (node-postgres client-side), `statement_timeout: 4000`. Measured on `qabe06v3` (migrated DB, API warm):

| Probe | Result |
|---|---|
| Warm pool: 3× `/ready` | 200 in ~6ms |
| `docker pause db`, 3× sequential `/ready` | **503 in 4.005s, 4.010s, 4.012s** — generic `{"status":"unavailable","message":"Base de datos no disponible"}` |
| Same pause, 4× concurrent `/ready` (in-flight 2s before health probe) | all **503 in ~4.005–4.007s** |
| `/health` during pause | 200 in ~2–6ms |
| `docker unpause db` | `/ready` **200 in 7–42ms**, no API restart; no hung queries observed — each probe returned independently, pool recovered |
| `docker stop db` (refused) | `/ready` 503 in ~5–6ms; `start db` → 200 in 65ms without restart |

Matches builder's reported 4019ms. **D4 fixed in all tested scenarios** (frozen PG over established socket, refused connect, cold recovery).

## Executed checks summary

- `npm test` on corrected tree: **78/78 pass**, ephemeral PG reaped.
- Fresh image build `uf-qa-be06:84d5db6` from candidate tree: `User=node`, `Cmd=["node","src/index.js"]`.
- CORS on production stack: allowed origin 200 + ACAO/Vary; denied 403 `CORS_ORIGIN_DENIED`; preflight allowed 204.
- 503 bodies remain generic; precheck masks passwords; no secrets in logs.

## Editorial notes (non-blocking, for BE-05/#13 consolidation)

- **E1:** DEPLOYMENT.md §3 states `docker run --env-file` *and* Docker Compose both preserve quotes around values. Verified on `84d5db6`: `docker compose --env-file .env.example config` **strips** quotes (values render unquoted), while `docker run --env-file` does not. The warning is correct for the Docker CLI path but over-broad for Compose.
- **E2:** Docs claim "respuesta 503 determinista en <= 4s" / "SLA <= 5s garantizado". Timeouts are 4s *per phase* (connect and query independently), and measured end-to-end latency was 4.005–4.012s plus HTTP margin — so `<= 4s` end-to-end is slightly overclaimed; `<= 5s` held in every tested scenario but cannot be a universal guarantee (e.g. a stall requiring a fresh connect *and* a query). Recommend wording bounded to tested scenarios / per-phase timeouts.

## Per-criterion verdict (issue #14)

| Criterion | Verdict |
|---|---|
| Imagen reproducible + arranque con PostgreSQL temporal y migraciones reparadas | **PASS** |
| Seed explícito dev/demo, no en inicio productivo | **PASS** (0 users post-boot and post-restart; seed only explicit) |
| Compose local versionado + procedimiento documentado | **PASS** (defaults removed, DOCKER_DATABASE_URL documented with encoding, full flow executed) |
| Health/readiness diferenciados; readiness detecta base inaccesible sin revelar datos | **PASS** (refused + paused + unmigrated all bounded generic 503; liveness independent) |
| Logs, puertos/config y CORS sin editar frontend | **PASS** |
| Documentar pasos y variables para hosting; sin publicación | **PASS** (D3 flow verified verbatim; E1/E2 wording only; nothing published) |

## Resources created and cleaned

- `qabe06v2` (env-absent abort check) and `qabe06v3` (reserved-password stack): `down -v` — containers, volumes, networks removed.
- Standalone: `qabe06-api2`, `qabe06-pg`, network `qabe06net`, volume `qabe06-vol` removed.
- Images `uf-qa-be06:84d5db6`, `qabe06v3-api`, `qabe06v2-api`, plus `qabe06r2-api` leftover from the previous round — all `docker rmi`'d. `/tmp/qa-be06v2` fixture deleted.
- `git status` clean except this report. No push, PR, merge, deploy or issue closure performed.

**Conclusion:** `84d5db6` resolves D1–D4 verifiably; issue #14 criteria are satisfied on the validated tree (78/78, secure compose env, working documented flows, bounded readiness). E1/E2 are wording precision items for the BE-05 documentation pass.
