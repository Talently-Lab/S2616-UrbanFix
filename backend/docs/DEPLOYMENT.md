# Guía de Preparación de Despliegue y Operación — UrbanFix (BE-06)

## 1. Contexto y Objetivos Arquitectónicos

Este documento define la arquitectura operativa, el artefacto de contenedor y los procedimientos de despliegue para el backend de UrbanFix, resolviendo la [issue #14](https://github.com/Talently-Lab/S2616-UrbanFix/issues/14) (BE-06).

### 1.1 El Problema Previo
En revisiones anteriores:
- El `Dockerfile` existente ejecutaba de manera encadenada y automática `prisma migrate deploy && node prisma/seed.js && node src/index.js` en su comando de arranque (`CMD`).
- Esta práctica causaba efectos destructivos o inesperados: aplicaba mutaciones de DDL automáticamente al arrancar la API y sembraba usuarios demo de laboratorio (`juan@mail.com`, `carlos@mail.com`, `admin@mail.com`) en cualquier entorno.
- No existía un archivo Docker Compose versionado en el repositorio para desarrollo local aislado.
- La API solo exponía `GET /health`, el cual verifica únicamente si el proceso Node.js responde, sin verificar conectividad real con PostgreSQL ni estado de preparación del esquema relacional (readiness).

### 1.2 Principios de la Solución (BE-06)
1. **Separación estricta de responsabilidades:** El arranque del servidor HTTP (`src/index.js`) arranca **exclusivamente** el servicio con su configuración validada. Las migraciones son un paso previo explícito de preparación/release, y el seed es un comando opcional de laboratorio.
2. **Artefacto inmutable y determinista:** Construido sobre `node:24-bookworm-slim`, bajo usuario no-root (`node`), con dependencias congeladas por lockfile (`npm ci`) y generación de cliente Prisma sin requerir acceso a bases de datos ni secretos en build-time.
3. **Sondas operativas duales (Liveness y Readiness):** Preservación de `/health` para liveness y adición de `/ready` con verificación real de esquema PostgreSQL y límites de timeout acotados (`<= 5s`).
4. **Composición local versionada:** Archivo `backend/compose.yaml` estandarizado para desarrollo y validación de QA con aislamiento de volúmenes, puertos y nombres de proyecto.
5. **Sin publicación inventada:** No se presumen proveedores cloud, dominios ni bases productivas de terceros. La publicación real se gestiona en BE-07 bajo aprobación explícita del usuario.

---

## 2. Artefacto de Contenedor (`Dockerfile` y `.dockerignore`)

### 2.1 Especificación del Dockerfile
El archivo `backend/Dockerfile` implementa las siguientes características:

- **Imagen base:** `node:24-bookworm-slim` (alineada con el entorno de desarrollo y pruebas verificado Node 24).
- **Dependencias de sistema:** Instalación de `openssl` (requerida por el motor de Prisma) con limpieza inmediata de listas de apt (`rm -rf /var/lib/apt/lists/*`).
- **Seguridad y privilegios:** Directorio de trabajo `/app` asignado al usuario `node` (UID/GID 1000). Todos los comandos se ejecutan bajo `USER node`.
- **Instalación de paquetes:** `npm ci` ejecutado sobre `package.json` y `package-lock.json` para reproducibilidad bit a bit.
- **Generación de Prisma Client:** Ejecución explícita en build-time mediante:
  ```dockerfile
  RUN DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate
  ```
  Prisma valida sintaxis del schema pero no realiza conexiones de red en esta fase.
- **Artefactos selectivos de precheck:** Se copian únicamente los archivos requeridos para que `npm run db:precheck` funcione dentro del contenedor:
  - `tests/migrations/migration-precheck.js`
  - `tests/migrations/schemas/` (snapshots DDL canónicos)
  Se excluyen deliberadamente suites de tests de integración (`tests/api/`) para mantener la imagen ligera y sin dependencias superfluas.
- **Sonda de salud integrada (Healthcheck):**
  ```dockerfile
  HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD node --input-type=module -e "import http from 'node:http'; const port = process.env.PORT || 3001; const req = http.get('http://127.0.0.1:' + port + '/ready', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }); req.on('error', () => process.exit(1)); req.setTimeout(4000, () => { req.destroy(); process.exit(1); });"
  ```
  Utiliza el cliente HTTP nativo de Node.js, eliminando dependencias de binarios externos como `curl` o `wget`.
- **Comando de arranque (CMD):**
  ```dockerfile
  CMD ["node", "src/index.js"]
  ```
  No ejecuta migraciones ni seed.

### 2.2 Exclusiones de Construcción (`.dockerignore`)
Para garantizar que ningún secreto, archivo temporal ni dependencia del host contamine la imagen:
```text
node_modules
.env
.env.*
!.env.example
npm-debug.log*
*.log
.git
tests/api
tests/migrations/verify-migrations.js
```

---

## 3. Configuración en Runtime y Variables de Entorno

Al iniciar el proceso de la API (`src/index.js`), el módulo `src/config/env.js` valida de forma sincrónica todas las variables de entorno en memoria **antes de abrir sockets HTTP o conectar a la base de datos**. Ante cualquier error de configuración, el proceso aborta de inmediato con código de salida `1` sin exponer datos confidenciales.

| Variable | Tipo / Regla | Propósito / Comportamiento |
|---|---|---|
| `NODE_ENV` | `development` \| `test` \| `production` | Modo de entorno. Predeterminado: `development`. En `production` impone restricciones estrictas de CORS. |
| `DATABASE_URL` | URL PostgreSQL válida (`postgres://` o `postgresql://`) | Conexión obligatoria a PostgreSQL. Debe incluir host y nombre de base de datos. Se sanitizan contraseñas en logs. |
| `PORT` | Entero entre `1` y `65535` | Puerto de escucha HTTP. Predeterminado: `3001`. |
| `JWT_SECRET` | String (mínimo 32 caracteres) | Secreto criptográfico obligatorio para firma y verificación de tokens. Se rechaza el valor placeholder de ejemplo. |
| `JWT_EXPIRES_IN` | String con unidad explícita (`s`, `m`, `h`, `d`) | Tiempo de validez del JWT (ej. `30s`, `15m`, `1h`, `7d`). Predeterminado: `7d`. No admite enteros sin unidad. |
| `CORS_ORIGINS` | Lista separada por comas de URLs HTTP(S) | Allowlist de orígenes autorizados para CORS. En `production` es obligatoria y no admite `*` ni `null`. En `development` usa por defecto `http://localhost:5173,http://127.0.0.1:5173`. |

---

## 4. Ciclo de Preparación y Release (Paso a Paso)

El despliegue de una nueva versión o el aprovisionamiento de un entorno sigue estrictamente cuatro fases secuenciales:

```
+-------------------+      +-----------------------+      +-------------------+      +-----------------------+
|  1. db:precheck   | ---> | 2. prisma migrate dep | ---> | 3. Iniciar API    | ---> | 4. Seed Demostración  |
|  (Solo lectura)   |      |    (Paso de release)  |      |    (npm start)    |      |    (Exclusivo lab)    |
+-------------------+      +-----------------------+      +-------------------+      +-----------------------+
```

### Paso 1: Verificación de Estado (`db:precheck`)
Antes de ejecutar cualquier comando de mutación o despliegue, ejecutar la utilidad de diagnóstico:
```bash
# Desde contenedor Docker:
docker run --rm --network host --env-file .env urbanfix-backend npm run db:precheck

# O en entorno local:
npm run db:precheck
```
- Si reporta `CLEAN_DATABASE`: la base está vacía en `public`, apta para aplicar migraciones canónicas directas.
- Si reporta `CANONICAL_FULLY_UPDATED`: la base ya contiene las 3 migraciones canónicas y no requiere cambios de DDL.
- Si reporta `CANONICAL_INITIAL_NEEDS_UPGRADE`: base preexistente de semana 3; **no aplicar migrate directo**, seguir el procedimiento conservador de `MIGRATION_GUIDE.md`.
- Si reporta estados bloqueados (`CHECKSUM_MISMATCH`, `FAILED_MIGRATION_PENDING`, `LEGACY_UNSUPPORTED`): abortar el despliegue.

### Paso 2: Aplicación Explícita de Migraciones
Una vez validado el estado, ejecutar el comando de release:
```bash
# Desde contenedor Docker:
docker run --rm --network host --env-file .env urbanfix-backend npx prisma migrate deploy

# O con Compose:
docker compose run --rm api npm run db:migrate
```
- Aplica ordenadamente las migraciones canónicas:
  1. `20261007000000_init`
  2. `20261011212651_add_last_login_to_usuario`
  3. `20261011230000_feat_rechazo_vuelve_a_pendiente`
- La ejecución repetida es **idempotente** e informa: `No pending migrations to apply`.

### Paso 3: Arranque de la API
Iniciar el servicio HTTP:
```bash
# Directo con Docker:
docker run -d --name urbanfix-api -p 3001:3001 --env-file .env urbanfix-backend

# Con Compose:
docker compose up -d api
```
- La API arranca validando la configuración en memoria.
- No altera tablas ni usuarios en la base de datos.
- Las sondas `/health` y `/ready` pasan a estar disponibles de inmediato.

### Paso 4: Carga de Datos de Demostración (Opcional, Exclusivo de Laboratorio)
Solo en entornos locales o de pruebas donde se requieran los usuarios de prueba:
```bash
docker compose run --rm api npm run db:seed
# o localmente:
npm run db:seed
```
- Crea mediante `upsert` los usuarios demo (`juan@mail.com`, `carlos@mail.com`, `admin@mail.com` con password `MinimoOchoCaracteres`).
- **PROHIBIDO** ejecutar en entornos productivos.

---

## 5. Sondas de Supervisión Operativa (Liveness y Readiness)

UrbanFix implementa dos sondas HTTP públicas a nivel de raíz:

### 5.1 Liveness Probe: `GET /health`
- **Función:** Monitoreo del ciclo de vida del proceso Node.js / Express.
- **Comportamiento:** Responde `200 OK` mientras el servidor HTTP esté escuchando eventos.
- **Independencia:** No ejecuta consultas a PostgreSQL. Si la base de datos está caída o detenida, `/health` continúa respondiendo `200 OK`, permitiendo al orquestador saber que el contenedor no está congelado ni en bucle infinito.
- **Payload:**
  ```json
  { "status": "ok", "timestamp": "2026-11-20T19:33:35.491Z" }
  ```

### 5.2 Readiness Probe: `GET /ready`
- **Función:** Comprobación estricta de aptitud para recibir tráfico de usuarios.
- **Verificación real:** Ejecuta una consulta ligera mediante el singleton de Prisma (`prisma.$queryRaw`) comprobando la existencia física de las 4 tablas de la aplicación en el esquema `public`:
  - `Usuario`
  - `SolicitudServicio`
  - `HistorialEstadoSolicitud`
  - `RechazoSolicitud`
- **Códigos de Respuesta:**
  - `200 OK`: PostgreSQL responde y el esquema de la aplicación está preparado. La ausencia de filas de datos en una base migrada vacía es completamente válida.
    ```json
    { "status": "ready", "timestamp": "2026-11-20T19:33:44.694Z" }
    ```
  - `503 Service Unavailable`: Emitido si:
    a) PostgreSQL no está accesible o la conexión supera el timeout (`status: unavailable`, `message: Base de datos no disponible`).
    b) La base está vacía o faltan tablas requeridas (`status: unavailable`, `message: Esquema de base de datos no preparado`).
- **Límites de Timeout (Driver y Query):**
  - `connectionTimeoutMillis: 5000` configurado en `PrismaPg`: si el servidor PostgreSQL no responde o hay problemas de conectividad de red, la llamada aborta en `<= 5 segundos`.
  - `statement_timeout: 5000`: cancela sentencias SQL individuales que superen los 5 segundos, evitando consultas colgadas en segundo plano.
  - No crea instancias efímeras de `PrismaClient` ni utiliza `Promise.race` ciego que abandone conexiones activas.
- **Recuperación Automática:** Si PostgreSQL se detiene temporalmente, `/ready` devuelve `503`. Cuando PostgreSQL se reanuda, `/ready` vuelve a responder `200 OK` de forma automática a través del pool de conexiones existente, sin requerir reinicio del proceso ni regeneración de clientes.
- **Confidencialidad:** Las respuestas de error 503 son estrictamente genéricas y nunca exponen credenciales, nombres de bases de datos, hosts ni sintaxis SQL.

---

## 6. Docker Compose Local (`backend/compose.yaml`)

El archivo `backend/compose.yaml` permite levantar el stack de backend de forma reproducible:

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-urbanfix}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-urbanfix_pass}
      POSTGRES_DB: ${POSTGRES_DB:-urbanfix_db}
    ports:
      - "127.0.0.1:${POSTGRES_PORT:-5434}:5432"
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-urbanfix} -d ${POSTGRES_DB:-urbanfix_db}"]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 3s

  api:
    build:
      context: .
      dockerfile: Dockerfile
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "127.0.0.1:${PORT:-3001}:${PORT:-3001}"
    environment:
      NODE_ENV: ${NODE_ENV:-development}
      DATABASE_URL: postgresql://${POSTGRES_USER:-urbanfix}:${POSTGRES_PASSWORD:-urbanfix_pass}@db:5432/${POSTGRES_DB:-urbanfix_db}?schema=public
      PORT: ${PORT:-3001}
      JWT_SECRET: ${JWT_SECRET:-reemplazar-por-un-secreto-propio-aleatorio-32-chars-min}
      JWT_EXPIRES_IN: ${JWT_EXPIRES_IN:-7d}
      CORS_ORIGINS: ${CORS_ORIGINS:-http://localhost:5173,http://127.0.0.1:5173}

volumes:
  db-data:
```

### 6.1 Comandos Habituales
```bash
# Iniciar base de datos aislada
docker compose up -d db

# Aplicar migraciones
docker compose run --rm api npm run db:migrate

# Iniciar API
docker compose up -d api

# Ver logs
docker compose logs -f api

# Detener preservando datos
docker compose stop

# Detener y eliminar contenedores (conservando el volumen de datos)
docker compose down

# Eliminar contenedores y volumen (destructivo para datos de laboratorio)
docker compose down -v
```

### 6.2 Red y Resolución de Hosts: Host vs Contenedor
- **Herramientas en tu máquina (Prisma CLI, Node local, DBeaver):**
  Conectan a `127.0.0.1:5434`.
  Cadena: `postgresql://urbanfix:urbanfix_pass@localhost:5434/urbanfix_db?schema=public`
- **Contenedores dentro de la red Compose (servicio `api`):**
  Conectan al hostname interno `db` en el puerto PostgreSQL estándar `5432`.
  Cadena: `postgresql://urbanfix:urbanfix_pass@db:5432/urbanfix_db?schema=public`

### 6.3 Aislamiento para QA y Multi-instancia
Para evitar colisiones entre suites de pruebas o desarrolladores, Compose admite aislar proyectos mediante el flag `-p` y variables de puerto:
```bash
POSTGRES_PORT=55434 PORT=35001 docker compose -p qa_run_1 up -d db
```
Los volúmenes y redes se nombrarán `qa_run_1_db-data` y `qa_run_1_default`, sin afectar a otras instancias activas.

---

## 7. Procedimiento de Rollback y Recuperación

### 7.1 Fallo en Migraciones de Release
Si `prisma migrate deploy` falla durante la etapa de release:
1. La API **no debe iniciarse**. La sonda `/ready` responderá `503` impidiendo que balanceadores deriven tráfico a una instancia sin esquema.
2. Identificar el fallo en `_prisma_migrations` ejecutando `npm run db:precheck`.
3. Consultar la sección de rollback y resolución de defectos en [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md).
4. No ejecutar `prisma migrate reset` ni `prisma db push` en entornos con datos.

### 7.2 Rollback de Contenedor de API
Si la versión del código de la API presenta regresiones tras arrancar:
1. Revertir la imagen del contenedor a la etiqueta o commit anterior aprobado:
   ```bash
   docker stop urbanfix-api
   docker run -d --name urbanfix-api -p 3001:3001 --env-file .env urbanfix-backend:<tag_anterior>
   ```
2. Verificar que `GET /health` responda `200` y `GET /ready` responda `200`.

---

## 8. Límites Técnicos y Condiciones Previas para Publicación (BE-07)

1. **Sin URLs públicas ni infraestructura ficticia:** Este entregable (BE-06) certifica la preparación operativa local y el artefacto Docker. No define ni publica URLs públicas de demostración.
2. **Requisitos previos para BE-07 / #15:**
   - Aprobación explícita del usuario para contratar o aprovisionar infraestructura pública.
   - Definición de proveedor cloud concreto (ej. VPS, PaaS).
   - Instancia de PostgreSQL persistente y administrada con SSL habilitado.
   - Configuración de certificados TLS/HTTPS.
   - Origen HTTP(S) exacto de la SPA de frontend para configurar `CORS_ORIGINS`.
3. **Control de Versiones y Git:** Todo push a GitHub requiere aprobación explícita del usuario para la rama y commits concretos presentados.
