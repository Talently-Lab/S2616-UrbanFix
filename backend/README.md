# UrbanFix — Backend

API REST para registro/login, perfiles, solicitudes de servicio, asignación de técnicos, historial y administración.

## Stack y estructura

- Node.js con módulos ES; entorno comprobado: Node 24.
- Express 5, PostgreSQL, Prisma 7 y `@prisma/adapter-pg`.
- JWT con `jsonwebtoken`, contraseñas con `bcryptjs` y validación con Zod 4.
- npm y nodemon para desarrollo. QA utiliza PostgreSQL 16.

`src/routes/` define rutas, `controllers/` maneja HTTP, `services/` contiene reglas y persistencia, `schemas/` valida entradas, `middlewares/` protege accesos y `config/prisma.js` conecta PostgreSQL. `prisma/` contiene modelo, migraciones y seed; `docs/` contiene contrato y reportes.

El modelo relaciona `Usuario`, `SolicitudServicio`, `HistorialEstadoSolicitud` y `RechazoSolicitud`. El oficio se representa mediante categoría; no existe una tabla `Servicio` independiente.

## Estado de instalación

La reparación de la [issue #9](https://github.com/Talently-Lab/S2616-UrbanFix/issues/9) está integrada en esta rama local y cuenta con [aprobación técnica de QA](./docs/qa/be-01-review-e826df7.md). Incluye instalación vacía e idempotente, validación física del esquema y actualización conservadora con datos. **Todavía no fue publicada mediante push**: clonar `main` puede recuperar el historial anterior con migraciones iniciales duplicadas.

En bases existentes, `20261011212651_add_last_login_to_usuario` sigue requiriendo un procedimiento previo si hay solicitudes cargadas. Seguir la [guía de migraciones](./docs/MIGRATION_GUIDE.md) antes de aplicar cambios; no ejecutar `reset` ni `resolve` a ciegas. La guía incluye los límites conocidos del runner ante señales de interrupción.

## Instalación local

Requisitos: Node.js 24 y npm; PostgreSQL accesible; Docker para usar la base del ejemplo. Puertos libres: `5434` para PostgreSQL y `3001` para API. No se necesita Docker Compose: no hay un archivo Compose versionado.

### 1. Instalar y configurar

```bash
git clone https://github.com/Talently-Lab/S2616-UrbanFix.git
cd S2616-UrbanFix/backend
npm ci
cp .env.example .env
```

Si ya está clonado, comenzar en `backend/` y ejecutar los últimos dos comandos.

Crear una instancia PostgreSQL local propia con persistencia:

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

Continuar cuando responda `accepting connections`. Si el contenedor ya existe, usar `docker start urbanfix-postgres-local`. No eliminar su volumen para corregir errores. Las credenciales son solo locales; si usás otra instancia, adaptar `DATABASE_URL`.

Editar `.env`:

```dotenv
DATABASE_URL="postgresql://urbanfix:urbanfix_pass@localhost:5434/urbanfix_db?schema=public"
PORT=3001
JWT_SECRET="reemplazar-por-un-secreto-propio-aleatorio"
```

Generar un secreto y copiarlo a `JWT_SECRET`:

```bash
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('hex'))"
```

`.env` está ignorado por Git. Conservar las credenciales reales fuera del repositorio.

| Variable | Uso actual |
| --- | --- |
| `DATABASE_URL` | Conexión PostgreSQL para Prisma CLI y el adaptador de la API; el ejemplo utiliza esquema `public`. |
| `PORT` | Puerto HTTP; predeterminado `3001`. |
| `JWT_SECRET` | Firma y validación del JWT. Configurarlo explícitamente: el código actual todavía tiene fallback `secret`, pendiente de eliminar en #11. |
| `TEST_DATABASE_URL` | Variable dedicada del runner de migraciones de #9, hacia un servidor exclusivo de laboratorio y con privilegio `CREATEDB`. No sustituye la conexión de la API. |

`JWT_EXPIRES_IN` todavía no se consume: los tokens duran siete días por código. Tampoco hay variable de orígenes CORS consumida; `cors()` permite `*`. La configuración validada, expiración configurable y allowlist CORS se trabajan en [#11](https://github.com/Talently-Lab/S2616-UrbanFix/issues/11).

### 2. Preparar Prisma

```bash
npx prisma validate
npx prisma generate
```

**En esta revisión reparada, solo sobre una base vacía verificada:**

```bash
node --env-file=.env tests/migrations/migration-precheck.js
```

Debe indicar `CLEAN_DATABASE` antes de ejecutar:

```bash
npm run db:migrate
```

Para una base con tablas o historial, detenerse y seguir la guía de migraciones de esa revisión. `prisma db push` no sustituye la reparación ni valida las migraciones.

### 3. Datos de demostración, opcionales

Solo sobre una base preparada de desarrollo/laboratorio:

```bash
npm run db:seed
```

El seed crea cuentas y una solicitud con historial mediante `upsert`. Repetirlo no duplica esos registros ni reemplaza los que ya existen.

| Rol | Correo | Contraseña inicial de demostración |
| --- | --- | --- |
| Cliente | `juan@mail.com` | `MinimoOchoCaracteres` |
| Técnico | `carlos@mail.com` | `MinimoOchoCaracteres` |
| Administrador | `admin@mail.com` | `MinimoOchoCaracteres` |

Si los correos ya existían con otra contraseña, el seed no la cambia. No ejecutarlo en producción. El registro público solo crea clientes y técnicos; el administrador de esta tabla proviene del seed.

### 4. Iniciar y comprobar

```bash
npm run dev
```

En otra terminal:

```bash
curl --fail http://localhost:3001/health
curl --fail http://localhost:3001/api/categorias
curl --fail http://localhost:3001/api/auth/login \
  --header 'Content-Type: application/json' \
  --data '{"email":"juan@mail.com","password":"MinimoOchoCaracteres"}'
```

El login del ejemplo necesita el seed. `/health` devuelve estado/timestamp del proceso, sin comprobar PostgreSQL. El login y las rutas autenticadas requieren una base preparada. La respuesta de login contiene `data.usuario` y `data.token`; enviar `Authorization: Bearer <token>` para rutas protegidas.

## Comandos y pruebas

Ejecutar desde `backend/`:

| Comando | Función / estado |
| --- | --- |
| `npm run dev` | Servidor con recarga mediante nodemon. |
| `npm start` | Inicia Node sin recarga; no aplica migraciones ni seed. |
| `npm run db:migrate` | `prisma migrate deploy`; respetar los límites de #9. |
| `npm run db:seed` / `npm run seed` | Seed explícito de demostración. |
| `npm run db:studio` | Abre Prisma Studio con la base configurada. |
| `npm test` | Actualmente falla: apunta a `../scripts/test-api.sh`, ausente. Restauración en [#10](https://github.com/Talently-Lab/S2616-UrbanFix/issues/10). |

Están disponibles `db:precheck` y `test:migrations`; consultar la [guía de migraciones](./docs/MIGRATION_GUIDE.md) para ejecutarlos. El runner exige `TEST_DATABASE_URL` explícita hacia PostgreSQL exclusivo de laboratorio. No apuntarlo a servidores compartidos/productivos. Para un script Node que no carga dotenv por sí mismo, usar `node --env-file=.env <ruta-del-script>` o exportar explícitamente las variables necesarias.

Los resultados y limitaciones están en [los reportes de QA](./docs/qa/). Las pruebas de flujos realizadas sobre `db push` no certifican el historial de migraciones.

## Rutas y permisos

El [contrato de API](./docs/API_CONTRACT.md) detalla cuerpos, errores y transiciones. Resumen de la implementación actual:

| Ruta | Acceso |
| --- | --- |
| `POST /api/auth/register`, `POST /api/auth/login` | Público; registro solo CLIENTE/TECNICO. |
| `GET /api/auth/me`, `GET/PATCH /api/usuarios/me` | Usuario autenticado, perfil propio. |
| `GET /api/categorias` | Público. |
| `POST /api/solicitudes` | Cliente. |
| `GET /api/solicitudes`, `GET /api/solicitudes/:id` | Según rol, propiedad, asignación y rechazos. |
| `PATCH /api/solicitudes/:id` | Cliente dueño, solo PENDIENTE. |
| `GET /api/solicitudes/:id/historial` | Visibilidad del detalle; oculta rechazos individuales al cliente. |
| `PATCH /api/solicitudes/:id/aceptar`, `/rechazar` | Técnico, con controles de disponibilidad/rechazo previo. |
| `PATCH /api/solicitudes/:id/iniciar`, `/finalizar` | Técnico asignado, con transición válida. |
| `PATCH /api/solicitudes/:id/cancelar` | Cliente dueño o ADMIN, desde PENDIENTE/ACEPTADA. |
| `GET /api/admin/usuarios`, `GET/PATCH /api/admin/usuarios/:id` | Administrador. |

El administrador filtra solicitudes mediante `GET /api/solicitudes?estado=PENDIENTE` (o el estado requerido). Usuarios soporta paginación `page`/`limit`, sin filtro server-side por rol. `/api/users/me` es alias de `/api/usuarios/me`.

Al consultar solicitudes, el cliente recibe estado y datos actuales del técnico. No hay SSE/WebSocket: el refresco automático de pantalla depende del frontend. Este ciclo no modifica `frontend/`, `data/` ni `qa/`.

## Docker, demo y publicación

El `Dockerfile` existente ejecuta migraciones y seed automáticamente al arrancar, a diferencia de `npm start`. No usar ese arranque sobre una base productiva; la preparación sin seed automático se sigue en [#14](https://github.com/Talently-Lab/S2616-UrbanFix/issues/14).

**No hay URL pública de demo verificada.** La publicación y comprobación con PostgreSQL/origen real del frontend se siguen en [#15](https://github.com/Talently-Lab/S2616-UrbanFix/issues/15). Se agregará la URL cuando exista y esté comprobada.

Todo push a GitHub necesita aprobación explícita del usuario para la rama y los commits presentados.

## Detener y retomar

- API: `Ctrl+C` en su terminal.
- Detener PostgreSQL: `docker stop urbanfix-postgres-local`.
- Retomar PostgreSQL: `docker start urbanfix-postgres-local`.

Detener conserva el volumen; no borrarlo para resolver errores de migración. Consultar el [plan backend](./docs/BACKEND_PLAN.md) y el [baseline de QA](./docs/qa/baseline-and-acceptance.md).
