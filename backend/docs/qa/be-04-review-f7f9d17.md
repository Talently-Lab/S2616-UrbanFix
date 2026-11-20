# QA Review — BE-04 candidate `f7f9d17` (issue #12)

**Review type:** independent revalidation of the builder's BE-04 delivery (row-lock serialization of state transitions + 11-case concurrency suite). **Verdict: CHANGES REQUESTED** — the production fix is technically correct and fully verified (red baseline reproduced, green fix verified, invariants hold), but one reproduced defect was found in the delivered test file: `concurrency.test.js` does not validate `DATABASE_URL` and silently falls back to libpq/PG defaults, breaking lab isolation when run standalone. See D1.

## Scope and hashes

| Item | Value |
|---|---|
| Candidate | `f7f9d1729bad7ac6aebd343df66153ea93ebe868` ("fix(solicitudes): garantizar atomicidad, transiciones seriales y bloqueo de fila (BE-04)") on top of baseline `9dd0a79` |
| Diff scope | backend-only, exactly 5 files (+773/−55): `src/services/solicitud.service.js`, `src/controllers/solicitud.controller.js`, `tests/api/concurrency.test.js` (new), `tests/api/runner.js`, `docs/API_CONTRACT.md`. `prisma/` and `package*.json` **byte-identical** to baseline (`git diff 9dd0a79..f7f9d17 -- backend/prisma backend/package*.json` = empty). `frontend/`, `data/`, `qa/` untouched (`git status` clean) |
| Env | Node v24.21.0, npm 11.19.0, Docker 29.10.0 `postgres:16-alpine`. Candidate `npm test` ran in automatic ephemeral-Docker mode. Baseline reproduction and probes ran against exclusive QA lab container `uf-be12-qa-lab` @127.0.0.1:32768 (created + removed by QA) via `TEST_DATABASE_URL`. Baseline checkout at `/tmp/uf-qa-be12-baseline` (QA git worktree, removed after review). Probes in `/tmp/uf-qa-be12/` |

## Baseline reproduction (red) — candidate suite vs `9dd0a79` code

Command: `TEST_DATABASE_URL=<lab> node tests/api/runner.js tests/api/concurrency.test.js` in the `9dd0a79` worktree with the candidate's `concurrency.test.js` copied in verbatim (harness/runner/modules identical between hashes; only the test file and production code differ). Result: **11 tests, 5 pass, 6 fail** — failures attributed to baseline `9dd0a79`:

| Case | Observed on baseline | Defect reproduced |
|---|---|---|
| Caso 1 same-tech aceptar vs rechazar | `[200, 200]` | Tech both accepted AND rejected: incoherent (assignment + own rejection recorded) |
| Caso 3 double reject same tech | `[200, 500]` | Unhandled `P2002` unique-collision leaked as HTTP 500 (builder's claim confirmed) |
| Caso 5 double cancel | `[200, 200]` | Two cancellations committed (double history write) |
| Caso 6 cancel vs iniciar from ACEPTADA | `[200, 200]` | Both transitions won → branched history |
| Caso 8 double iniciar | `[200, 200]` | Double transition committed |
| Caso 8b double finalizar | `[200, 200]` | Double transition committed |

Caso 2, Caso 4, Caso 7 and Caso 8c passed on baseline — expected: they admit serially-legal orderings or are not race-dependent, and their outcome is timing-sensitive; this run happened to serialize legally.

## Green verification — candidate `f7f9d17`

- **`npm ci`**: clean (268 packages, no lockfile drift).
- **`npm test` (auto ephemeral Docker `uf-test-pg-a43b3f7143`)**: **70/70 pass, exit 0** — builder's count confirmed (59 prior + 11 new). Harness teardown left no orphan container/DB/API. (One transient `docker info` 3s false-negative on first run on this loaded host — same known flake recorded in `be-03-review-4b1cc2d.md`; retry passed.)
- **Race-window proof (independent probe `/tmp/uf-qa-be12/probe-lock-window.mjs`)**: external `SELECT ... FOR UPDATE` held on a solicitud row, then concurrent `aceptar` + `cancelar` fired. `pg_stat_activity` showed **2 backend transactions simultaneously waiting on Lock** before release (real concurrency, no reliance on sleeps). After COMMIT: `[200, 200]` — the legal ordering aceptar(PENDIENTE→ACEPTADA) then cancelar(ACEPTADA→CANCELADA); final state `CANCELADA` with `tecnicoId` retained and historial chain `null→PENDIENTE | PENDIENTE→ACEPTADA | ACEPTADA→CANCELADA`. No `idle in transaction` sessions afterwards — locks released cleanly on both success and failure paths.
- **Code review**: every mutating path (`updateSolicitud`, `aceptarSolicitud`, `rechazarSolicitud`, `cambiarEstado`) re-reads the row with parametrized `$queryRaw ... FOR UPDATE` inside `prisma.$transaction` and revalidates ownership/state/assignment under the lock; `estadoAnterior` in historial is the locked row's real prior state (serial-equivalent). `P2002` on `RechazoSolicitud` create → 409. All **3 public callers** of `cambiarEstado` (`iniciar`, `finalizar`, `cancelar`) supply `checkAuth` — no external bypass; the optional-callback signature is internal-API risk only, not exploitable today. `aceptarSolicitud` retains the atomic `updateMany` guard as defense-in-depth. Contract §8.1 documents each serialized ordering and matches implemented behavior (e.g., both-200 legal for accept-then-cancel; never resurrect CANCELADA).
- **Matrix coverage**: all dispatched cases are covered by shipped tests (same-tech accept/reject C1, other-tech reject vs accept C2, double reject C3, edit vs accept C4, double cancel C5, cancel vs iniciar C6, cancel vs accept C7, double iniciar/finalizar C8/8b, unassigned tech + terminal stability C8c, two-tech simultaneous acceptance by the pre-existing KAN-216 case, client isolation by the BE-02 suite). Assertions check status pairs **and** post-race state/tecnicoId/history coherence (deep-equal transition chains in C6; exactly-one-event counts in C3/C5/C8/8b; RECHAZO privacy for cliente preserved via pre-existing filter).
- **Not reproduced**: timestamp ordering anomalies — controller timestamps (`fechaInicio` etc.) are computed before lock acquisition; theoretical skew only, not reported as a defect per dispatch.

## Defects — CHANGES REQUESTED

**D1 — `concurrency.test.js` falls back to default PostgreSQL when `DATABASE_URL` is unset (test isolation breach, reproduced).** The file guards `API_BASE_URL`/`HEALTH_URL` (lines 10–13) but omits `DATABASE_URL`; `new Client({ connectionString: undefined })` then resolves libpq env/defaults (host `localhost`, port `5432`, `$USER`). Reproduced: ran `node --test tests/api/concurrency.test.js` with `API_BASE_URL`/`HEALTH_URL` set, `DATABASE_URL` unset, `PG*` pointed at a QA-owned sentinel → the suite **connected to the sentinel** and produced 9 failures (`relation "SolicitudServicio" does not exist`) instead of aborting pre-DB. On this very host a real postgres listens on `127.0.0.1:5432`; a standalone run without env would take `FOR UPDATE`/`SHARE MODE` locks on whatever DB answers — the same fallback the harness explicitly forbids (AGENTS.md isolation directive, runner refuses `DATABASE_URL` fallback). `npm test` is unaffected (runner always injects `DATABASE_URL`); the hole only exists on direct file execution, which the file's own guard implicitly supports. Required: add `DATABASE_URL` to the startup guard so the file aborts before any DB contact. Trivial fix in test code; no production change needed.

## Test-quality limitations (non-blocking)

- **Sleep-based race windows**: the 11 cases hold an external lock then release after `sleep(150ms)` without asserting both requests actually arrived. If a host were slow enough that requests serialize after commit, buggy code could pass green for cases whose sequential ordering is also legal (e.g. double-cancel yields `[200,409]` sequentially even unfixed). On this host the window demonstrably opens — proven red on baseline and via `pg_stat_activity` showing 2 simultaneous lock waiters on the candidate — so coverage is effective here; the missing arrival assertion is a portability limitation, not a reproduced false-green.
- `Caso 8b/8c` create solicitudes without asserting the 201; cosmetic.

## Per-criterion verdict (#12)

| Criterion | Status |
|---|---|
| Transitions serialized, equivalent to strict serial order (FOR UPDATE + in-tx revalidation) | PASS — code + probes |
| Double accept → exactly one winner (prior KAN-216) | PASS (regression suite) |
| Same-tech accept vs reject → one 200/one 409, no assign+reject | PASS (red on base, green on fix) |
| Double reject → one 200/one 409, zero 500, single history event | PASS (red `[200,500]` on base) |
| Other-tech reject vs accept → legal serial orderings only | PASS |
| Edit vs accept → edit only while PENDIENTE | PASS |
| Double cancel / cancel vs iniciar / double iniciar/finalizar → single winner, single event | PASS (red `[200,200]` on base) |
| Cancel vs accept from PENDIENTE → no resurrection of CANCELADA | PASS |
| Unassigned tech 403; terminal states stable 409 | PASS |
| History: real `estadoAnterior`, no events for failed ops, RECHAZO private for cliente | PASS (asserted by suite + probe) |
| Authz revalidated inside tx on all public mutation paths | PASS (all 3 `cambiarEstado` callers pass `checkAuth`) |
| No leaked locks/tx on failure paths | PASS (`pg_stat_activity` clean) |
| Schema/migrations/contract consistent | PASS (`prisma/` identical; §8.1 added) |
| `npm ci` + `npm test` = 70 in isolated lab | **PASS — 70/70** |
| Test file requires its own env, no fallback to shared/default DB | **FAIL — D1 reproduced** |

## Resources created and cleaned

- `uf-be12-qa-lab` container, DBs `uf_be12_probe`/`uf_be12_sentinel`, worktree `/tmp/uf-qa-be12-baseline`, probes `/tmp/uf-qa-be12/`, manual API on :37777 — all removed post-review (verified `docker ps`, `pgrep`, `git worktree list` clean).
- No push, PR, merge, deploy or issue closure performed — pending explicit user approval per AGENTS.md.

**Conclusion:** the BE-04 production change correctly serializes all solicitud mutations under row locks with in-transaction revalidation — every baseline defect claimed by the builder was independently reproduced and verified fixed (70/70). Approval is withheld only for D1: `concurrency.test.js` must validate `DATABASE_URL` before opening a pg connection so standalone runs cannot touch a default/shared database.
