# QA baseline y matriz de aceptación — BE-01 / BE-02

- **Rol:** Devin, QA tester independiente. Issues: [#9 (BE-01)](https://github.com/Talently-Lab/S2616-UrbanFix/issues/9), [#10 (BE-02)](https://github.com/Talently-Lab/S2616-UrbanFix/issues/10).
- **Commit base:** `a85014a408ad58260b68a8f22e5d81ca18bfbc7a` (`docs: define backend agent roles and issue roadmap`; solo agrega documentación sobre `main@95d9587`).
- **Fecha:** 2026-11-20. Despacho: `task_3f625bb2d14a`.
- **Alcance de esta entrega:** reproducción de baseline y criterios ejecutables. No certifica ninguna revisión futura ni declara resueltos los defectos.

## 1. Ambiente

| Componente | Versión / valor |
|---|---|
| OS | Linux 6.14.0-37-generic |
| Node | v24.21.0 |
| npm | 11.19.0 |
| Docker | 29.10.0 |
| Imagen PostgreSQL | `postgres:16-alpine` |
| Prisma | 7.10.0 (lockfile, `npm ci`) |
| Contenedor QA | `uf-qa-task3f625bb2d14a-pg` → `127.0.0.1:55432:5432` (creado por este despacho) |
| Bases temporales | `ufqa_empty`, `ufqa_push`, `ufqa_replay`, `ufqa_candata`, `ufqa_shadow` (todas dentro del contenedor del despacho) |
| Puerto API exploratoria | `127.0.0.1:3901` |
| `.env` / compose | No existen versionados; `DATABASE_URL` y `JWT_SECRET` se pasaron inline (valores de laboratorio, sin secretos reales) |

Nota: `npm ci` emitió advertencia de `allowScripts` para `prisma`/`@prisma/engines` (postinstall no corridos); `prisma generate` funcionó igual en este entorno, pero puede requerir `npm install-scripts approve` en otros.

## 2. Comandos ejecutados y resultados

### 2.1 Dependencias y generación

| Comando (desde `backend/`) | Exit | Esperado | Real |
|---|---|---|---|
| `npm ci` | 0 | instala según lockfile | OK, sin modificar lockfile |
| `npx prisma validate` | 0 | schema válido | OK — "The schema at prisma/schema.prisma is valid" |
| `npx prisma generate` | 0 | client generado | OK — "Generated Prisma Client (v7.10.0)" |

### 2.2 `npm test` — defecto reproducido

| Comando | Exit | Real |
|---|---|---|
| `npm test` | **127** | `bash: ../scripts/test-api.sh: No existe el archivo o el directorio` |

`package.json` define `"test": "bash ../scripts/test-api.sh"` y ese archivo no existe en el repo (no hay `scripts/` en la raíz). **Defecto D1**, reproduce el problema declarado en issue #10.

### 2.3 `prisma migrate deploy` sobre PostgreSQL vacío — defecto reproducido

Base `ufqa_empty` recién creada, sin objetos.

| Comando | Exit | Real |
|---|---|---|
| `DATABASE_URL=...ufqa_empty npx prisma migrate deploy` (1ª) | **1** | Aplica `20261002224650_init`; falla en `20261005143951_init` con **P3018 / SQLSTATE 42710**: `ERROR: type "Rol" already exists` |
| `npx prisma migrate status` | 1 | 3 migraciones sin aplicar |
| `migrate deploy` (2ª, misma base) | **1** | **P3009**: "migrate found failed migrations in the target database" — la fila fallida de `20261005143951_init` bloquea todo reintento |

Estado resultante de `ufqa_empty`:

```
_prisma_migrations: 20261002224650_init → finished (1 step)
                    20261005143951_init → finished_at NULL (fallida)
Tablas:  Usuario, SolicitudServicio (versión v1, sin columnas de ciclo de vida)
Enums:   Rol, EstadoSolicitud
```

**Defecto D2**: la instalación vacía no es desplegable ni reintentable; el fallo deja el ledger envenenado (P3009 en todo intento posterior).

### 2.4 Divergencia historial ↔ schema

Reproduje el "estado final pretendido" aplicando en `ufqa_replay` las tres migraciones canónicas (`20261007000000_init` + `20261011212651` + `20261011230000`) y comparé:

```
DATABASE_URL=...ufqa_replay npx prisma migrate diff \
  --from-config-datasource --to-schema ./prisma/schema.prisma --script
→ "-- This is an empty migration."   (exit 0)
```

**El estado final del historial canónico coincide exactamente con `schema.prisma`.** No hay drift de esquema: el problema es que `20261002224650_init` y `20261005143951_init` son `init` duplicadas anteriores a la canónica y todas recrean los mismos tipos/tablas sin `IF NOT EXISTS`. Detalle:

- Las tres primeras migraciones se llaman `init` y emiten `CREATE TYPE "Rol"`, `CREATE TABLE "Usuario"`, `CREATE TABLE "SolicitudServicio"` (definiciones distintas entre sí).
- `20261007000000_init` crea `categoria` como enum `CategoriaServicio`; `20261011212651` la convierte a TEXT vía `DROP COLUMN` + `ADD COLUMN TEXT NOT NULL`. Estado final: TEXT, igual que schema (`categoria String`). El enum `CategoriaServicio` queda en la base sin columna que lo use.
- Una base en estado de `20261002224650_init` carece de `HistorialEstadoSolicitud`, `RechazoSolicitud`, columnas de ciclo de vida, índices `@@index` y enum `CategoriaServicio`.

### 2.5 Simulación de bases existentes (fixtures ejecutados)

**Fixture F-legacy:** `ufqa_candata` construida como "base canónica inicial con datos": SQL de `20261007000000_init` + fila aplicada en `_prisma_migrations` (checksum = sha256 del `migration.sql`, verificado contra el ledger real) + 2 usuarios + 1 solicitud con `categoria='PLOMERIA'`.

| Escenario | Comando | Exit | Real |
|---|---|---|---|
| F-legacy + historial actual (5 migraciones) | `migrate deploy` | **1** | P3018 / 42710 en `20261002224650_init` (`Rol` ya existe) — falla aún antes que en base vacía |
| F-legacy + solo 3 migraciones canónicas (directorio temporal `/tmp/.../canon/prisma/migrations`, simulando la estrategia aprobada de retirar las init duplicadas) | `migrate deploy` | **1** | P3018 / **SQLSTATE 23502** en `20261011212651_add_last_login_to_usuario`: `column "categoria" of relation "SolicitudServicio" contains null values` |
| Reintento tras el fallo anterior | `migrate deploy` | 1 | P3009 (migración fallida registrada) |

**Defecto D3 (preventivo, relevante para la decisión del arquitecto):** `20261011212651` hace `DROP COLUMN categoria` + `ADD COLUMN categoria TEXT NOT NULL` sin default. Sobre una base canónica **con datos**, la migración canónica no es desplegable aunque se retiren las duplicadas. El `ALTER TABLE` es atómico: los datos se preservaron (verificado: `categoria='PLOMERIA'` intacta tras el fallo), pero la actualización queda bloqueada y el ledger marca la migración como fallida → la ruta de actualización para bases existentes exige una conversión previa que preserve datos (p. ej. `ALTER COLUMN ... TYPE text`/backfill + `SET NOT NULL`, o conversión manual + `resolve --applied`), ejecutada antes o fuera de `migrate deploy`. Byte a byte, la canónica sola no cumple "actualización sin pérdida" sobre bases pobladas.

### 2.6 Seed e idempotencia (sobre base `db push`)

| Comando | Exit | Real |
|---|---|---|
| `npx prisma db seed` (1ª y 2ª, base `ufqa_push`) | 0 | Ambas OK; tras dos ejecuciones: 1 CLIENTE, 1 TECNICO, 1 ADMIN, 1 solicitud — sin duplicados (upsert) |

El seed crea un ADMIN fijo (`admin@mail.com`, password de ejemplo `MinimoOchoCaracteres`) — correcto para demo explícito, pero la contraseña está hardcodeada en `prisma/seed.js`.

### 2.7 Flujos HTTP exploratorios — etiqueta: NO validan migraciones

Servidor levantado con `DATABASE_URL=...ufqa_push` (esquema creado por **`prisma db push`**, etiquetado; jamás cuenta como migraciones aprobadas), `JWT_SECRET` de laboratorio, `PORT=3901`. Script: `/tmp/uf-qa-task3f625bb2d14a/smoke.sh` (fuera del repo). **52/55 checks PASS; los 3 "FAIL" restantes fueron artefacto del harness** (el jq devolvía vacío correctamente al no existir `passwordHash`); verifiqué a mano con `grep -c passwordHash` = 0 en login, `/auth/me` y `/admin/usuarios`. **En la práctica, los 55 comportamientos explorados cumplen el contrato.**

Hallazgos de comportamiento (independientes del runner ausente):

- `GET /api/admin/usuarios?rol=TECNICO` → **200 pero el filtro se ignora silenciosamente**: devolvió los 6 usuarios de todos los roles. `listUsuariosQuerySchema` solo acepta `page`/`limit`; zod descarta params desconocidos. El frontend (`TablaUsuarios.jsx`) filtra por rol/búsqueda **del lado cliente**, así que el contrato vigente no exige filtros server-side — observación para decisión, no necesariamente defecto.
- CORS responde `Access-Control-Allow-Origin: *` (preflight OPTIONS → 204). Cualquier origen queda habilitado; configuración por entorno pendiente (BE-03).
- `JWT_SECRET` con fallback `'secret'` en `auth.service.js` y `auth.middleware.js` — JWT obligatorio aún no forzado (BE-03).
- Aceptación concurrente: dos `PATCH /aceptar` simultáneos sobre la misma `PENDIENTE` → un 200 y un 409 (control `updateMany` atómico funciona).
- Rechazo: mantiene `PENDIENTE`, excluye al técnico que rechazó del listado y del detalle (403), bloquea aceptar tras rechazar (409) y rechazo duplicado (409); el historial del cliente oculta `accion='RECHAZO'` y el del admin lo muestra.
- Registro `rol:'ADMIN'` → 400 por enum zod; duplicado de email → 409.
- `/api/usuarios/*` está montado también como `/api/users/*` (alias duplicado en `routes/index.js`) — verificar consumo real antes de tocarlo.

## 3. Defectos de baseline (resumen)

| ID | Severidad | Descripción | Reproducción |
|---|---|---|---|
| D1 | Bloqueante | `npm test` → exit 127, script `../scripts/test-api.sh` inexistente; no hay suite versionada | §2.2 |
| D2 | Bloqueante | `migrate deploy` sobre PG vacío → P3018/42710 en `20261005143951_init`; reintento → P3009 | §2.3 |
| D3 | Bloqueante para bases existentes | `20261011212651` no es desplegable sobre base canónica poblada (23502, DROP+ADD sin default); requiere conversión previa que preserve datos | §2.5 |
| D4 | Informativo | Tres migraciones `init` acumuladas con DDL duplicada sin `IF NOT EXISTS`; ledger fallido bloquea todo historial corregido | §2.3–2.5 |
| O1 | Observación | `/admin/usuarios` ignora params de filtro (devuelve 200 sin filtrar) | §2.7 |
| O2 | Observación | CORS `*`, `JWT_SECRET` con fallback inseguro, password del seed hardcodeada | §2.6–2.7 |

Ninguno declarado resuelto: son estado del baseline `a85014a`.

## 4. Propuesta de fixtures para bases existentes (sin pérdida)

Para validar la estrategia aprobada (retirar solo `20261002224650` y `20261005143951`, canónicas byte a byte) propongo estos estados de fixture, todos reproducibles en el contenedor del despacho:

| Fixture | Estado simulado | Cómo construirlo | Resultado esperado de la corrección |
|---|---|---|---|
| F0 vacía | Sin objetos | `CREATE DATABASE` | `migrate deploy` aplica las 3 canónicas; re-run = no-op; diff vs schema vacío |
| F1 canónica actual | 3 canónicas aplicadas, ledger consistente | `migrate deploy` post-fix sobre F0 | Re-deploy = no-op exit 0 |
| F2 canónica inicial **con datos** | Solo `20261007000000_init` aplicada + filas | SQL canónico + fila ledger (checksum sha256 verificado) + inserts | Conversión `categoria` enum→TEXT **sin DROP/ADD** ni pérdida, luego canónicas restantes; los datos deben sobrevivir verificables (`SELECT` antes/después) |
| F3 ledger legacy-fallido | Fila `finished_at NULL` de una init retirada o de `20261011212651` | Cualquier deploy fallido (ya reproducido en §2.3/§2.5) | Detectado y bloqueado con mensaje explícito **antes de mutar**; sin `resolve` genérico |
| F4 `db push` sin ledger | Esquema presente, `_prisma_migrations` ausente/vacío | `prisma db push` | Detectado como estado distinto; exige baseline/verificación documentada antes de marcar migraciones como aplicadas |
| F5 init-duplicada aplicada | Solo `20261002224650_init` en ledger | Ejecutar su SQL + fila ledger | Estado no soportado declarado explícitamente, bloqueado antes de mutar (esquema incompatible con canónica: categoria TEXT, sin tablas de historial) |

Estados que **puedo probar**: F0–F5 en contenedor aislado, más los ya ejecutados (§2.5). Estados **desconocidos/no determinables**: contenido real de `_prisma_migrations` y drift de cualquier base dev/productiva existente (no hay acceso ni `.env` versionado); si existe alguna base en estado F5 u otro intermedio; volumen de datos real. Cualquier ruta de actualización debe detectar y abortar sobre estados no reconocidos.

## 5. Matriz de aceptación BE-02 (issue #10)

Convención: **[E]** = ejecutado exploratoriamente en baseline con `db push` (comportamiento actual confirmado, válido como caso de aceptación; NO vale como prueba de migraciones). **[P]** = propuesto para la suite futura (no corrido o depende de BE-01). Toda casilla debe tener precondición, comando y aserción ejecutables por `npm test`.

| # | Caso | Esperado | Estado |
|---|---|---|---|
| A1 | `npm test` | Exit 0 en verde, ≠0 ante fallo, imprime reporte; sin `../scripts/test-api.sh` | [P] core del issue |
| A2 | Arranque/parada controlados | La suite levanta API+PG aislados (puertos/recursos propios) y los limpia solo a ellos | [P] |
| A3 | Runner con `DATABASE_URL` propia del test | Nunca toca `DATABASE_URL` de dev ni bases ajenas | [P] |

### Autenticación y roles

| # | Caso | Esperado | Estado |
|---|---|---|---|
| B1 | `POST /auth/register` CLIENTE | 201, `{data:{usuario,token}}`, sin `passwordHash` | [E] |
| B2 | `POST /auth/register` TECNICO | 201 | [E] |
| B3 | `POST /auth/register` `rol:'ADMIN'` | 400 `VALIDATION_ERROR` | [E] |
| B4 | Registro email duplicado | 409 `CONFLICT` | [E] |
| B5 | Registro password <8 / sin nombre / email inválido | 400 | [E parcial: password<8 cubierto por schema; probar los tres] |
| B6 | `POST /auth/login` tres roles | 200 + token, sin `passwordHash` | [E] |
| B7 | Login password erróneo / usuario inexistente | 401 `UNAUTHORIZED` (mismo mensaje) | [E] |
| B8 | `GET /auth/me` sin token / token inválido | 401 | [E] |
| B9 | `GET /auth/me` con token | 200, usuario del token | [E] |
| B10 | `PATCH /usuarios/me` | 200 actualiza nombre/celular; body vacío → 400 | [E] |
| B11 | Rol insuficiente (TECNICO crea solicitud, TECNICO usa `/admin/*`, CLIENTE crea admin paths) | 403 `FORBIDDEN` | [E] |

### Aislamiento y solicitudes

| # | Caso | Esperado | Estado |
|---|---|---|---|
| C1 | `POST /solicitudes` CLIENTE | 201 `PENDIENTE`, `clienteId` del token, historial inicial creado | [E] |
| C2 | `GET /solicitudes` CLIENTE | solo propias; filtro `estado` funciona | [E] (filtro: [P]) |
| C3 | `GET /solicitudes/:id` de otro cliente | 403 | [E] |
| C4 | `GET /solicitudes` TECNICO `?estado=PENDIENTE` | bolsa completa menos rechazadas por él | [E] |
| C5 | `GET /solicitudes` TECNICO sin filtro | pendientes no rechazadas + asignadas propias | [E] |
| C6 | `GET /solicitudes` TECNICO `?estado=ACEPTADA` | solo asignadas a él | [P] |
| C7 | `GET /solicitudes` ADMIN + filtros `estado`/`categoria` | todas, filtros aplicados | [P] |
| C8 | `PATCH /solicitudes/:id` dueño en `PENDIENTE` | 200; no dueño → 403; en otro estado → 409 | [E parcial: probar no-PENDIENTE] |
| C9 | Paginación `page`/`limit`, `meta.total` | meta correcto, limit>100 rechazado (400) | [P] |

### Rechazo, historial, transiciones

| # | Caso | Esperado | Estado |
|---|---|---|---|
| D1 | `PATCH /:id/rechazar` sin `motivo` | 400 | [E] |
| D2 | Rechazo TECNICO | 200, solicitud sigue `PENDIENTE`, `RechazoSolicitud` + historial `accion:'RECHAZO'` | [E] |
| D3 | Rechazo duplicado | 409 | [E] |
| D4 | Aceptar tras rechazar / detalle tras rechazar | 409 / 403 | [E] |
| D5 | Historial CLIENTE oculta RECHAZO; ADMIN/TECNICO lo ve; otro cliente → 403 | según rol | [E] |
| D6 | `aceptar` sobre PENDIENTE | 200, `tecnicoId`=user, `fechaAceptacion`, historial | [E] |
| D7 | `aceptar` sobre no-PENDIENTE o ya asignada | 409 | [E] |
| D8 | `iniciar` (ACEPTADA→EN_PROCESO) asignado | 200 `fechaInicio` | [E] |
| D9 | `iniciar`/`finalizar` por técnico no asignado | 403 | [E] |
| D10 | `finalizar` desde ACEPTADA / `iniciar` desde FINALIZADA / cualquier transición ilegal | 409 con mensaje de estado | [E] |
| D11 | `cancelar` CLIENTE dueño (PENDIENTE/ACEPTADA) | 200 `CANCELADA` + `motivoCancelacion` | [E] |
| D12 | `cancelar` por otro cliente / TECNICO / en EN_PROCESO | 403 / 403 / 409 | [E] |
| D13 | **Aceptación concurrente**: 2+ `PATCH aceptar` simultáneos | exactamente un 200, resto 409 | [E] |
| D14 | Ciclo feliz completo + verificación de historial ordenado | PENDIENTE→ACEPTADA→EN_PROCESO→FINALIZADA con 4 filas historial | [E parcial: verificar filas] |

### Admin, CORS, seed, recursos

| # | Caso | Esperado | Estado |
|---|---|---|---|
| E1 | `GET /admin/usuarios` sin token / TECNICO | 401 / 403 | [E] |
| E2 | `GET /admin/usuarios` ADMIN | 200 paginado, sin `passwordHash` | [E] |
| E3 | `PATCH /admin/usuarios/:id` cambio de rol | 200; id inexistente → 404; body vacío → 400 | [P] |
| E4 | Filtros `/admin/usuarios?rol=` | definir: o se implementan (200 filtrado) o se rechazan explícitamente — hoy 200 sin filtrar (O1) | [P] decisión pendiente |
| E5 | OPTIONS preflight + origen configurado | headers según BE-03 (hoy `*` permisivo, O2) | [E hoy; criterio final depende de BE-03] |
| E6 | `prisma db seed` ×2 | exit 0, sin duplicados, logins de los 3 roles | [E] |
| E7 | `GET /categorias`, `GET /health` | 200 públicos | [E] |
| E8 | Limpieza | la suite solo borra sus DB/contenedor/tablas efímeras | [P] |
| E9 | Regresión negativa | la suite falla (exit≠0) si se rompe un caso (probar con aserción forzada) | [P] |

### Bloqueados hasta BE-01

| # | Caso | Esperado | Estado |
|---|---|---|---|
| F-BE1 | `migrate deploy` PG vacío + re-run no-op + diff vacío vs schema | ver §2.3–2.5 | [P] bloqueado por D2 |
| F-BE2 | Suite `npm test` sobre base migrada (no `db push`) | runner usa `migrate deploy` | [P] bloqueado por D2 |

## 6. Limitaciones

- Los flujos HTTP se probaron sobre esquema `db push`: cubren comportamiento de la API, **no** validan migraciones ni el despliegue.
- Sin `.env` ni compose versionados, los comandos usan credenciales de laboratorio inline; el arranque productivo real (variables, CORS, JWT obligatorio) depende de BE-03.
- No puedo determinar el estado de `_prisma_migrations` ni el drift de bases dev/productivas reales; F5 y estados intermedios son inferidos del historial Git.
- `qa/` y `frontend/` solo se leyeron; ningún archivo protegido fue modificado (ver §7).
- El smoke exploratorio no cubre: filtros de admin (O1), PATCH admin por id, paginación límite, expiración real de JWT, ni el alias `/api/users`.

## 7. Integridad del repo

`git status --short` y `git diff --stat` antes del commit del reporte: sin cambios fuera de `backend/docs/qa/baseline-and-acceptance.md`. Verificado que `frontend/`, `data/`, `qa/`, `package.json`, `package-lock.json`, `prisma/migrations/` permanecen intactos (git tree limpio en esas rutas).

## 8. Recursos temporales

- Contenedor `uf-qa-task3f625bb2d14a-pg` (puerto 55432) con bases `ufqa_*`: **eliminado al finalizar este despacho**.
- Scripts en `/tmp/uf-qa-task3f625bb2d14a/` (smoke.sh, config de migraciones canónicas simuladas): fuera del repo, efímeros.
- API exploratoria en puerto 3901: proceso detenido.
- No se creó nada en `frontend/`, `data/` ni `qa/`; no se tocó ningún recurso ajeno al despacho.
