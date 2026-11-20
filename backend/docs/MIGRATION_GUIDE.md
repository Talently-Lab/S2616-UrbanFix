# Guía de Migraciones y Ciclo de Vida de Base de Datos — UrbanFix (BE-01)

## 1. Contexto y Diagnóstico Arquitectónico

### 1.1 El Problema (Defectos D2 y D3)
En las revisiones previas del proyecto, la ejecución de `npx prisma migrate deploy` sobre una base de datos PostgreSQL vacía fallaba con el siguiente error:
- **Error:** `P3018 / SQLSTATE 42710: ERROR: type "Rol" already exists` en la migración `20261005143951_init`.
- **Efecto colateral:** Al reintentar, Prisma detectaba una migración fallida en `_prisma_migrations` bloqueando la base con `P3009` (Defecto D2).

### 1.2 Causa Raíz
Al auditar el historial de Git (`git log backend/prisma/migrations` y `git show a1ec432`):
- En el hito de la semana 3 (`fac9ce7`), la migración inicial canónica fue `20261007000000_init`.
- Posteriormente, en la semana 4 (commit `a1ec432`), se introdujeron inadvertidamente dos carpetas de migraciones previas procedentes de un entorno local (`20261002224650_init` y `20261005143951_init`).
- Ambas migraciones duplicaban la creación de los tipos enums (`Rol`, `EstadoSolicitud`) y las tablas (`Usuario`, `SolicitudServicio`). Debido a que Prisma ordena las migraciones por su marca temporal lexicográfica, ejecutaba `20261002224650_init` y luego fallaba inmediatamente al intentar crear nuevamente el tipo `Rol` en `20261005143951_init`.

### 1.3 Secuencia Canónica Aprobada
Con la autorización explícita de arquitectura (Codex), se eliminaron del árbol activo exclusivamente las dos carpetas duplicadas espurias:
- `backend/prisma/migrations/20261002224650_init/` (eliminada)
- `backend/prisma/migrations/20261005143951_init/` (eliminada)

La secuencia canónica de migraciones resultante conservada **byte a byte** (con checksums SHA-256 intactos) es:
1. `20261007000000_init`: Creación inicial canónica de schema `public`, tipos `Rol`, `CategoriaServicio`, `EstadoSolicitud`, tablas `Usuario`, `SolicitudServicio` (con categoría enum), `HistorialEstadoSolicitud`, e índices.
2. `20261011212651_add_last_login_to_usuario`: Agrega `lastLogin TIMESTAMP(3)` a `Usuario` y convierte `SolicitudServicio.categoria` a `TEXT NOT NULL`.
3. `20261011230000_feat_rechazo_vuelve_a_pendiente`: Agrega columna `accion TEXT` a `HistorialEstadoSolicitud` y crea la tabla `RechazoSolicitud` con sus índices y claves foráneas.

---

## 2. Matriz de Estados de Base de Datos (Fixtures F0 a F5)

Para garantizar un ciclo de vida predecible y seguro, se definen los siguientes estados soportados y no soportados:

| Fixture | Estado | Soporte | Procedimiento Requerido |
|---|---|---|---|
| **F0** | PostgreSQL Vacío | Soportado | `npx prisma migrate deploy` directo |
| **F1** | Base canónica al día | Soportado | `npx prisma migrate deploy` no-op idempotente |
| **F2** | Base canónica inicial con datos (Semana 3) | Soportado (procedimiento conservador) | Conversión no destructiva de categoría + `migrate resolve` + `migrate deploy` |
| **F3** | Base con ledger fallido (P3009) | No soportado directamente (Bloqueado) | Diagnóstico asistido, rollback controlado con resolve o recreación en dev |
| **F4** | Base generada con `prisma db push` sin ledger | Soportado | Validación previa con `migrate diff` + baselining ordenado vía `resolve --applied` |
| **F5** | Base con init legacy aplicada (`20261002...` o `20261005...`) | **No soportado / Bloqueado** | Detección previa y abort; requiere recreación limpia en desarrollo o intervención experta con backup |

---

## 3. Procedimientos Operativos Detallados

### 3.1 Escenario F0: Instalación Vacía (Nuevos Entornos, CI, Docker)
En cualquier base nueva y limpia:
```bash
# 1. Aplicar migraciones
npx prisma migrate deploy

# 2. Verificar idempotencia (debe informar "No pending migrations to apply")
npx prisma migrate deploy

# 3. Verificar drift contra el schema (debe salir con código 0 y sin diferencias)
npx prisma migrate diff --from-schema prisma/schema.prisma --to-config-datasource --exit-code

# 4. Poblar datos de prueba (idempotente)
npm run seed
```

### 3.2 Escenario F1: Base Canónica ya Actualizada
Bases de staging o producción que ya han corrido las 3 migraciones canónicas:
```bash
# Debe reportar 0 migraciones pendientes y conservar datos sin mutaciones
npx prisma migrate deploy
```

### 3.3 Escenario F2: Base Canónica Inicial con Datos Preexistentes (Semana 3)
> [!WARNING]
> **Riesgo crítico de pérdida de datos (Defecto D3):**
> La migración generada por Prisma `20261011212651_add_last_login_to_usuario` contiene:
> ```sql
> ALTER TABLE "SolicitudServicio" DROP COLUMN "categoria", ADD COLUMN "categoria" TEXT NOT NULL;
> ```
> Si se ejecuta `prisma migrate deploy` directamente sobre una base con solicitudes existentes:
> 1. PostgreSQL fallará con `ERROR: column "categoria" contains null values` (código 23502) porque no hay default.
> 2. Incluso si no fuera `NOT NULL`, se eliminarían y perderían irrevocablemente todas las categorías existentes de las solicitudes.

#### Procedimiento Conservador Obligatorio:
1. **Generar Backup:**
   ```bash
   pg_dump -U <usuario> -d <nombre_db> -Fc > backup_pre_upgrade.dump
   ```
2. **Ejecutar conversión SQL segura sin pérdida:**
   ```sql
   -- Convertir tipo de dato sin destruir la columna ni sus valores
   ALTER TABLE "SolicitudServicio" ALTER COLUMN "categoria" TYPE TEXT USING "categoria"::text;
   -- Asegurar campo lastLogin en Usuario
   ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "lastLogin" TIMESTAMP(3);
   ```
3. **Marcar la migración intermedia como aplicada sin reejecutar su SQL destructivo:**
   ```bash
   npx prisma migrate resolve --applied 20261011212651_add_last_login_to_usuario
   ```
4. **Desplegar la migración final de rechazos:**
   ```bash
   npx prisma migrate deploy
   ```
5. **Verificar concordancia del modelo y conservación de datos:**
   ```bash
   npx prisma migrate diff --from-schema prisma/schema.prisma --to-config-datasource --exit-code
   ```

### 3.4 Escenario F4: Base Sincronizada con `prisma db push` (Sin `_prisma_migrations`)
Para alinear una base donde se utilizó `db push` para crear las tablas:
> [!CAUTION]
> No aplicar `prisma migrate resolve` a ciegas. Debe verificarse previamente que el esquema físico coincida al 100% con el modelo de datos.

1. **Verificar diff estricto:**
   ```bash
   npx prisma migrate diff --from-schema prisma/schema.prisma --to-config-datasource --exit-code
   # Solo si el exit code es 0 ("No difference detected"), proceder al baselining.
   ```
2. **Registrar secuencialmente las migraciones canónicas:**
   ```bash
   npx prisma migrate resolve --applied 20261007000000_init
   npx prisma migrate resolve --applied 20261011212651_add_last_login_to_usuario
   npx prisma migrate resolve --applied 20261011230000_feat_rechazo_vuelve_a_pendiente
   ```
3. **Comprobar estado final:**
   ```bash
   npx prisma migrate deploy
   # Debe indicar: "No pending migrations to apply."
   ```

### 3.5 Escenario F5: Detección y Abort ante Migraciones Legacy o Corruptas
Si una base contiene registros correspondientes a las migraciones espurias eliminadas (`20261002224650_init` o `20261005143951_init`):
- **Diagnóstico:** La herramienta `migration-precheck.js` inspecciona `_prisma_migrations` y, ante la presencia de prefijos `20261002` o `20261005`, devuelve `supported: false` y `status: 'LEGACY_UNSUPPORTED'`.
- **Regla:** **Abortar inmediatamente antes de mutar o aplicar comandos de resolución.**
- **Recuperación:**
  - En bases de producción o staging: Escalar al arquitecto; no realizar mutaciones manuales sobre metadatos de Prisma sin auditoría forense.
  - En entornos de desarrollo/pruebas locales: Recrear la base de datos limpia ejecutando el procedimiento F0.

---

## 4. Verificación Automatizada y Regresión

El proyecto incluye una suite automatizada en `backend/tests/migrations/verify-migrations.js` que reproduce y valida exhaustivamente los escenarios F0 a F5 en un entorno PostgreSQL aislado.

### Ejecución:
```bash
npm run test:migrations
```
Variables de entorno opcionales:
- `TEST_DATABASE_URL`: Cadena de conexión al servidor PostgreSQL de pruebas (por defecto conecta a la instancia aislada local).
