# UrbanFix — Backend

API REST para registro y autenticación, gestión de perfiles, solicitudes de servicio, bolsa de trabajo y asignación de técnicos, historial cronológico auditado y administración de usuarios.

## Stack y Estructura

- Node.js con módulos ES nativos (`type: "module"`); entorno verificado: Node 24.
- Express 5, PostgreSQL 16, Prisma 7 y `@prisma/adapter-pg`.
- Autenticación JWT con `jsonwebtoken`, contraseñas con `bcryptjs` (salt rounds 10) y validación de esquemas con Zod 4.
- npm para gestión de paquetes y nodemon para desarrollo local. QA y laboratorio utilizan PostgreSQL 16 oficial.

Estructura bajo `backend/`:
- `src/index.js`: punto de entrada del servidor Express, sondas `/health` y `/ready`, y middleware global de errores.
- `src/config/`: configuración y validación de variables de entorno (`env.js`) y cliente Prisma con adapter (`prisma.js`).
- `src/routes/`: definición y montaje de rutas modulares (`auth`, `usuario`, `admin`, `categoria`, `solicitud`).
- `src/controllers/`: manejo de peticiones HTTP, extracción de datos y respuestas JSON estándar.
- `src/services/`: reglas de negocio, persistencia relacional, transacciones y control de concurrencia.
- `src/schemas/`: esquemas de validación de entrada con Zod.
- `src/middlewares/`: autenticación (`authenticate`), autorización RBAC (`authorize`), validación Zod (`validate`) y CORS (`createCorsMiddleware`).
- `prisma/`: modelo relacional (`schema.prisma`), migraciones canónicas versionadas y script de seed (`seed.js`).
- `docs/`: especificación de contrato (`API_CONTRACT.md`), guía de migraciones (`MIGRATION_GUIDE.md`), guía operativa (`DEPLOYMENT.md`) y reportes de QA (`qa/`).
- `tests/`: suites de integración HTTP (`tests/api/`) y matriz de verificación de ciclo de vida de migraciones (`tests/migrations/`).

El modelo relacional vincula `Usuario`, `SolicitudServicio`, `HistorialEstadoSolicitud` y `RechazoSolicitud`. La especialidad u oficio se representa mediante la categoría de la solicitud; no existe una tabla `Servicio` independiente.

## Estado de Git y Ramas

Los únicos commits del backend autorizados y publicados en el repositorio remoto corresponden a las entregas de las issues #9 y #10 hasta el commit `e40b9ba` en la rama `chore/backend-orchestration`.

Todas las implementaciones y validaciones posteriores (BE-03 en `f207fd7`/`18806f6`, BE-04 en `bbcbce2`/`a682f86`, BE-06 en `941c98a`/`bdf4418`/`9311222`, y la presente consolidación BE-05) viven de forma integrada en la rama de trabajo local (`GonzaCarrillo/be-13-api-docs` / `chore/backend-orchestration`). La rama `main` en remoto no contiene este trabajo todavía.

> [!IMPORTANT] Control Estricto de Pushes
> **Todo push a GitHub requiere aprobación explícita del usuario**, especificando la rama y los commits concretos que se presenten. Prohibido ejecutar push, abrir Pull Requests, realizar merge o alterar ramas remotas sin dicha autorización.

## Instalación y Configuración Local

Requisitos:
- Node.js 24 y npm.
- PostgreSQL 16 accesible (vía Docker, Docker Compose o instalación local).
- Puertos libres predeterminados: `5434` para PostgreSQL y `3001` para la API HTTP.

### 1. Obtener o Ubicar el Repositorio

#### Opción 1: Nuevo clon desde repositorio remoto (limitado a entregas publicadas)
```bash
git clone https://github.com/Talently-Lab/S2616-UrbanFix.git
cd S2616-UrbanFix/backend
# La rama publicada con entregas aprobadas hasta hoy (#9/#10) es chore/backend-orchestration (commit e40b9ba):
git checkout chore/backend-orchestration
npm ci
cp -n .env.example .env
```
*(Nota sobre ramas remotas: tal como se detalla en "Estado de Git", el repositorio remoto contiene únicamente las entregas publicadas hasta `e40b9ba`. Los avances posteriores de BE-03, BE-04, BE-06 y BE-05 residen actualmente en las ramas de trabajo locales y se publicarán cuando el usuario lo autorice).*

#### Opción 2: Espacio de trabajo o checkout local existente
Si ya estás trabajando sobre una copia local de la rama de trabajo:
```bash
cd backend
npm ci
cp -n .env.example .env
```
*(El modificador `-n` preserva un archivo `.env` previo si ya existía en tu espacio de trabajo).*

### 2. Base de Datos Local

#### Opción A: Levantar PostgreSQL con Docker Compose (Recomendada)
```bash
docker compose up -d db
```
Inicia PostgreSQL 16 Alpine con comprobación de salud (`pg_isready`) y volumen persistente nombrado `db-data` (nombrado por Docker Compose como `<proyecto>_db-data`, por ejemplo `backend_db-data` en una estructura estándar de directorios), exponiendo el puerto `127.0.0.1:5434`.

#### Opción B: Contenedor PostgreSQL directo con Docker
```bash
docker run --detach --name urbanfix-postgres-local \
  --publish 127.0.0.1:5434:5432 \
  --env POSTGRES_USER=urbanfix \
  --env POSTGRES_PASSWORD=urbanfix_pass \
  --env POSTGRES_DB=urbanfix_db \
  --volume urbanfix-postgres-local-data:/var/lib/postgresql/data \
  postgres:16-alpine

docker exec urbanfix-postgres-local pg_isready -U urbanfix -d urbanfix_db
```

### 3. Configurar Variables de Entorno

Generar un secreto criptográfico seguro e insertarlo en la variable `JWT_SECRET` de `.env`:
```bash
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('hex'))"
```

Valores clave en `backend/.env`:
```dotenv
NODE_ENV=development
DATABASE_URL="postgresql://urbanfix:urbanfix_pass@localhost:5434/urbanfix_db?schema=public"
DOCKER_DATABASE_URL="postgresql://urbanfix:urbanfix_pass@db:5432/urbanfix_db?schema=public"
PORT=3001
JWT_SECRET="pegar_el_secreto_generado_de_al_menos_32_caracteres"
JWT_EXPIRES_IN=7d
CORS_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"
```

| Variable | Tipo / Restricción | Uso y Comportamiento |
|---|---|---|
| `NODE_ENV` | `development` \| `test` \| `production` | Entorno de ejecución (predeterminado: `development`). |
| `DATABASE_URL` | URL PostgreSQL válida | Conexión para Prisma CLI y la API desde el host. Requiere protocolo `postgres:` o `postgresql:`, host y base. |
| `DOCKER_DATABASE_URL` | URL PostgreSQL con percent-encoding | Conexión interna para contenedores dentro de Compose hacia el host `db:5432`. Si la contraseña contiene caracteres reservados (`@`, `#`, `/`, `%`), debe codificarse según RFC 3986 (ej. `probe%40secret%23%2F`). |
| `PORT` | Entero entre 1 y 65535 | Puerto HTTP de la API (predeterminado: `3001`). |
| `JWT_SECRET` | String (mínimo 32 caracteres) | Secreto para firma y verificación de JWT. No tiene fallback; el proceso aborta al arrancar si falta o si mantiene el placeholder de ejemplo. |
| `JWT_EXPIRES_IN` | Entero con unidad (`s`, `m`, `h`, `d`) | Tiempo de validez del token (ej. `30m`, `1h`, `7d`; predeterminado: `7d`). Se rechazan números sin unidad para evitar ambigüedades. |
| `CORS_ORIGINS` | Lista separada por comas de URLs HTTP(S) | En `development` y `test` usa por defecto localhost. En `production` exige una lista explícita no vacía (rechaza `*` y `null`). Peticiones sin `Origin` (curl, health probes, server-to-server) se admiten normalmente. |
| `TEST_DATABASE_URL` | URL PostgreSQL exclusiva | Requerida para `npm run test:migrations` y opcional para `npm test`. Debe apuntar a un servidor de pruebas con privilegio `CREATEDB`. Por seguridad, nunca se hace fallback a `DATABASE_URL`. |

> [!NOTE] Validación Temprana en Memoria
> Al arrancar (`src/index.js`), el módulo `src/config/env.js` valida la configuración antes de abrir puertos HTTP o contactar a PostgreSQL. Si alguna variable es inválida, el proceso aborta con código 1 indicando el error de forma limpia, sin exponer secretos ni cadenas de conexión en los logs. Las tareas CLI de Prisma (`validate`, `generate`, `migrate`, `seed` y `db:precheck`) no requieren `JWT_SECRET` ni `CORS_ORIGINS`.

### 4. Preparar Esquema y Migraciones

```bash
npx prisma validate
npx prisma generate
```

Antes de aplicar cambios, verificar el estado de la base de datos:
```bash
npm run db:precheck
```
*(Si las variables no están exportadas en la shell, ejecutar `node --env-file=.env tests/migrations/migration-precheck.js`).*

- Si reporta `CLEAN_DATABASE` (base vacía), aplicar las migraciones canónicas:

```bash
npm run db:migrate
```
- Si reporta `CANONICAL_INITIAL_NEEDS_UPGRADE` (base existente de semana 3 con datos), **no ejecutar migrate directo**; seguir el procedimiento conservador detallado en la [Guía de Migraciones](./docs/MIGRATION_GUIDE.md).

### 5. Datos de Demostración (Opcional, Solo Laboratorio)

```bash
npm run db:seed
```
El seed es idempotente (`upsert`); crea tres cuentas de prueba y una solicitud inicial con historial. No altera contraseñas de usuarios que ya existan y **nunca debe ejecutarse en entornos productivos**.

| Rol | Correo | Contraseña inicial de demostración |
|---|---|---|
| `CLIENTE` | `juan@mail.com` | `MinimoOchoCaracteres` |
| `TECNICO` | `carlos@mail.com` | `MinimoOchoCaracteres` |
| `ADMIN` | `admin@mail.com` | `MinimoOchoCaracteres` |

*Nota:* El registro público (`POST /api/auth/register`) únicamente permite crear usuarios con rol `CLIENTE` o `TECNICO`. Los administradores provienen del seed o de reasignación interna por otro administrador.

### 6. Iniciar la API y Verificar

```bash
npm run dev
```

En otra terminal, comprobar las sondas operativas y un endpoint público:
```bash
curl --fail http://localhost:3001/health
curl --fail http://localhost:3001/ready
curl --fail http://localhost:3001/api/categorias
```

- `/health` (Liveness): Responde `200 OK` con `{ "status": "ok" }` verificando que el proceso Node.js está activo.
- `/ready` (Readiness): Responde `200 OK` con `{ "status": "ready" }` solo si PostgreSQL responde y las 4 tablas del modelo existen físicamente. Timeouts acotados por fase (`connectionTimeoutMillis: 4000`, `query_timeout: 4000`, `statement_timeout: 4000`). En mediciones de QA bajo pausa de base de datos (`docker pause`), respondió `503` en ~4.005–4.012s, recuperando automáticamente el servicio al reanudar la base. No realiza verificación de drift completo ni checksums en cada petición (dicho análisis exhaustivo corresponde a `db:precheck`).

---

## Comandos del Proyecto

Todos los comandos se ejecutan desde el directorio `backend/`:

| Comando | Función / Propósito |
|---|---|
| `npm run dev` | Inicia el servidor HTTP en modo desarrollo con nodemon (recarga automática). |
| `npm start` | Inicia el servidor HTTP en modo producción (`node src/index.js`); no ejecuta migraciones ni seed. |
| `npm run db:precheck` | Herramienta de auditoría de solo lectura; valida ledger, checksums SHA-256 y tablas físicas. |
| `npm run db:migrate` | Ejecuta `prisma migrate deploy` aplicando las migraciones canónicas pendientes. |
| `npm run db:seed` | Puebla cuentas y registros de demostración en base local de laboratorio. |
| `npm run db:studio` | Abre interfaz gráfica Prisma Studio contra la base configurada en `DATABASE_URL`. |
| `npm test` | Suite de 78 pruebas de integración HTTP (`tests/api/runner.js`). Levanta un contenedor efímero PostgreSQL 16 aislado (o utiliza `TEST_DATABASE_URL`), aplica migraciones canónicas, ejecuta suite completa (auth, RBAC, concurrencia, sondas `/health` y `/ready`) y realiza teardown automático. |
| `npm run test:migrations` | Suite de verificación de ciclo de vida de migraciones (escenarios F0 a F11, más el fixture F2-Mislabeled y la comprobación de supervivencia del sentinel en `verify-migrations.js`). Requiere `TEST_DATABASE_URL` con privilegios `CREATEDB`. |

---

## Rutas y Control de Acceso

Para el detalle completo de cuerpos JSON, parámetros, códigos de error y respuestas, consultar el [Contrato de API](./docs/API_CONTRACT.md).

| Método y Ruta | Acceso y Permisos | Descripción |
|---|---|---|
| `GET /health` | Público | Sonda de liveness del proceso (fuera de `/api`). |
| `GET /ready` | Público | Sonda de readiness con verificación de PostgreSQL (fuera de `/api`). |
| `POST /api/auth/register` | Público | Registro de usuarios; solo admite roles `CLIENTE` o `TECNICO`. |
| `POST /api/auth/login` | Público | Inicio de sesión; actualiza `lastLogin` y emite JWT. |
| `GET /api/auth/me` | 🔒 Autenticado | Devuelve los datos del usuario autenticado en la sesión actual. |
| `GET /api/usuarios/me` | 🔒 Autenticado | Perfil del usuario propio (alias idéntico: `GET /api/users/me`). |
| `PATCH /api/usuarios/me` | 🔒 Autenticado | Actualiza nombre y/o celular propios (alias: `PATCH /api/users/me`). |
| `GET /api/categorias` | Público | Lista el catálogo de las 8 categorías oficiales de servicio. |
| `POST /api/solicitudes` | 🔒 `CLIENTE` | Crea una solicitud en estado inicial `PENDIENTE`. |
| `GET /api/solicitudes` | 🔒 Autenticado | Listado paginado: `CLIENTE` ve las suyas; `TECNICO` ve bolsa disponible `PENDIENTE` (excluyendo las que rechazó) y sus asignadas; `ADMIN` ve todas. |
| `GET /api/solicitudes/:id` | 🔒 Autenticado | Detalle de solicitud. Si un técnico la rechazó previamente, recibe `403 FORBIDDEN`. |
| `PATCH /api/solicitudes/:id` | 🔒 `CLIENTE` dueño | Edita campos de la solicitud; restringido exclusivamente a estado `PENDIENTE`. |
| `GET /api/solicitudes/:id/historial` | 🔒 Autenticado | Historial auditado; oculta acciones de rechazo técnico a los clientes por privacidad. |
| `PATCH /api/solicitudes/:id/aceptar` | 🔒 `TECNICO` | Transición `PENDIENTE` → `ACEPTADA`; asigna `tecnicoId`. Bloqueado (`409`) si ya la rechazó. |
| `PATCH /api/solicitudes/:id/rechazar` | 🔒 `TECNICO` | Registra rechazo individual. La solicitud **permanece `PENDIENTE`** para otros técnicos. |
| `PATCH /api/solicitudes/:id/iniciar` | 🔒 `TECNICO` asignado | Transición `ACEPTADA` → `EN_PROCESO`; fija `fechaInicio`. |
| `PATCH /api/solicitudes/:id/finalizar` | 🔒 `TECNICO` asignado | Transición `EN_PROCESO` → `FINALIZADA`; fija `fechaFinalizacion`. |
| `PATCH /api/solicitudes/:id/cancelar` | 🔒 `CLIENTE` dueño o `ADMIN` | Transición `PENDIENTE`/`ACEPTADA` → `CANCELADA` con motivo obligatorio. |
| `GET /api/admin/usuarios` | 🔒 `ADMIN` | Listado paginado de usuarios (`page`, `limit`). Sin filtro server-side por rol. |
| `GET /api/admin/usuarios/:id` | 🔒 `ADMIN` | Detalle de usuario por ID. |
| `PATCH /api/admin/usuarios/:id` | 🔒 `ADMIN` | Actualiza nombre, celular o rol (`CLIENTE`, `TECNICO`, `ADMIN`). |

> [!IMPORTANT] Filtro de Solicitudes para Administradores
> El filtrado de solicitudes por estado para administradores se realiza mediante `GET /api/solicitudes?estado=PENDIENTE` (o el estado correspondiente). No existe una ruta `/api/admin/solicitudes` separada.

### Concurrencia y Serialización (BE-04)

Todas las modificaciones de estado sobre solicitudes se ejecutan bajo transacciones con bloqueo de fila `SELECT ... FOR UPDATE`:
- Dos técnicos aceptando en paralelo: exactamente uno gana (`200 OK`) y el otro recibe `409 CONFLICT`.
- Rechazos repetidos del mismo técnico devuelven `409 CONFLICT` de forma controlada sin fallar con error 500.
- La frescura de datos se gestiona mediante consultas GET autenticadas; no existen WebSockets ni SSE. La integración y refresco de pantalla dependen de la aplicación cliente (SPA).

---

## Docker y Preparación Operativa (BE-06)

El contenedor de la API se basa en `backend/Dockerfile`:
- Imagen base `node:24-bookworm-slim`, ejecutada bajo usuario sin privilegios `USER node`.
- Instalación de dependencias reproducibles mediante `npm ci` sobre `package-lock.json`.
- Prisma Client generado en build-time sin requerir acceso de red ni credenciales.
- El contenedor ejecuta **exclusivamente el servidor HTTP** (`CMD ["node", "src/index.js"]`). **No ejecuta migraciones ni seeds automáticos al arrancar**.

### Flujo Operativo con Docker Compose

```bash
# 1. Iniciar servicio de base de datos
docker compose up -d db

# 2. Ejecutar precheck y migraciones canónicas
docker compose run --rm api npm run db:precheck
docker compose run --rm api npm run db:migrate

# 3. Arrancar la API
docker compose up -d api

# 4. (Opcional, solo laboratorio) Cargar datos de prueba
docker compose run --rm api npm run db:seed
```

### Comportamiento de Comillas en Variables de Entorno (E1)

- **Docker Compose:** Interpreta el archivo `.env` y **elimina automáticamente las comillas** alrededor de los valores de las variables.
- **Docker CLI (`docker run --env-file`):** **Conserva las comillas literales** como parte de la cadena del valor. Si se ejecuta un contenedor directamente con `--env-file`, los valores en el archivo deben escribirse sin comillas.

Para detalles exhaustivos sobre despliegue directo, procedimientos de rollback y límites técnicos, consultar la [Guía de Preparación de Despliegue](./docs/DEPLOYMENT.md).

---

## Estado de Publicación y Alcance del Ciclo

- **Issue #15 (BE-07, Publicación Pública) excluida:** Por instrucción explícita del usuario, la publicación en infraestructura pública queda excluida de este ciclo. No se han contratado proveedores ni provisionado bases productivas en la nube, y **no existe una URL pública de demostración configurada**.
- **Push a repositorios:** Todo push requiere aprobación expresa del usuario para la rama y commits específicos.
- **Dependencias externas:** La aprobación de diseño y conformidad visual por el equipo de Frontend y el consumo en producción desde la SPA continúan como dependencias externas al backend.
