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
2. **Artefacto reproducible y aislado:** Construido sobre `node:24-bookworm-slim`, bajo usuario no-root (`node`), con dependencias instaladas según `package-lock.json` verificado (`npm ci`) y generación de cliente Prisma sin requerir acceso a bases de datos ni secretos en build-time.
3. **Sondas operativas duales (Liveness y Readiness):** Preservación de `/health` para liveness y adición de `/ready` con verificación de esquema PostgreSQL y límites de timeout acotados (`<= 5s`).
4. **Composición local versionada:** Archivo `backend/compose.yaml` estandarizado para desarrollo y validación de QA con aislamiento de volúmenes, puertos y nombres de proyecto.
5. **Sin publicación inventada:** No se presumen proveedores cloud, dominios ni bases productivas de terceros. La publicación real se gestiona en BE-07 bajo aprobación explícita del usuario.

---

## 2. Artefacto de Contenedor (`Dockerfile` y `.dockerignore`)

### 2.1 Especificación del Dockerfile
El archivo `backend/Dockerfile` implementa las siguientes características:

- **Imagen base:** `node:24-bookworm-slim` (alineada con el entorno de desarrollo y pruebas verificado Node 24).
- **Dependencias de sistema:** Instalación de `openssl` (requerida por el motor de Prisma) con limpieza inmediata de listas de apt (`rm -rf /var/lib/apt/lists/*`).
- **Seguridad y privilegios:** Directorio de trabajo `/app` asignado al usuario `node` (UID/GID 1000). Todos los comandos se ejecutan bajo `USER node`.
- **Instalación de dependencias:** `npm ci` ejecutado sobre `package.json` y `package-lock.json` para reproducibilidad según lockfile verificado.
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
| `DATABASE_URL` | URL PostgreSQL válida (`postgres://` o `postgresql://`) | Conexión obligatoria a PostgreSQL para el proceso. En Compose se alimenta de `DOCKER_DATABASE_URL`. |
| `DOCKER_DATABASE_URL` | URL PostgreSQL con percent-encoding | Conexión interna para contenedores hacia `db:5432`. Se documenta en `.env.example` para su consumo en Compose. |
| `PORT` | Entero entre `1` y `65535` | Puerto de escucha HTTP. Predeterminado: `3001`. |
| `JWT_SECRET` | String (mínimo 32 caracteres) | Secreto criptográfico obligatorio para firma y verificación de tokens. No posee valor por defecto en Compose; si falta, aborta con código 1. |
| `JWT_EXPIRES_IN` | String con unidad explícita (`s`, `m`, `h`, `d`) | Tiempo de validez del JWT (ej. `30s`, `15m`, `1h`, `7d`). Predeterminado: `7d`. No admite enteros sin unidad. |
| `CORS_ORIGINS` | Lista separada por comas de URLs HTTP(S) | Allowlist de orígenes autorizados para CORS. En `production` es obligatoria y no admite `*` ni `null`. En `development` usa por defecto `http://localhost:5173,http://127.0.0.1:5173`. |

> [!NOTE] Comillas en archivos `.env` y Docker CLI
> A diferencia del módulo `dotenv` en Node.js, `docker run --env-file` y Docker Compose no eliminan comillas alrededor de los valores. Al definir variables en archivos `.env` consumidos por Docker, los valores deben escribirse sin comillas (por ejemplo, `JWT_SECRET=un_secreto_seguro_minimo_32_chars_123` y no `"..."`), o bien pasarse explícitamente mediante el argumento `-e VARIABLE=valor`.

### 3.1 Manejo de Caracteres Especiales en Contraseñas (Percent-Encoding)
Si la contraseña de PostgreSQL contiene caracteres reservados de URL (`@`, `#`, `/`, `:`, `%`, etc., por ejemplo `probe@secret#/`):
1. **Contenedor PostgreSQL:** Recibe la contraseña cruda sin codificar (ej. `POSTGRES_PASSWORD="probe@secret#/"`).
2. **Cadenas de Conexión (`DATABASE_URL` y `DOCKER_DATABASE_URL`):** La contraseña debe codificarse según el estándar RFC 3986 mediante percent-encoding:
   - `@` se codifica como `%40`
   - `#` se codifica como `%23`
   - `/` se codifica como `%2F`
   - Ejemplo resultante: `DOCKER_DATABASE_URL="postgresql://urbanfix:probe%40secret%23%2F@db:5432/urbanfix_db?schema=public"`
Al conectarse, el driver `pg` decodifica automáticamente las credenciales, asegurando una autenticación exitosa sin ambigüedades en el host ni en la base de datos.

---

## 4. Flujo Operativo Principal con Docker Compose (`backend/compose.yaml`)

El flujo recomendado utiliza Docker Compose para orquestar la base de datos y la API en una misma red puente (`default`), con configuración homogénea y reproducible.

### Paso 1: Configurar Variables
Crear `backend/.env` a partir de `backend/.env.example`:
```bash
cp .env.example .env
```
Asegurarse de definir `JWT_SECRET` con un secreto seguro de al menos 32 caracteres y revisar `DOCKER_DATABASE_URL`.

### Paso 2: Construir la Imagen
```bash
docker compose build
```

### Paso 3: Iniciar la Base de Datos
```bash
docker compose up -d db
```
El contenedor PostgreSQL 16 Alpine arrancará y ejecutará su healthcheck interno (`pg_isready`). Esperar a que su estado sea `healthy` antes de continuar:
```bash
docker compose ps db
```

### Paso 4: Pre-check de Estado de Base de Datos
Ejecutar la herramienta de diagnóstico de solo lectura dentro de la misma red de Compose:
```bash
docker compose run --rm api npm run db:precheck
```
- Debe reportar `CLEAN_DATABASE` (exit 0) sobre una base recién creada, o `CANONICAL_FULLY_UPDATED` sobre una base al día.
- Si reporta `CANONICAL_INITIAL_NEEDS_UPGRADE`, seguir el procedimiento conservador de `MIGRATION_GUIDE.md` antes de migrar.

### Paso 5: Aplicar Migraciones Canónicas (Paso de Release)
```bash
docker compose run --rm api npm run db:migrate
```
Aplica de forma secuencial e idempotente las 3 migraciones canónicas:
1. `20261007000000_init`
2. `20261011212651_add_last_login_to_usuario`
3. `20261011230000_feat_rechazo_vuelve_a_pendiente`

### Paso 6: Iniciar el Servicio API
```bash
docker compose up -d api
```
La API arranca y escucha en `127.0.0.1:3001` sin sembrar datos ni aplicar DDL.

### Paso 7: Comprobar Sondas Operativas
```bash
curl --fail http://127.0.0.1:3001/health
curl --fail http://127.0.0.1:3001/ready
```
- `/health` responde `200` con `{ "status": "ok", "timestamp": "..." }`.
- `/ready` responde `200` con `{ "status": "ready", "timestamp": "..." }`.
- La base contiene 0 usuarios creados automáticamente.

### Paso 8: Carga Opcional de Datos Demo (Solo Laboratorio)
Exclusivamente si se requiere probar flujos de usuario en entorno de desarrollo local:
```bash
docker compose run --rm api npm run db:seed
```

### Paso 9: Detención, Reinicio y Persistencia
- Reiniciar API: `docker compose restart api`
- Detener stack conservando datos: `docker compose stop` o `docker compose down` (el volumen `db-data` se preserva intacto).
- **ADVERTENCIA:** No utilizar `docker compose down -v` salvo que se desee purgar explícitamente la base de datos de pruebas.

---

## 5. Flujo Operativo Secundario: Docker Directo (Sin Compose)

Para entornos donde no se utilice Docker Compose, debe emplearse una red Docker propia dedicada para que todas las fases compartan la misma resolución de nombres y conectividad.

```bash
# 1. Crear red y volumen dedicados
docker network create urbanfix-net
docker volume create urbanfix-db-data

# 2. Construir la imagen con tag específico
docker build -t urbanfix-backend:latest .

# 3. Iniciar PostgreSQL 16 Alpine en la red dedicada
docker run -d --name urbanfix-postgres \
  --network urbanfix-net \
  -v urbanfix-db-data:/var/lib/postgresql/data \
  -e POSTGRES_USER=urbanfix \
  -e POSTGRES_PASSWORD=urbanfix_pass \
  -e POSTGRES_DB=urbanfix_db \
  postgres:16-alpine

# Esperar a que PostgreSQL acepte conexiones
until docker exec urbanfix-postgres pg_isready -U urbanfix -d urbanfix_db; do
  sleep 1
done

# 4. Precheck de estado (en la misma red urbanfix-net)
docker run --rm --network urbanfix-net \
  -e DATABASE_URL="postgresql://urbanfix:urbanfix_pass@urbanfix-postgres:5432/urbanfix_db?schema=public" \
  urbanfix-backend:latest npm run db:precheck

# 5. Aplicar migraciones canónicas (en la misma red urbanfix-net)
docker run --rm --network urbanfix-net \
  -e DATABASE_URL="postgresql://urbanfix:urbanfix_pass@urbanfix-postgres:5432/urbanfix_db?schema=public" \
  urbanfix-backend:latest npx prisma migrate deploy

# 6. Iniciar la API (en la misma red urbanfix-net, publicando el puerto al host)
docker run -d --name urbanfix-api \
  --network urbanfix-net \
  -p 127.0.0.1:3001:3001 \
  -e NODE_ENV=development \
  -e DATABASE_URL="postgresql://urbanfix:urbanfix_pass@urbanfix-postgres:5432/urbanfix_db?schema=public" \
  -e PORT=3001 \
  -e JWT_SECRET="un_secreto_seguro_de_mas_de_32_caracteres_longitud" \
  -e CORS_ORIGINS="http://localhost:5173,http://127.0.0.1:5173" \
  urbanfix-backend:latest

# 7. Verificar sondas
curl --fail http://127.0.0.1:3001/health
curl --fail http://127.0.0.1:3001/ready
```

### 5.1 Procedimiento de Rollback Seguro de la API (Sin Conflicto de Nombre)
Si la versión desplegada de la API presenta problemas y se desea volver a una imagen anterior:
```bash
# 1. Detener y remover el contenedor actual para liberar el nombre del recurso
docker stop urbanfix-api && docker rm urbanfix-api
# (O alternativamente en un solo paso: docker rm -f urbanfix-api)

# 2. Desplegar la imagen previa aprobada utilizando el mismo nombre y configuración
docker run -d --name urbanfix-api \
  --network urbanfix-net \
  -p 127.0.0.1:3001:3001 \
  -e NODE_ENV=development \
  -e DATABASE_URL="postgresql://urbanfix:urbanfix_pass@urbanfix-postgres:5432/urbanfix_db?schema=public" \
  -e PORT=3001 \
  -e JWT_SECRET="un_secreto_seguro_de_mas_de_32_caracteres_longitud" \
  urbanfix-backend:<tag_anterior>

# 3. Comprobar recuperación
curl --fail http://127.0.0.1:3001/ready
```

---

## 6. Sondas de Supervisión y Alcance Técnico (`/health` vs `/ready`)

### 6.1 `GET /health` (Liveness)
- Verifica únicamente que el hilo principal del proceso Node.js responde y acepta conexiones HTTP.
- Devuelve `200 OK` incluso si PostgreSQL está caído o desconectado.
- Evita que los orquestadores reinicien innecesariamente la API durante una indisponibilidad transitoria de la base de datos.

### 6.2 `GET /ready` (Readiness)
- Verifica que el servicio está preparado para atender peticiones de negocio consultando activamente a PostgreSQL a través del singleton de Prisma (`prisma.$queryRaw`).
- Comprueba la existencia de las 4 tablas esenciales del modelo de aplicación en el esquema `public`:
  - `Usuario`
  - `SolicitudServicio`
  - `HistorialEstadoSolicitud`
  - `RechazoSolicitud`
- **Límites y alcance:** `/ready` comprueba la presencia de las tablas y la conectividad activa. **No realiza un análisis exhaustivo de columnas ni verificación de checksums de migraciones** en cada petición HTTP (dicho análisis exhaustivo corresponde al paso de release mediante `npm run db:precheck`).
- **Comportamiento ante base vacía:** Si las migraciones no han sido aplicadas, devuelve `503 Service Unavailable` con `{ "status": "unavailable", "message": "Esquema de base de datos no preparado" }`.
- **Comportamiento ante base con 0 filas:** Si la base fue migrada pero aún no contiene registros de usuarios ni solicitudes, responde `200 OK` normalmente (la ausencia de datos no es un error de readiness).
- **Timeouts acotados de driver y consulta (SLA <= 5s garantizado):**
  - `connectionTimeoutMillis: 4000` en el pool de `PrismaPg`: limita los intentos de conexión nueva ante caídas de red o puertos mudos a un máximo de 4 segundos.
  - `query_timeout: 4000` en el pool de `pg`: límite del lado del cliente que aborta la consulta y destruye el socket si el servidor PostgreSQL se suspende, congela o pausa (`docker pause`) sobre un socket ya establecido (warm pool).
  - `statement_timeout: 4000`: cancela sentencias SQL individuales en el servidor PostgreSQL que superen los 4 segundos.
  - Al combinarse `query_timeout: 4000` con `connectionTimeoutMillis: 4000`, cualquier congelamiento o caída de la base responde `503 Service Unavailable` de forma determinista en `<= 4s` (respetando estrictamente el SLA de `<= 5s`), expulsando el socket colgado del pool sin dejar tareas colgadas y reanudando el servicio en cuanto la base vuelve a estar disponible.
- **Resiliencia y autorecuperación:** Si PostgreSQL se detiene o se pausa temporalmente, `/ready` devuelve `503` en `<= 4s`. Al reanudarse PostgreSQL (`docker unpause` o reinicio del contenedor), el pool restablece la conexión y `/ready` vuelve a responder `200 OK` de forma automática, sin requerir reinicio del proceso API.
- **Confidencialidad:** Las respuestas `503` nunca exponen cadenas de conexión, contraseñas, nombres de tablas ni fragmentos de errores SQL.

---

## 7. Límites Técnicos y Condiciones Previas para Publicación (BE-07)

1. **Sondas Locales vs Despliegue Público:**
   Un resultado `200 OK` en `/health` y `/ready` en localhost o Docker Compose certifica la operabilidad del proceso y la consistencia del esquema local; **no certifica que el sistema esté listo para producción ni publicado en internet**.
2. **Requisitos Pendientes para BE-07 / #15:**
   - Autorización explícita del usuario para aprovisionar y publicar servicios.
   - Definición de proveedor cloud concreto de hosting y base de datos (PostgreSQL administrado con SSL obligatorio).
   - Configuración de certificados TLS/HTTPS y dominio público.
   - Origen HTTP(S) definitivo de la SPA de frontend para configurar `CORS_ORIGINS`.
3. **Control de Versiones y Git:**
   Todo push a GitHub requiere aprobación explícita del usuario para la rama y commits concretos presentados.
