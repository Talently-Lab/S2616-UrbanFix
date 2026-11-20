# Guía de Migraciones y Ciclo de Vida de Base de Datos — UrbanFix (BE-01)

## 1. Contexto y Diagnóstico Arquitectónico

### 1.1 El Problema (Defectos D2 y D3)
En las revisiones previas del proyecto, la ejecución de `npx prisma migrate deploy` sobre una base de datos PostgreSQL vacía fallaba con:
- **Error:** `P3018 / SQLSTATE 42710: ERROR: type "Rol" already exists` en la migración `20261005143951_init`.
- **Efecto de bloqueo:** Al reintentar, Prisma detectaba una migración fallida en `_prisma_migrations`, arrojando `P3009` (Defecto D2).

Adicionalmente, si una base creada con la migración de semana 3 contenía datos de solicitudes, ejecutar `prisma migrate deploy` directamente fallaba con `SQLSTATE 23502` (`column "categoria" contains null values`) debido a que la migración intermedia aplicaba `DROP COLUMN "categoria", ADD COLUMN "categoria" TEXT NOT NULL`, destruyendo irrevocablemente las categorías preexistentes (Defecto D3).

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
# Utilizando la variable DATABASE_URL del entorno:
npm run db:precheck

# O especificando una URL explícita:
node tests/migrations/migration-precheck.js --url "postgresql://usuario:pass@localhost:5432/mi_base"
```

### 2.2 Códigos de Salida y Criterios
- **Exit 0 (Soportado):** La base se encuentra en un estado canónico reconocido (`CLEAN_DATABASE`, `CANONICAL_INITIAL_NEEDS_UPGRADE`, `CANONICAL_FULLY_UPDATED`).
- **Exit 1 (Bloqueado):** Se detectan migraciones legacy espurias (`LEGACY_UNSUPPORTED`), migraciones fallidas (`FAILED_MIGRATION_PENDING`), tablas sin ledger (`DB_PUSH_OR_UNTRACKED_OBJECTS`), migraciones desconocidas (`UNKNOWN_MIGRATIONS_IN_LEDGER`), o discrepancias de checksums contra los archivos en disco (`CHECKSUM_MISMATCH`). **No mutar la base si el precheck sale con error 1.**

---

## 3. Matriz de Estados de Base de Datos (Fixtures F0 a F9)

| Fixture | Estado | Pre-check Status | Soporte | Procedimiento Operativo |
|---|---|---|---|---|
| **F0** | PostgreSQL Vacío | `CLEAN_DATABASE` | Soportado | `prisma migrate deploy` directo |
| **F1** | Base canónica al día | `CANONICAL_FULLY_UPDATED` | Soportado | `prisma migrate deploy` no-op idempotente |
| **F2** | Base canónica inicial con datos (Semana 3) | `CANONICAL_INITIAL_NEEDS_UPGRADE` | Soportado (procedimiento conservador) | Transacción SQL no destructiva + pre-verificación de esquema + `resolve` + `deploy` |
| **F3** | Base con ledger fallido (P3009) | `FAILED_MIGRATION_PENDING` | **Bloqueado** | Diagnóstico asistido, rollback o recreación en desarrollo |
| **F4** | Base con `prisma db push` sin ledger | `DB_PUSH_OR_UNTRACKED_OBJECTS` | Soportado tras diff | Validación estricta con `migrate diff` + baselining ordenado vía `resolve --applied` |
| **F5** | Base con init legacy duplicada (`20261002...` o `20261005...`) | `LEGACY_UNSUPPORTED` | **Bloqueado** | Abort antes de mutar; recreación limpia en desarrollo o migración forense con backup |
| **F6** | Migraciones desconocidas en ledger | `UNKNOWN_MIGRATIONS_IN_LEDGER` | **Bloqueado** | Abort antes de mutar; investigar origen de migraciones ajenas |
| **F7** | Checksum alterado contra disco | `CHECKSUM_MISMATCH` | **Bloqueado** | Abort; indica archivos modificados tras ser aplicados |
| **F8** | Migración con rollback registrado | `ROLLED_BACK_MIGRATIONS_IN_LEDGER` | **Bloqueado** | Abort; requiere revisión manual de estado |
| **F9** | Base con enums/objetos sin ledger | `DB_PUSH_OR_UNTRACKED_OBJECTS` | **Bloqueado** | No se clasifica como vacía; requiere inspección de diff |

---

## 4. Procedimientos Operativos Detallados

> [!IMPORTANT]
> Ejecutar **siempre** `npm run db:precheck` antes de cualquier intervención.

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
> **NO** declarar resuelto el defecto D3 para un `prisma migrate deploy` directo sobre una base inicial poblada. Ejecutar `migrate deploy` directamente sobre una base con solicitudes existentes **fallará con SQLSTATE 23502** y destruiría los datos de categorías.
> D3 se resuelve **únicamente** siguiendo el procedimiento conservador transaccional previo que se detalla a continuación.

#### Procedimiento Conservador Obligatorio:
1. **Verificar estado con pre-check:**
   ```bash
   npm run db:precheck
   # Debe responder CANONICAL_INITIAL_NEEDS_UPGRADE con exit 0.
   ```
2. **Generar Backup obligatorio:**
   ```bash
   pg_dump -U <usuario> -d <nombre_db> -Fc > backup_pre_upgrade.dump
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
5. **Verificar los efectos en el esquema físico ANTES de resolve:**
   ```sql
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_schema = 'public' 
   AND table_name = 'SolicitudServicio' AND column_name = 'categoria';
   -- data_type debe ser 'text'
   ```
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

El proyecto incluye una suite automatizada en `backend/tests/migrations/verify-migrations.js` que reproduce y valida exhaustivamente los escenarios F0 a F9.

### 5.1 Requisitos de Laboratorio
- Instancia de PostgreSQL (versión 16 recomendada).
- Privilegio `CREATEDB` en el usuario de PostgreSQL para permitir la creación de bases efímeras con nombres impredecibles.
- **Variable obligatoria:** `TEST_DATABASE_URL` (sin fallback a `DATABASE_URL` para garantizar que nunca se toque una base productiva o ajena).

Ejemplo para iniciar un PostgreSQL de laboratorio en Docker en un puerto libre:
```bash
docker run -d --name uf-lab-postgres -p 55432:5432 -e POSTGRES_PASSWORD=testpass postgres:16-alpine
```

### 5.2 Ejecución de la Suite
```bash
TEST_DATABASE_URL="postgresql://postgres:testpass@localhost:55432/postgres" npm run test:migrations
```

El runner crea bases con nombres aleatorios (`uf_<label>_<uuid>`), nunca borra bases previas ajenas, y garantiza la limpieza de todas sus bases temporales creadas en un bloque `finally`, incluso ante fallos de aserción.
