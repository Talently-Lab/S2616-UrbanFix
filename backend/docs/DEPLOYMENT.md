# Guía de Preparación de Despliegue y Operación — UrbanFix (BE-06)

## 1. Contexto y Objetivos Arquitectónicos

Este documento define la arquitectura operativa, la especificación del artefacto de contenedor y los procedimientos de despliegue local y de release para el backend de UrbanFix, resolviendo la [issue #14](https://github.com/Talently-Lab/S2616-UrbanFix/issues/14) (BE-06) y consolidando las observaciones editoriales (E1 y E2) identificadas en la revisión de QA.

### 1.1 El Problema Previo
En revisiones anteriores:
- El `Dockerfile` ejecutaba de manera encadenada y automática `prisma migrate deploy && node prisma/seed.js && node src/index.js` en su comando de arranque (`CMD`).
- Esta práctica causaba efectos colaterales destructivos: aplicaba mutaciones de DDL automáticamente al arrancar la API y sembraba usuarios demo de laboratorio (`juan@mail.com`, `carlos@mail.com`, `admin@mail.com`) en cualquier entorno.
- No existía una configuración de Docker Compose versionada en el repositorio para desarrollo y pruebas locales homogéneas.
- La API solo exponía `GET /health`, el cual verifica únicamente si el proceso Node.js responde, sin verificar conectividad real con PostgreSQL ni estado de preparación del esquema relacional (readiness).

### 1.2 Principios de la Solución (BE-06)
1. **Separación estricta de responsabilidades:** El arranque del servidor HTTP (`src/index.js`) levanta **exclusivamente** el servicio con su configuración validada. Las migraciones son un paso previo explícito de preparación/release, y el seed es un comando opcional de laboratorio.
2. **Artefacto reproducible y aislado:** Construido sobre `node:24-bookworm-slim`, bajo usuario sin privilegios (`node`), con dependencias instaladas según `package-lock.json` verificado (`npm ci`) y generación determinista del cliente Prisma sin requerir acceso a bases de datos ni secretos en build-time.
3. **Sondas operativas duales (Liveness y Readiness):** Preservación de `/health` para liveness y adición de `/ready` con verificación de tablas esenciales de PostgreSQL y límites de timeout acotados por fase (`connectionTimeoutMillis: 4000`, `query_timeout: 4000`, `statement_timeout: 4000`).
4. **Composición local versionada:** Archivo `backend/compose.yaml` estandarizado para desarrollo y validación de QA con aislamiento de volúmenes, puertos y nombres de proyecto.
5. **Sin publicación inventada:** La issue #15 (BE-07, despliegue público) está excluida del ciclo por instrucción explícita del usuario. No se presumen proveedores cloud, dominios ni bases productivas de terceros.

---

## 2. Artefacto de Contenedor (`Dockerfile` y `.dockerignore`)

### 2.1 Especificación del Dockerfile
El archivo `backend/Dockerfile` implementa las siguientes características:

- **Imagen base:** `node:24-bookworm-slim` (alineada con el entorno de desarrollo y pruebas verificado Node 24).
- **Dependencias de sistema:** Instalación de `openssl` (requerida por el motor de Prisma) con limpieza inmediata de listas de apt (`rm -rf /var/lib/apt/lists/*`).
- **Seguridad y privilegios:** Directorio de trabajo `/app` asignado al usuario `node` (UID/GID 1000). Todos los comandos se ejecutan bajo `USER node`.
- **Instalación de dependencias:** `npm ci` ejecutado sobre `package.json` y `package-lock.json` para reproducibilidad estricta según el lockfile verificado.
  > [!NOTE] Límites de Reproducibilidad a Nivel de Bits
  > La instalación mediante `npm ci` garantiza árboles de dependencias de Node.js deterministas según `package-lock.json`. No obstante, el uso de tags base de sistema operativo (`node:24-bookworm-slim`) y paquetes de distribución (`apt-get`) puede recibir actualizaciones de parches de seguridad upstream, por lo que no se promete un hash SHA-256 de imagen idéntico a nivel de bits con el transcurso del tiempo.
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
  Inicia el servidor HTTP sin ejecutar migraciones ni seeds automáticos.

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
| `JWT_SECRET` | String (mínimo 32 caracteres) | Secreto criptográfico obligatorio para firma y verificación de tokens. No posee valor por defecto en Compose; si falta o usa el placeholder, aborta con código 1. |
| `JWT_EXPIRES_IN` | String con unidad explícita (`s`, `m`, `h`, `d`) | Tiempo de validez del JWT (ej. `30s`, `15m`, `1h`, `7d`). Predeterminado: `7d`. No admite enteros sin unidad. |
| `CORS_ORIGINS` | Lista separada por comas de URLs HTTP(S) | Allowlist de orígenes autorizados para CORS. En `production` es obligatoria y no admite `*` ni `null`. En `development` usa por defecto `http://localhost:5173,http://127.0.0.1:5173`. |

> [!NOTE] Comportamiento de Comillas en Archivos `.env` (Resolución E1)
> Existe una diferencia fundamental en cómo las herramientas de contenedores procesan los archivos `.env`:
> - **Docker Compose:** Interpreta el archivo `.env` y **elimina automáticamente las comillas** exteriores alrededor de los valores.
> - **Docker CLI (`docker run --env-file`):** **Conserva las comillas literales** como parte del valor inyectado a la variable de entorno.
> Por lo tanto, si ejecutas contenedores directos mediante `docker run --env-file .env`, asegúrate de definir las variables sin comillas (ej. `JWT_SECRET=secreto_seguro_minimo_32_chars_123` y no `"..."`), o utiliza el argumento explícito `-e VARIABLE=valor`.

### 3.1 Manejo de Caracteres Especiales en Contraseñas (Percent-Encoding)
Si la contraseña de PostgreSQL contiene caracteres reservados de URL (`@`, `#`, `/`, `:`, `%`, etc., por ejemplo `probe@secret#/`):
1. **Contenedor PostgreSQL:** Recibe la contraseña cruda sin codificar (ej. `POSTGRES_PASSWORD="probe@secret#/"`).
2. **Cadenas de Conexión (`DATABASE_URL` y `DOCKER_DATABASE_URL`):** La contraseña debe codificarse según el estándar RFC 3986 mediante percent-encoding:
   - `@` se codifica como `%40`
   - `#` se codifica como `%23`
   - `/` se codifica como `%2F`
   - Ejemplo resultante: `DOCKER_DATABASE_URL="postgresql://urbanfix:probe%40secret%23%2F@db:5432/urbanfix_db?schema=public"`
Al conectarse, el driver `pg` decodifica automáticamente las credenciales, asegurando una autenticación exitosa.

---

## 4. Flujo Operativo Principal con Docker Compose (`backend/compose.yaml`)

El flujo recomendado utiliza Docker Compose para orquestar la base de datos y la API en una misma red puente, con configuración homogénea y reproducible.

### Paso 1: Configurar Variables
Crear `backend/.env` a partir de `backend/.env.example`:
```bash
cp -n .env.example .env
```
Generar un secreto seguro de al menos 32 caracteres para `JWT_SECRET` y verificar `DOCKER_DATABASE_URL`.

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
La API arranca y escucha en `127.0.0.1:3001` sin sembrar datos ni aplicar DDL automáticamente.

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

### 5.1 Procedimiento de Rollback Seguro de la API
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

> [!WARNING] Alcance del Rollback de Imagen y Esquema de Base de Datos
> El procedimiento anterior reemplaza exclusivamente el contenedor ejecutable de la API. **Revertir la imagen no revierte automáticamente el esquema ni los datos en PostgreSQL**. Antes de desplegar una versión previa, debe verificarse si el esquema actual es compatible hacia atrás con la imagen anterior. Los volúmenes de datos (`urbanfix-db-data` o `backend_db-data`) deben conservarse intactos; nunca deben eliminarse para intentar resolver discrepancias de versión de software.

---

## 6. Sondas de Supervisión y Alcance Técnico (`/health` vs `/ready`)

### 6.1 `GET /health` (Liveness)
- Verifica únicamente que el hilo principal del proceso Node.js responde y acepta peticiones HTTP.
- Devuelve `200 OK` de forma inmediata sin consultar a PostgreSQL.
- Evita que los orquestadores reinicien innecesariamente la API durante caídas o reinicios transitorios del motor de base de datos.

### 6.2 `GET /ready` (Readiness)
- Verifica que el servicio está preparado para atender tráfico de negocio consultando activamente a PostgreSQL a través del singleton de Prisma (`prisma.$queryRaw`).
- Comprueba la existencia física de las 4 tablas esenciales del modelo de aplicación en el esquema `public`:
  - `Usuario`
  - `SolicitudServicio`
  - `HistorialEstadoSolicitud`
  - `RechazoSolicitud`
- **Límites y alcance:** `/ready` comprueba la presencia de las tablas y la conectividad activa. **No realiza un análisis exhaustivo de columnas ni verificación de checksums de migraciones** en cada petición HTTP (dicho análisis exhaustivo corresponde al paso previo de release mediante `npm run db:precheck`).
- **Comportamiento ante base vacía:** Si las migraciones no han sido aplicadas, devuelve `503 Service Unavailable` con `{ "status": "unavailable", "message": "Esquema de base de datos no preparado" }`.
- **Comportamiento ante base con 0 filas:** Si la base fue migrada pero aún no contiene registros de usuarios ni solicitudes, responde `200 OK` normalmente (la ausencia de datos no es un error de readiness).
- **Timeouts acotados de driver y consulta por fase (Resolución E2):**
  - `connectionTimeoutMillis: 4000` en el pool de `PrismaPg`: limita a 4 segundos los intentos de abrir una nueva conexión TCP ante caídas de red o puertos mudos.
  - `query_timeout: 4000` en el cliente `pg`: límite del lado del cliente que aborta la consulta y destruye el socket si el servidor PostgreSQL se suspende, congela o pausa (`docker pause`) sobre un socket ya establecido (warm pool).
  - `statement_timeout: 4000`: cancela sentencias SQL individuales en el servidor PostgreSQL que superen los 4 segundos.
  - **Límites de la afirmación temporal:** Cada uno de estos timeouts opera de forma independiente por fase. No constituyen una garantía universal end-to-end de `<= 4s` ni un SLA absoluto bajo cualquier combinación de fallos múltiples o congestión extrema. En los escenarios de prueba verificados por QA (PostgreSQL pausado con socket caliente), `/ready` respondió con código `503` en ~4.005–4.012s más el margen de transporte HTTP.
- **Resiliencia y autorecuperación:** Al fallar por timeout, el socket averiado es purgado del pool de conexiones. Cuando PostgreSQL se reanuda (`docker unpause` o reinicio), el pool restablece conexiones limpias y `/ready` vuelve a responder `200 OK` de forma automática, sin requerir reinicio del proceso API.
- **Confidencialidad:** Las respuestas `503` nunca exponen cadenas de conexión, contraseñas, nombres de tablas ni fragmentos de errores SQL.

---

## 7. Límites Técnicos y Alcance del Ciclo (Exclusión de BE-07)

1. **Sondas Locales vs Producción Pública:**
   Un resultado `200 OK` en `/health` y `/ready` en localhost o Docker Compose certifica la operabilidad del proceso y la consistencia del esquema local; **no certifica que el sistema esté publicado en internet ni listo para tráfico masivo sin infraestructura dedicada**.
2. **Exclusión de la Issue #15 (BE-07):**
   Por instrucción explícita del usuario, la issue #15 (publicación y verificación pública) ha quedado excluida de este ciclo. Por consiguiente:
   - No se solicita información de hosting, credenciales de cloud ni URLs públicas.
   - No se aprovisionan servicios de terceros ni bases gestionadas en la nube.
   - No se inventa una URL de demo pública ni se promete disponibilidad en internet.
3. **Control de Versiones y Git:**
   Todo push a GitHub requiere aprobación explícita del usuario para la rama y commits concretos presentados.
