# Guía de Migraciones y Ciclo de Vida de Base de Datos — UrbanFix (BE-01)

## 1. Contexto y Diagnóstico Arquitectónico

### 1.1 El Problema (Defectos D2 y D3)
En las revisiones previas del proyecto, la ejecución de `npx prisma migrate deploy` sobre una base de datos PostgreSQL vacía fallaba con:
- **Error:** `P3018 / SQLSTATE 42710: ERROR: type "Rol" already exists` en la migración `20261005143951_init`.
- **Efecto de bloqueo:** Al reintentar, Prisma detectaba una migración fallida en `_prisma_migrations`, arrojando `P3009` (Defecto D2).

Adicionalmente, si una base creada con la migración de semana 3 contenía datos de solicitudes, ejecutar `prisma migrate deploy` directamente fallaba con `SQLSTATE 23502` (`column "categoria" contains null values`) debido a que la migración intermedia aplicaba `DROP COLUMN "categoria", ADD COLUMN "categoria" TEXT NOT NULL` (Defecto D3). PostgreSQL rechaza esa sentencia de forma atómica: en el caso probado las categorías originales sobreviven, pero queda una migración fallida que bloquea los reintentos. El procedimiento conservador evita el fallo y no elimina la columna.

### 1.2 Causa Raíz
Al auditar el historial de Git (`git log backend/prisma/migrations` y `git show a1ec432`):
- En el entregable de la semana 3 (`fac9ce7`), la migración inicial canónica fue `20261007000000_init`.
- Posteriormente, en la semana 4 (commit `a1ec432`), se añadieron inadvertidamente dos carpetas de migraciones locales obsoletas (`20261002224650_init` y `20261005143951_init`).
- Ambas migraciones duplicaban la creación de enums (`Rol`, `EstadoSolicitud`) y tablas (`Usuario`, `SolicitudServicio`). Prisma, al ordenar lexicográficamente las carpetas, ejecutaba `20261002224650_init` y fallaba de inmediato al intentar recrear `Rol` en `20261005143951_init`.

### 1.3 Secuencia Canónica Aprobada
Con la autorización explícita de arquitectura (Codex), se eliminaron del árbol activo exclusivamente las dos carpetas duplicadas espurias:
- `backend/prisma/migrations/20261002224650_init/` (eliminada)
- `backend/prisma/migrations/20261005143951_init/` (eliminada)

La secuencia canónica de migraciones resultante se conserva **byte a byte** (con checksums SHA-256 intactos):
1. `20261007000000_init`: Creación inicial canónica de schema `public`, tipos `Rol`, `CategoriaServicio`, `EstadoSolicitud`, tablas `Usuario`, `SolicitudServicio` (con categoría enum), `HistorialEstadoSolicitud`, e índices.
2. `20261011212651_add_last_login_to_usuario`: Agrega `lastLogin TIMESTAMP(3)` a `Usuario` y convierte `SolicitudServicio.categoria` a `TEXT NOT NULL`.
3. `20261011230000_feat_rechazo_vuelve_a_pendiente`: Agrega columna `accion TEXT` a `HistorialEstadoSolicitud` y crea la tabla `RechazoSolicitud` con sus índices y claves foráneas.

---

## 2. Herramienta de Pre-check de Estado de Base de Datos

Para evitar mutaciones ciegas, drift o corrupción, se incluye la utilidad read-only `migration-precheck.js`.

### 2.1 Ejecución
```bash
# Con DATABASE_URL ya exportada:
npm run db:precheck

# Alternativa que carga backend/.env desde esta carpeta:
node --env-file=.env tests/migrations/migration-precheck.js

# O especificando una URL explícita:
node tests/migrations/migration-precheck.js --url "postgresql://usuario:pass@localhost:5432/mi_base"
```

### 2.2 Validación de Integridad Doble (Ledger + Esquema Físico)
El precheck no se limita a leer nombres de migraciones; realiza una validación exhaustiva:
1. **Validación de Checksums SHA256 contra disco:** Compara cada checksum registrado en `_prisma_migrations` contra el SHA256 real calculado en tiempo de ejecución del archivo `migration.sql` en disco. Ante cualquier divergencia, reporta `CHECKSUM_MISMATCH` (exit 1).
2. **Validación de Esquema Físico Real:**
   - Si el ledger indica `20261007000000_init`, verifica que existan las tablas `Usuario`, `SolicitudServicio` e `HistorialEstadoSolicitud`, y que la columna `SolicitudServicio.categoria` sea del tipo enum `CategoriaServicio`. Si la base tiene un esquema legacy mal etiquetado (`qa_f2_mislabeled`), reporta `CANONICAL_INITIAL_SCHEMA_DRIFT` y bloquea antes de mutar.
   - Si el ledger indica `CANONICAL_FULLY_UPDATED`, verifica que existan físicamente todas las tablas requeridas. Si el ledger está lleno pero no hay tablas (`G5`), reporta `CANONICAL_SCHEMA_DRIFT` (exit 1).
3. **Bloqueo de Estados Desconocidos y Desordenados:**
   - Migraciones ajenas/desconocidas: `UNKNOWN_MIGRATIONS_IN_LEDGER` (exit 1).
   - Migraciones fuera de orden cronológico canónico: `CANONICAL_SEQUENCE_DISORDERED` (exit 1).
   - Migraciones con rollback registrado: `ROLLED_BACK_MIGRATIONS_IN_LEDGER` (exit 1).
   - Migraciones fallidas: `FAILED_MIGRATION_PENDING` (exit 1).

---

## 3. Matriz de Estados de Base de Datos (Fixtures F0 a F10)

| Fixture | Estado | Pre-check Status | Soporte | Procedimiento Operativo |
|---|---|---|---|---|
| **F0** | PostgreSQL Vacío | `CLEAN_DATABASE` | Soportado | `prisma migrate deploy` directo |
| **F1** | Base canónica al día | `CANONICAL_FULLY_UPDATED` | Soportado | `prisma migrate deploy` no-op idempotente |
| **F2** | Base canónica inicial con datos (Semana 3) | `CANONICAL_INITIAL_NEEDS_UPGRADE` | Soportado (procedimiento conservador) | Transacción SQL no destructiva + pre-verificación de esquema + `resolve` + `deploy` |
| **F2-Mis** | Ledger inicial pero esquema legacy | `CANONICAL_INITIAL_SCHEMA_DRIFT` | **Bloqueado** | Abort antes de mutar; corregir discrepancia física antes de resolve |
| **F3** | Base con ledger fallido (P3009) | `FAILED_MIGRATION_PENDING` | **Bloqueado** | Diagnóstico asistido, rollback o recreación en desarrollo |
| **F4** | Base con `prisma db push` sin ledger | `DB_PUSH_OR_UNTRACKED_OBJECTS` | Soportado tras diff | Validación estricta con `migrate diff` + baselining ordenado vía `resolve --applied` |
| **F5** | Base con init legacy duplicada (`20261002...` o `20261005...`) | `LEGACY_UNSUPPORTED` | **Bloqueado** | Abort antes de mutar; recreación limpia en desarrollo o migración forense con backup |
| **F6** | Migraciones desconocidas en ledger (G1/G6) | `UNKNOWN_MIGRATIONS_IN_LEDGER` | **Bloqueado** | Abort antes de mutar; investigar origen de migraciones ajenas |
| **F7** | Checksum alterado contra disco (G4) | `CHECKSUM_MISMATCH` | **Bloqueado** | Abort; indica archivos modificados tras ser aplicados |
| **F8** | Migración con rollback registrado (G3) | `ROLLED_BACK_MIGRATIONS_IN_LEDGER` | **Bloqueado** | Abort; requiere revisión manual de estado |
| **F9** | Base con enums/objetos sin ledger | `DB_PUSH_OR_UNTRACKED_OBJECTS` | **Bloqueado** | No se clasifica como vacía; requiere inspección de diff |
| **F10** | Ledger completo sin tablas físicas (G5) | `CANONICAL_SCHEMA_DRIFT` | **Bloqueado** | Abort; indica inconsistencia grave entre metadatos y DDL |

---

## 4. Procedimientos Operativos Detallados

> [!IMPORTANT]
> Ejecutar **siempre** el precheck antes de intervenir. Los ejemplos de
> `npm run db:precheck` suponen `DATABASE_URL` exportada. Si está solo en `.env`,
> usar `node --env-file=.env tests/migrations/migration-precheck.js`.

### 4.1 Escenario F0: Instalación Vacía (Nuevos Entornos, CI, Docker)
Apto para bases recién creadas sin tablas ni tipos:
```bash
# 1. Comprobar que la base está vacía (debe reportar CLEAN_DATABASE con exit 0)
npm run db:precheck

# 2. Aplicar migraciones
npx prisma migrate deploy

# 3. Verificar idempotencia (debe informar "No pending migrations to apply")
npx prisma migrate deploy

# 4. Verificar drift contra el schema (debe salir con código 0 y sin diferencias)
npx prisma migrate diff --from-schema prisma/schema.prisma --to-config-datasource --exit-code

# 5. Poblar datos de prueba (idempotente)
npm run seed
```

### 4.2 Escenario F1: Base Canónica ya Actualizada
Bases de staging o producción que ya han corrido las 3 migraciones canónicas:
```bash
# 1. Verificar estado al día (debe reportar CANONICAL_FULLY_UPDATED con exit 0)
npm run db:precheck

# 2. Comprobar que no hay pendientes ni mutaciones
npx prisma migrate deploy
```

### 4.3 Escenario F2: Base Canónica Inicial con Datos Preexistentes (Semana 3)
> [!WARNING]
> **Límite crítico sobre el Defecto D3:**
> **NO** declarar resuelto el defecto D3 para un `prisma migrate deploy` directo sobre una base inicial poblada. Ejecutar `migrate deploy` directamente sobre una base con solicitudes existentes **fallará con SQLSTATE 23502**. La sentencia fallida se revierte atómicamente y conserva las categorías; el registro fallido de Prisma impide continuar hasta su recuperación.
> D3 se resuelve **únicamente** siguiendo el procedimiento conservador transaccional previo que se detalla a continuación.

#### Procedimiento Conservador Obligatorio:
1. **Verificar estado con pre-check:**
   ```bash
   npm run db:precheck
   # Debe responder CANONICAL_INITIAL_NEEDS_UPGRADE con exit 0.
   # Si arroja CANONICAL_INITIAL_SCHEMA_DRIFT, ABORTAR (la base no tiene el esquema de semana 3).
   ```
2. **Generar Backup obligatorio:**
   ```bash
   pg_dump -h <host> -p <puerto> -U <usuario> -d <nombre_db> -Fc > backup_pre_upgrade.dump
   ```
3. **Auditar snapshot de datos antes de la migración:**
   Verificar cantidad y contenido de usuarios, solicitudes y categorías existentes.
4. **Ejecutar la conversión SQL en una transacción atómica:**
   ```sql
   BEGIN;
   -- Convierte la columna categoria de enum a TEXT preservando los valores existentes
   ALTER TABLE "SolicitudServicio" ALTER COLUMN "categoria" TYPE TEXT USING "categoria"::text;
   -- Agrega lastLogin opcional en Usuario
   ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "lastLogin" TIMESTAMP(3);
   COMMIT;
   ```
5. **Verificar el esquema completo del paso 2 y los datos ANTES de resolve:**
   ```bash
   npx prisma migrate diff --from-schema tests/migrations/schemas/step2-add-last-login.prisma --to-config-datasource --exit-code
   # Debe salir con código 0, sin diferencias. Ante cualquier diferencia, ABORTAR.
   ```
   Esto verifica el estado intermedio completo, incluida `categoria TEXT NOT NULL`
   y `Usuario.lastLogin TIMESTAMP(3)` nullable. Comparar también el snapshot de
   usuarios, solicitudes e historial con el previo a la transacción; no registrar
   la migración como aplicada si difieren datos que debían conservarse.
6. **Registrar la migración intermedia como aplicada:**
   ```bash
   npx prisma migrate resolve --applied 20261011212651_add_last_login_to_usuario
   ```
7. **Desplegar la migración final de rechazos:**
   ```bash
   npx prisma migrate deploy
   ```
8. **Verificar concordancia del modelo final:**
   ```bash
   npx prisma migrate diff --from-schema prisma/schema.prisma --to-config-datasource --exit-code
   # Debe indicar: "No difference detected."
   ```
9. **Auditar snapshot posterior:**
   Comprobar que todos los IDs, correos, roles, títulos, estados, categorías e historiales se conservaron íntegramente.

### 4.4 Escenario F4: Base Sincronizada con `prisma db push` (Sin `_prisma_migrations`)
Para alinear una base donde se utilizó `db push` para crear las tablas:
> [!CAUTION]
> No aplicar `prisma migrate resolve` a ciegas. Debe verificarse previamente que el esquema físico coincida al 100% con el modelo de datos.

1. **Pre-check:**
   ```bash
   npm run db:precheck
   # Informará DB_PUSH_OR_UNTRACKED_OBJECTS.
   ```
2. **Verificar diff estricto contra el modelo:**
   ```bash
   npx prisma migrate diff --from-schema prisma/schema.prisma --to-config-datasource --exit-code
   # Si arroja cualquier diferencia (exit code != 0), ABORTAR. No hacer baselining con drift.
   ```
3. **Registrar secuencialmente las 3 migraciones canónicas:**
   ```bash
   npx prisma migrate resolve --applied 20261007000000_init
   npx prisma migrate resolve --applied 20261011212651_add_last_login_to_usuario
   npx prisma migrate resolve --applied 20261011230000_feat_rechazo_vuelve_a_pendiente
   ```
4. **Comprobar estado final:**
   ```bash
   npm run db:precheck
   # Debe indicar CANONICAL_FULLY_UPDATED (exit 0).
   npx prisma migrate deploy
   # Debe indicar: "No pending migrations to apply."
   ```

### 4.5 Escenario F5: Detección y Abort ante Migraciones Legacy o Corruptas
Si una base contiene registros correspondientes a las migraciones espurias eliminadas (`20261002224650_init` o `20261005143951_init`):
- `npm run db:precheck` arrojará `LEGACY_UNSUPPORTED` con exit 1.
- **Regla:** **Abortar inmediatamente antes de mutar o aplicar comandos de resolución.**
- **Recuperación:**
  - En bases de producción o staging: Escalar al arquitecto; no realizar mutaciones manuales sobre metadatos de Prisma sin auditoría forense.
  - En entornos de desarrollo/pruebas locales: Recrear la base de datos limpia ejecutando el procedimiento F0.

---

## 5. Verificación Automatizada y Regresión

El proyecto incluye una suite automatizada en `backend/tests/migrations/verify-migrations.js` que reproduce y valida exhaustivamente los escenarios F0 a F10.

### 5.1 Requisitos de Laboratorio
- Instancia de PostgreSQL (versión 16 recomendada).
- Privilegio `CREATEDB` en el usuario de PostgreSQL para permitir la creación de bases efímeras con nombres impredecibles.
- **Variable obligatoria:** `TEST_DATABASE_URL`, sin fallback a `DATABASE_URL`. El operador debe comprobar que corresponde a un servidor exclusivo de laboratorio; el nombre de la variable no acredita por sí solo ese aislamiento.

Ejemplo para iniciar un PostgreSQL de laboratorio en Docker en un puerto libre:
```bash
docker run -d --name uf-lab-postgres -p 127.0.0.1:55432:5432 -e POSTGRES_PASSWORD=testpass postgres:16-alpine
```

### 5.2 Ejecución de la Suite
```bash
TEST_DATABASE_URL="postgresql://postgres:testpass@localhost:55432/postgres" npm run test:migrations
```

### 5.3 Aislamiento, limpieza y límites de interrupción

- El runner genera nombres impredecibles por corrida (`uf_<label>_<uuid>`) y no borra bases preexistentes para preparar un fixture.
- Registra las bases creadas y las limpia en `finally` ante excepciones normales, con salida no cero si falla la limpieza.
- **Residual M1:** QA detectó una carrera entre los handlers de `SIGINT`/`SIGTERM` y el flujo principal; una interrupción puede dejar recursos propios pendientes de limpiar. Su corrección se incorpora al trabajo del runner en #10. No se garantiza limpieza completa por señal en esta revisión.
- `SIGKILL` y una caída del host no son interceptables. Para recuperar recursos, consultar los nombres exactos registrados en el log de la corrida y comprobar su propiedad antes de eliminarlos en el servidor de laboratorio. El prefijo `uf_` por sí solo no demuestra que una base pertenezca a esa corrida.

La aprobación QA del candidato está en [be-01-review-e826df7.md](./qa/be-01-review-e826df7.md). Solo el usuario puede aprobar un push a GitHub.
