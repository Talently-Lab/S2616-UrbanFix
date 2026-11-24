# Revisión QA independiente — BE-01 (issue #9)

- **Revisión de:** commit `18483bc960f496b81701676a8319489227ff11ac` ("fix(prisma): reparar migraciones y documentar ciclo de vida (BE-01)", Antigravity), aplicado por cherry-pick en mi workspace QA como `d0b1c2e` sobre `4394704` (mi commit de reporte baseline sobre `a85014a`). Rama del builder no tocada.
- **Fecha:** 2026-11-20. Despacho: `task_feb06f34208a`.
- **Naturaleza:** revisión de la PRIMERA versión entregada. NO es aprobación final; arquitectura ya devolvió bloqueantes y el builder corrige. Los defectos aquí se confirman con evidencia ejecutada en laboratorio propio.
- **Laboratorio:** contenedor efímero `uf-qa-taskfeb06f34208a-pg` (`postgres:16-alpine`, `127.0.0.1:55433`, usuario `postgres`). Bases creadas por mí: `urbanfix_test_*` (del runner), `qa_g1..g6`, `qa_f2_mislabeled`, sentinel `urbanfix_test_f0_empty`. Nada externo tocado.

## 1. Verificación del diff

| Chequeo | Resultado |
|---|---|
| Archivos tocados | Solo `backend/`: `docs/MIGRATION_GUIDE.md` (+145), `package.json` (+1 script `test:migrations`), `tests/migrations/{migration-precheck,verify-migrations}.js` (+544), borrado de las 2 init duplicadas (−127) |
| Canónicas byte a byte | ✅ sha256 idénticos a `a85014a`: `20261007000000_init` `52ee90…`, `20261011212651` `5d5842…`, `20261011230000` `135f85…` |
| Duplicadas eliminadas | ✅ `20261002224650_init`, `20261005143951_init` ausentes; quedan 3 migraciones + `migration_lock.toml` |
| `frontend/`, `data/`, `qa/` | ✅ 0 líneas de diff vs `a85014a` |
| `package-lock.json` | ✅ sin cambios |

## 2. Casos ejecutados (matriz F0–F5 del builder)

Comando: `TEST_DATABASE_URL="postgresql://postgres:qa_lab_pass@127.0.0.1:55433/postgres" npm run test:migrations` → **exit 0**, las 5 secciones reportan "superado".

| Caso | Resultado real | Notas QA |
|---|---|---|
| F0 instalación vacía: deploy ×2, diff=0, seed ×2 sin duplicados, login 3 roles | ✅ PASS | D2 de baseline queda resuelto en base vacía |
| F1 redeploy no-op sobre canónica al día | ✅ PASS | |
| F2 canonical-init + datos: ALTER conservador → `resolve --applied` → deploy | ✅ PASS | datos preservados verificados (categorías GAS/PLOMERIA, tecnicoId, 2 filas historial, insert en `RechazoSolicitud`) — pero ver defectos R5/R6/R7 sobre la fidelidad del fixture y la guía |
| F3 ledger con migración fallida → precheck `FAILED_MIGRATION_PENDING` + deploy → P3009 | ✅ PASS | detección del caso simple correcta |
| F4 `db push` sin ledger → diff → `resolve --applied` ×3 → deploy no-op | ✅ PASS | fixture sin datos: no ejercita "preservando datos" del criterio |
| F5 ledger con `20261002224650_init` → `LEGACY_UNSUPPORTED`, abort | ✅ PASS | solo detección por nombre/prefijo — ver R5 |

## 3. Defectos confirmados de esta revisión (todos reproducidos en laboratorio propio)

### R1 — BLOQUEANTE. El runner cae a `DATABASE_URL` de desarrollo
`verify-migrations.js:14`: `BASE_DATABASE_URL = TEST_DATABASE_URL || DATABASE_URL || 'postgresql://postgres:testpass@localhost:5433/urbanfix_test'`.
**Evidencia:** `DATABASE_URL="postgresql://devuser:devsecret@10.255.255.1:5432/urbanfix_dev" npm run test:migrations` (sin TEST_DATABASE_URL) → el runner imprime `Base PostgreSQL: postgresql://devuser:devsecret@...` y procede a conectar. Sin variable dedicada obligatoria, un operador con `.env` de dev ejecuta DROP/CREATE sobre ese servidor.

### R2 — BLOQUEANTE. `DROP DATABASE IF EXISTS … WITH (FORCE)` sobre nombres fijos, sin aviso
`recreateDatabase()` (línea ~33) tira 5 nombres hardcodeados (`urbanfix_test_f0_empty`, `…f2_canonical_upgrade`, `…f3_failed_ledger`, `…f4_dbpush`, `…f5_legacy_detect`) antes de cada fixture.
**Evidencia:** creé `urbanfix_test_f0_empty` con tabla `sentinel_mia(42)` antes de correr la suite → post-run `SELECT * FROM sentinel_mia` → `ERROR: relation "sentinel_mia" does not exist`. La base preexistente fue destruida sin advertencia ni opt-in. Nombres fijos + FORCE en un servidor compartido = borrado silencioso de bases ajenas.

### R3 — BLOQUEANTE. Sin limpieza ante fallo o terminación anormal
La limpieza vive solo al final del camino feliz (líneas ~395–402); `main().catch` hace `process.exit(1)` sin `try/finally` ni handlers.
**Evidencia:** SIGKILL al proceso durante F2.5 → en el servidor quedaron `urbanfix_test_f0_empty` y `urbanfix_test_f2_canonical_upgrade` (verificado con `\l`). Cualquier assert fallido deja el mismo desorden.

### R4 — MAYOR. Password de conexión en stdout
El banner imprime `BASE_DATABASE_URL` completo: `Base PostgreSQL: postgresql://postgres:qa_lab_pass@127.0.0.1:55433/postgres` (run log). Credenciales en logs de CI/terminal.

### R5 — BLOQUEANTE. El precheck confía solo en nombres del ledger
`inspectDatabaseState()` no lee `checksum`, ignora `rolled_back_at` como señal, no verifica el esquema físico, y reporta `supported: true` para cualquier subconjunto/desconocido. Sonda ejecutada (`/tmp/uf-qa-feb06f34208a/probe_precheck.mjs`), resultados reales:

| Estado inyectado | Precheck real |
|---|---|
| G1: migración desconocida `99990101000000_mystery` aplicada | `SUPPORTED / CANONICAL_PARTIAL` |
| G2: solo `20261011230000` aplicada (fuera de orden, imposible vía deploy) | `SUPPORTED / CANONICAL_PARTIAL` |
| G3: fila canónica con `rolled_back_at` set (finished NULL) | `SUPPORTED / CANONICAL_PARTIAL` |
| G4: 3 canónicas aplicadas con checksums inventados | `SUPPORTED / CANONICAL_FULLY_UPDATED` |
| G5: ledger completo pero **cero tablas de usuario** | `SUPPORTED / CANONICAL_FULLY_UPDATED` |
| G6: canónica-init + migración desconocida extra | `SUPPORTED / CANONICAL_PARTIAL` |

Complemento: `migrate deploy` tampoco valida checksums de filas aplicadas — sobre G4 y G5 responde `No pending migrations to apply` (exit 0). Un ledger adulterado o un esquema destruido pasan invisibles por las dos herramientas.

### R6 — BLOQUEANTE. La guía F2 muta antes de verificación completa; demostrado envenenando una base
`MIGRATION_GUIDE.md` §3.3 no exige verificar que el esquema físico sea realmente el de la init canónica ni el checksum del ledger antes del `ALTER`+`resolve`. El precheck aprueba `CANONICAL_INITIAL_NEEDS_UPGRADE` mirando solo el nombre en el ledger.
**Evidencia reproducida** (base `qa_f2_mislabeled`: ledger con fila `20261007000000_init` y checksum REAL sha256, pero esquema físico legacy — sin `HistorialEstadoSolicitud`, `categoria` TEXT):
1. `inspectDatabaseState` → `supported: true`, `CANONICAL_INITIAL_NEEDS_UPGRADE` ❌
2. Guía paso 2 (`ALTER … USING ::text` + `ADD COLUMN IF NOT EXISTS lastLogin`) → OK, mutó el esquema
3. Guía paso 3 `migrate resolve --applied 20261011212651…` → marcada aplicada (falso respecto al esquema real)
4. Guía paso 4 `migrate deploy` → **P3018 / SQLSTATE 42P01** `relation "HistorialEstadoSolicitud" does not exist` en `20261011230000`
5. Resultado: base peor que al inicio — ledger miente (mig3+mig4 "aplicadas"), `lastLogin` agregada a destiempo, fila fallida nueva → todo reintento devuelve **P3009**. El procedimiento detectó el desastre DESPUÉS de mutar, no antes.

### R7 — MAYOR. Fixtures con checksums inventados; F4 no ejercita datos
Los INSERTs al ledger usan literales `'checksum-20261007000000_init'`, `'checksum-failed-init'`, `'checksum-legacy-init'` en vez del sha256 real del `migration.sql` (que sí validé: es sha256 del archivo). Como Prisma deploy no verifica checksums aplicados, el fixture pasa igual — pero no representa un ledger real ni prueba manejo de checksums. Además F4 hace `db push` sobre base vacía: no hay datos que verificar, así que el criterio "fixture representativo, preservando datos" queda cubierto solo por F2.

### R8 — Menor. Observaciones
- Asserts sobre texto humano de Prisma (`'All migrations have been successfully applied'`, `'No difference detected'`) — frágil entre versiones.
- `inspectDatabaseState` no tiene script npm/CLI propio; la guía lo menciona pero el operador no tiene comando documentado para invocarlo antes de los procedimientos.
- `npm test` sigue en exit 127 (script `../scripts/test-api.sh` ausente) — esperado: fuera del alcance de BE-01, pertenece a BE-02.

## 4. Veredicto por criterio de aceptación (#9)

| Criterio | Veredicto | Evidencia |
|---|---|---|
| `validate`, `generate`, `migrate deploy` pasan sobre PG vacío sin db push ni reset | ✅ CUMPLE | §2 F0: exit 0, "All migrations have been successfully applied" |
| Repetir `migrate deploy` no cambia esquema ni falla | ✅ CUMPLE | F0.3/F1.2: "No pending migrations to apply" |
| Esquema resultante coincide con `schema.prisma` | ✅ CUMPLE | `migrate diff --exit-code` → "No difference detected" (F0.4, F1.3, F2.7, F4.5) |
| Seed explícito ×2 sin duplicados; logins de los 3 roles | ✅ CUMPLE | F0.5–F0.7: 3 usuarios/1 solicitud tras doble seed; login CLIENTE/TECNICO/ADMIN OK con lastLogin |
| Ruta para bases existentes documentada y validada con fixture representativo, preservando datos; **estados no soportados se detectan antes de mutar** | ❌ NO CUMPLE | F2 feliz funciona y preserva datos (§2), pero: estados no soportados NO se detectan (R5: G1–G6 todos `supported`); la guía F2 muta antes de verificar y deja la base envenenada P3009 (R6); fixtures con checksums falsos y F4 sin datos (R7) |
| QA entrega reproducción inicial y revalidación final | 🔄 EN CURSO | Baseline en `backend/docs/qa/baseline-and-acceptance.md`; esta revisión; falta validación del commit corregido |

**Veredicto global: CAMBIOS REQUERIDOS (no aprobable).** La estrategia central es correcta — retirar solo las duplicadas, canónicas intactas, F0/F1 impecables, y el camino conservador de F2 preserva datos sobre una base genuina. Pero la seguridad del runner (R1–R4), la insuficiencia del precheck (R5) y la guía F2 que muta antes de verificar (R6) son bloqueantes; coinciden con los bloqueantes ya devueltos por arquitectura y aquí quedan confirmados con reproducción independiente.

### Recomendaciones mínimas para la corrección
1. Exigir `TEST_DATABASE_URL` explícito (fallar si ausente) o confirmación interactiva; nunca caer a `DATABASE_URL`.
2. Prefijar nombres de base por despacho/session-id y verificar `datallowconn`/etiqueta sentinel antes de DROP, o crear bases con sufijo aleatorio y limpiarlas en `finally` + `SIGINT/SIGTERM` handlers.
3. Ofuscar credenciales en logs (imprimir host/db, no la URL).
4. Precheck: validar checksum sha256 del archivo por fila, tratar `rolled_back_at`/pasos parciales/nombres desconocidos como BLOQUEADO, requerir subconjunto canónico ordenado exacto, y (al menos para F2/F4) verificar esquema físico vs `migrate diff` antes de declarar `supported`.
5. Guía F2: exigir precheck + `migrate diff --from-migrations`/verificación física ANTES de cualquier `ALTER`/`resolve`; documentar el orden: verificar → backup → convertir → resolve → deploy → verificar.
6. Fixtures: generar el checksum real (sha256 del archivo) al insertar filas del ledger; agregar datos a F4 o justificar su ausencia.

## 5. Integridad y recursos

- `git status`: único archivo nuevo `backend/docs/qa/be-01-review-18483bc.md` (más el cherry-pick `d0b1c2e` del builder). `frontend/`, `data/`, `qa/` intactos.
- A eliminar al cerrar el despacho: contenedor `uf-qa-taskfeb06f34208a-pg` con todas las bases `urbanfix_test_*` y `qa_*` (incluidas las sobrantes del run matado — evidencia R3); scripts `/tmp/uf-qa-feb06f34208a/`.
- No se modificó código de producción; no se corrió el runner contra ningún servicio ajeno.
