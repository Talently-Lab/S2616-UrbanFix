# QA Review — BE-04 corrected candidate `4a1afab` (issue #12)

**Review type:** final revalidation of the builder's corrected BE-04 delivery. **Verdict: TECHNICAL APPROVAL** — defect D1 from `be-04-review-f7f9d17.md` (missing `DATABASE_URL` guard → libpq/default fallback) is verified resolved with stronger independent probes than the shipped regression test. Full suite: **71/71** (builder's count confirmed). Production code unchanged from the already-verified `f7f9d17` — prior evidence (red baseline 6/11, green fix, serial-equivalent history, `pg_stat_activity` lock-window proof) stands and was not re-run per dispatch scope.

## Scope and hashes

| Item | Value |
|---|---|
| Candidate | `4a1afab150b649a1cee177feb47ce667e43bb526` ("test(concurrency): exigir DATABASE_URL explicita en arranque y evitar fallback libpq (BE-04)") on top of `f7f9d17` |
| Application | Cherry-picked into QA worktree (`83300ce`); `git diff 4a1afab HEAD` = only prior QA report — file equality with candidate verified |
| Diff scope | Exactly 2 test files (+90/−5): `tests/api/concurrency.test.js` (guard), `tests/api/api.test.js` (D1 regression). Production `src/`, `prisma/`, `runner.js`, `package*.json` **unchanged**; `frontend/`, `data/`, `qa/` untouched |
| Env | Node v24.21.0, npm 11.19.0, Docker 29.10.0 `postgres:16-alpine` (ephemeral auto mode for `npm test`); QA sentinel process `/tmp/uf-qa-d1/sentinel.mjs` (TCP+HTTP logging listeners, created + removed by QA) |

## D1 fix verification

**Code guard** (`concurrency.test.js` top-level, before any client/test registration): requires `API_BASE_URL`, `HEALTH_URL`, `DATABASE_URL` to be strings that are non-empty after `trim()`; on failure prints a static message naming the three variables (no values echoed) and `process.exit(1)`.

**Independent probes** (sentinel in a *separate process* logging every TCP connection and HTTP request to a file — immune to the event-loop blocking flaw noted below). Each case ran `node tests/api/concurrency.test.js` directly with `PGHOST/PGPORT/PGUSER/PGDATABASE` → sentinel TCP listener and `API_BASE_URL`/`HEALTH_URL` → sentinel HTTP listener (except the API/HEALTH-deficient cases, where `DATABASE_URL` pointed at the sentinel):

| Case | Exit | stderr | Sentinel contacts |
|---|---|---|---|
| `DATABASE_URL` unset | **1** (real status, not timeout/null) | guard message, names `DATABASE_URL` | 0 |
| `DATABASE_URL=''` (empty) | 1 | same | 0 |
| `DATABASE_URL='   \t\n '` (whitespace) | 1 | same | 0 |
| `API_BASE_URL` unset | 1 | same | 0 |
| `HEALTH_URL` whitespace-only | 1 | same | 0 |

Zero contacts across all five runs; no env values, credentials, or sentinel identifiers in stderr. **D1 RESOLVED.**

**Valid path preserved**: `npm test` (ephemeral Docker `uf-test-pg-9254788a89`, migrations + seed, exit 0) = **71/71 pass** — the guard does not break the sanctioned harness path; new D1 regression test passes inside it.

## Shipped-test quality note (non-blocking limitation)

The shipped D1 regression test creates its TCP/HTTP sentinels **in the same process** and then calls `spawnSync`. While `spawnSync` blocks the parent event loop, the parent's `connection`/`request` callbacks cannot run, so `tcpConnections === 0` / `httpRequests === 0` is not by itself reliable proof of zero contact (a completed-then-reset backlog connection may never be delivered). Additionally `assert.notEqual(res.status, 0)` would accept a `null` status from a timeout. These are weaknesses of the *regression test's* assertions, not of the fix: the guard executes at module top-level before any socket code, and my external-process sentinels observed genuinely zero contact with real exit-1 statuses. Not a blocker; documented for honesty per dispatch.

## Per-criterion verdict (#12)

All product criteria remain PASS from the `f7f9d17` review (serialization under `FOR UPDATE`, revalidated authz, single-winner transitions, coherent history, 403/409 semantics, no leaked locks). The single open item — *"test file requires its own env, no fallback to shared/default DB"* — is now **PASS** (D1 resolved). Issue #12 criteria: all satisfied.

## Resources created and cleaned

- `/tmp/uf-qa-d1/` sentinel process + logs — removed (verified `pgrep`, `ls`). Ephemeral `uf-test-pg-*` container reaped by harness. No other resources; `git status` clean except this report.
- No push, PR, merge, deploy or issue closure performed — pending explicit user approval per AGENTS.md.

**Conclusion:** `4a1afab` resolves D1 correctly and verifiably; combined with the previously verified production changes on `f7f9d17`, issue #12 is technically satisfied (71/71, red-baseline defects fixed, isolation enforced end-to-end).
