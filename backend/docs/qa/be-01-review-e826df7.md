# Revalidación QA independiente — BE-01 (issue #9), candidato `e826df7`

- **Revisión de:** `e826df7b5f196b32825da72e2ac17b56ceb28bd5` (árbol final del builder), = `18483bc` + `3492cc8` + `e826df7`, aplicados por cherry-pick en mi rama QA como `d0b1c2e` → `396f1bd` → `10c36bd` (con `f89dddf`, mi revisión previa, entre medio). Rama del builder intacta.
- **Fecha:** 2026-11-20. Despacho: `task_ebb4cc73970e`. Referencia: `be-01-review-18483bc.md` (defectos R1–R8).
- **Laboratorio:** contenedor efímero propio `uf-qa-taskebb4cc73970e-pg` (`postgres:16-alpine`, `127.0.0.1:55434`). Todas las bases `uf_*`/`qa2_*` fueron creadas y eliminadas por este despacho.
- **Nota de coordinación:** veredicto técnico autorizado; integración/push/cierre NO autorizados (requieren aprobación explícita del usuario).

## 1. Igualdad del árbol probado

sha256 idénticos entre mi checkout y `e826df7` para: `MIGRATION_GUIDE.md`, `package.json`, `migration-precheck.js`, `verify-migrations.js`, `schemas/step1-initial.prisma`, `step2-add-last-login.prisma`, `step3-final.prisma`. Directorio `prisma/migrations/` idéntico (3 canónicas byte a byte + lock). Diff `a85014a..HEAD` sobre `frontend/`, `data/`, `qa/` = 0 líneas.

## 2. Ejecuciones realizadas

| # | Comando / prueba | Resultado |
|---|---|---|
| 1 | `npm run test:migrations` con `TEST_DATABASE_URL` del laboratorio | **exit 0 — F0–F11 + sentinel PASS** |
| 2 | `npm run test:migrations` sin `TEST_DATABASE_URL`, con `DATABASE_URL` presente | **exit 1** — aborta antes de conectar, sin crear nada, sin imprimir la URL de dev |
| 3 | SIGINT al PID node real durante F2.9–F2.10 | handler diferido (ver §4 M1): disparó en F2.12, limpió bases registradas, pero `main()` siguió en paralelo → quedaron `uf_f2_mislabeled_*` + sentinel sin purgar |
| 4 | Fallo NORMAL controlado: `DELETE FROM "SolicitudServicio"` sobre `uf_f4_dbpush_*` entre F4.6 y F4.8 | assert falló → `finally` limpió las 5 bases creadas + sentinel → error `Assertion failed: Solicitudes alteradas tras baselining`, ruta `main().catch` → salida no cero (el caso análogo sin TEST_DATABASE_URL confirmó exit 1). Cero `uf_*` de esta corrida |
| 5 | `npm run db:precheck` con `DATABASE_URL` del lab | exit 0 en estado soportado; password enmascarado (`postgres:***@`) |
| 6 | `migrate diff --from-schema step3-final.prisma --to-schema schema.prisma` | **diff vacío** (exit 0) — snapshot final ≡ schema real |
| 7 | Snapshots vs SQL real: DB construida por `migration.sql` de mig3 → diff `step1` inSync; mig3+mig4 SQL → diff `step2` inSync; deploy real completo → diff `step3` inSync | **3/3 equivalentes** |
| 8 | Precheck sobre estados inyectados (ver §3) | todos los esperados |
| 9 | Read-only: snapshot de catálogo (`pg_class`) + ledger antes/después de precheck en 3 estados bloqueados | **idénticos — precheck no muta** |
| 10 | Grep de la password en logs de corridas normal, SIGINT y fallo | **0 ocurrencias** |

## 3. Precheck — matriz ejecutada (estados construidos con ledger/checksums reales)

| Base de laboratorio | Estado inyectado | Resultado real |
|---|---|---|
| `qa2_full` | deploy real completo | `SUPPORTED / CANONICAL_FULLY_UPDATED` |
| `qa2_drift_idx` | + `DROP INDEX SolicitudServicio_estado_idx` | `BLOCKED / CANONICAL_SCHEMA_DRIFT` |
| `qa2_drift_null` | + `ALTER titulo DROP NOT NULL` | `BLOCKED / CANONICAL_SCHEMA_DRIFT` |
| `qa2_drift_type` | + `ALTER categoria TYPE varchar(50)` | `BLOCKED / CANONICAL_SCHEMA_DRIFT` |
| `qa2_drift_fk` | + `DROP CONSTRAINT tecnicoId_fkey` | `BLOCKED / CANONICAL_SCHEMA_DRIFT` |
| `qa2_disorder` | ledger {mig3, mig5} aplicadas con sha256 reales, falta mig4 | `BLOCKED / CANONICAL_SEQUENCE_DISORDERED` |
| `qa2_emptyledger` | `_prisma_migrations` vacía + tabla usuario presente | `BLOCKED / EMPTY_LEDGER_WITH_OBJECTS` |

Cubierto además por la propia suite (ejecutada, PASS): F2-Mislabeled = mi R6 (`CANONICAL_INITIAL_SCHEMA_DRIFT`, ledger con sha256 real, sin mutación), F10 = G5 (`CANONICAL_SCHEMA_DRIFT`), F6 desconocidas, F7 checksum inválido, F8 rolled_back, F9 enums sin ledger.

## 4. Defectos previos: estado

| ID | Resumen | Estado en e826df7 |
|---|---|---|
| R1 | Fallback a `DATABASE_URL` | ✅ RESUELTO — `TEST_DATABASE_URL` obligatoria, abort exit 1 (§2.2) |
| R2 | DROP FORCE sobre nombres fijos | ✅ RESUELTO — nombres `uf_<label>_<uuid>` impredecibles, solo `CREATE`, cleanup limitado al registro interno; sentinel preexistente preservado y verificado |
| R3 | Sin limpieza ante fallo | ✅ RESUELTO para excepciones normales — `finally` + `main().catch` limpian todas las bases creadas (§2.4); `cleanupHasFailures` eleva exit a 1. **Residual M1 abajo para señales** |
| R4 | Password en stdout | ✅ RESUELTO — enmascarada en banner y CLI; 0 apariciones en logs normales y de error |
| R5 | Precheck solo por nombres | ✅ RESUELTO — checksums sha256 reales, orden canónico estricto, rolled_back, desconocidas, ledger vacío con objetos, enums sin ledger, diff físico por snapshots step1/2/3 |
| R6 | Guía F2 mutaba antes de verificar | ✅ RESUELTO — precheck con diff físico step1 obliga verificación previa (mi caso `qa_f2_mislabeled` ahora es fixture F2-Mis y aborta `CANONICAL_INITIAL_SCHEMA_DRIFT` antes de tocar nada); guía §4.3 ordena precheck → backup → snapshot → transacción → **verificación esquema paso 2** → resolve → deploy |
| R7 | Checksums inventados / F4 sin datos | ✅ RESUELTO — fixtures válidos usan `computeMigrationChecksum()` o `migrate resolve` oficial; F4 carga y compara datos reales (los fixtures *inválidos* F5/F6 conservan literales — irrelevante al fallar antes del check de checksum) |
| R8 | Observaciones menores | ⚠️ PARCIAL — `db:precheck` CLI ahora existe ✅; asserts sobre texto humano de Prisma siguen frágiles (menor); `applied_steps_count` aún no se valida (menor) |

## 5. Defectos pendientes de esta revisión (menores, no bloqueantes)

- **M1 — Carrera en handlers SIGINT/SIGTERM:** las señales recibidas mientras el proceso está dentro de `execSync` se difieren al volver al event loop (observado: disparó en F2.12, no en F2.9). Además el handler `async` corre **en paralelo** con `main()`: durante el `await cleanupCreatedDatabases()` el flujo principal siguió creando bases (`uf_f2_mislabeled_*` se creó ya recibida la señal) y el `process.exit(130)` posterior omitió el `finally` de `main` y la purga del sentinel → quedaron 2 bases huérfanas (limpiadas por mí). La limpieza por señal no es atómica; recomendado: flag `shuttingDown` consultado por `main()` y drenar en su `finally`. Parcialmente mitigado: la guía documenta el prefijo `uf_*` para borrar huérfanas; SIGKILL no es interceptable y no se exige limpieza garantizada.
- **M2 — Doc: `LEDGER_COMPLETE_BUT_NO_TABLES` no existe en código.** `MIGRATION_GUIDE.md` §2.2 y tabla §3 dicen que G5 reporta ese status; el código devuelve `CANONICAL_SCHEMA_DRIFT`. Alinear nombre o tabla.
- **M3 — Doc: sobredeclara destrucción de datos en D3.** §1.1 y §4.3 afirman que el `DROP COLUMN, ADD COLUMN` "destruyendo irrevocablemente"/"destruiría" las categorías. Mi evidencia baseline: el `ALTER TABLE` es atómico, **falla completo con 23502 y los datos sobreviven** (verificado `categoria='PLOMERIA'` intacta tras el error). La pérdida se produciría solo si la sentencia pudiera completar; el texto debe describir fallo atómico, no destrucción consumada. Tampoco afirmar (no lo hace) que P3009 implique checksum mismatch — verificado que deploy ignora checksums de filas aplicadas.
- **M4 — Menor:** `applied_steps_count`, `logs` y orden por `started_at` no se validan en el precheck; asserts dependen de strings humanos de Prisma 7 (p.ej. `'No difference detected'`), frágiles entre versiones; la guía §4.3 paso 5 verifica solo `categoria`/`lastLogin` a mano donde la suite hace diff completo de step2 (recomendar reutilizar el snapshot check).

## 6. Inspección separada de documentación (rama `chore/backend-orchestration`, commits `9376830`+`83531f8`)

Solicitado por el coordinador. Hallazgos: **sin contradicciones reales.** `README.md` raíz y `backend/README.md`/`.env.example` declaran correctamente: variables consumidas (`DATABASE_URL`, `PORT`, `JWT_SECRET`), URL `localhost:5434` con `schema=public`, `JWT_EXPIRES_IN` explícitamente **no implementada** (código fija `7d`), CORS `*` actual, `npm test` roto pendiente de #10, advertencia de que #9 no está integrada aún, seed explícito de demo con aviso de no-producción, y ninguna URL pública prometida. Regla nueva en `AGENTS.md`: todo push requiere aprobación explícita del usuario — coherente con la aclaración recibida.

## 7. Veredicto por criterio (#9)

| Criterio | Veredicto | Evidencia |
|---|---|---|
| `validate`, `generate`, `migrate deploy` pasan sobre PostgreSQL vacío sin `db push` ni reset | ✅ | F0.1–F0.4 exit 0 |
| Repetir `migrate deploy` no cambia esquema ni falla | ✅ | F0.3, F1.2–F1.4 con snapshot de datos intacto |
| Esquema resultante coincide con `schema.prisma` | ✅ | diff real (no solo snapshot): F0.4/F1.4/F2.11/F4.5 + mi §2.6–2.7 |
| Seed explícito ×2 sin duplicados; logins de los 3 roles válidos | ✅ | F0.5–F0.7 |
| Ruta para bases existentes documentada y validada con fixture representativo, preservando datos; **estados no soportados detectados antes de mutar** | ✅ | F2 con checksums reales + snapshots de datos antes/después/antes-de-resolve; diff step2 previo a resolve; todos los estados adversos (R6, G5, drifts acotados, desconocidos, desordenados, rollback, checksum falso, ledger vacío con objetos, enums sin ledger) bloqueados **sin mutación** (read-only verificado §2.9) |
| QA entrega reproducción inicial y revalidación final | ✅ | `baseline-and-acceptance.md`, `be-01-review-18483bc.md`, este reporte |

## VEREDICTO GLOBAL: **APROBADO TÉCNICAMENTE** ✅

Todos los criterios de la issue #9 se cumplen con evidencia reproducida en laboratorio aislado; los bloqueantes R1–R7 quedan resueltos y verificados de forma independiente. Persisten 4 defectos menores no bloqueantes (M1–M4, §5) recomendados para corrección posterior — el más relevante es la carrera SIGINT/SIGTERM, mitigada por la documentación de huérfanas `uf_*`. Este veredicto cubre únicamente el árbol `e826df7`; la integración a `main`, push, PR y cierre de la issue quedan fuera de mi alcance y requieren la aprobación del usuario y del arquitecto.

## 8. Integridad y recursos

- Cherry-picks QA: `d0b1c2e` (orig. `18483bc`), `396f1bd` (orig. `3492cc8`), `10c36bd` (orig. `e826df7`). Único archivo propio nuevo: este reporte.
- `frontend/`, `data/`, `qa/` intactos (diff 0). Sin cambios a producción, `package.json` del builder incluye solo scripts nuevos (`test:migrations`, `db:precheck`).
- Limpieza: todas las bases `uf_*`/`qa2_*` eliminadas (incluidas las huérfanas del test SIGINT); contenedor `uf-qa-taskebb4cc73970e-pg` eliminado; scripts en `/tmp/uf-qa-ebb4cc/` fuera del repo.
