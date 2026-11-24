# Revisión QA — BE-05 / issue #13, candidato `544c550`

**Tipo:** revisión de cambio exclusivamente documental (consolidación de contrato + guías operativas + corrección de notas editoriales E1/E2).
**Veredicto: CAMBIOS REQUERIDOS** — el contrato y la estructura son completos y fieles en lo funcional (inventario de rutas, DTOs, roles, concurrencia, exclusiones honestas, E1/E2 resueltas), pero quedan **contradicciones semánticas reales** entre lo documentado y el comportamiento implementado en las secciones de errores y CORS (D1–D5), más un conteo falso de la suite de migraciones (D7) y precisiones menores (D6, D8–D10). Todas las correcciones pedidas son **documentales**; no se pide endurecer código productivo.

## Alcance y hashes

| Ítem | Valor |
|---|---|
| Candidato | `544c5507b7ee3953d9a4a5b1c7b7dee7f0e931fa` ("docs(api): consolidar contrato, documentacion operativa y corregir E1-E2 (BE-05)") |
| Base | `a37f9ab` ("docs: exclude public deployment issue 15 at user request") |
| Workspace QA | `GonzaCarrillo/be-13-docs-qa`, checkout exacto del candidato, árbol limpio |
| Archivos del diff | `backend/.env.example`, `backend/README.md`, `backend/docs/{API_CONTRACT,BACKEND_PLAN,DEPLOYMENT,MIGRATION_GUIDE}.md`, `backend/src/config/prisma.js` (7 archivos, +919/−573) |
| Naturaleza del diff | **Solo documentación y comentarios.** En `src/` las 13 líneas cambiadas son 100% comentarios `//` (0 líneas de código). `.env.example`: solo comentarios; valores activos idénticos. `tests/`, `prisma/`, `package*.json`, `Dockerfile`, `compose.yaml`, `.dockerignore`, `http/`: **0 cambios**. `frontend/`, `data/`, `qa/`: **0 cambios** (verificado con `git diff --name-only`) |
| Remoto verificado | `origin/chore/backend-orchestration` = `e40b9ba` (solo #9/#10); `origin/main` = `95d9587`. La afirmación de README/PLAN de que el trabajo posterior vive solo en ramas locales es **correcta** |
| Issue #15 | Excluida por usuario. No se provisionó, publicó ni solicitó hosting/credenciales. Los docs la declaran excluida honestamente (contrato §11.3, DEPLOYMENT §7, README final, PLAN ítem 8) |
| Entorno | Node v24.21.0, npm 11.19.0, `npm ci` propio en el workspace (268 paquetes) solo para sondas; sin base de datos ni `.env` de usuario tocados |

## Inventario de rutas (código → sección del contrato)

Conteo verificado contra `src/index.js` + `src/routes/*`: **21 operaciones canónicas + 2 alias = 23**. No se cuentan `OPTIONS`/`HEAD` automáticos de Express. El contrato cubre las 23; ninguna ruta implementada queda sin documentar y ninguna ruta documentada es inexistente.

| # | Método y ruta | Middleware real | Sección API_CONTRACT |
|---|---|---|---|
| 1 | `GET /health` | pública (raíz, fuera de `/api`) | §1.4 ✓ |
| 2 | `GET /ready` | pública (raíz) | §1.4 ✓ |
| 3 | `POST /api/auth/register` | `validate(registerSchema)` | §4.1 ✓ |
| 4 | `POST /api/auth/login` | `validate(loginSchema)` | §4.2 ✓ |
| 5 | `GET /api/auth/me` | `authenticate` | §4.3 ✓ |
| 6 | `GET /api/usuarios/me` | `authenticate` | §5.1 ✓ |
| 7 | `PATCH /api/usuarios/me` | `authenticate` + `validate(updateMeSchema)` | §5.2 ✓ |
| 8 | `GET /api/users/me` | alias exacto (mismo router montado) | §5 nota + §5.1 ✓ |
| 9 | `PATCH /api/users/me` | alias exacto | §5 nota + §5.2 ✓ |
| 10 | `GET /api/admin/usuarios` | `authenticate` + `authorize(['ADMIN'])` + `validate(query)` | §6.1 ✓ |
| 11 | `GET /api/admin/usuarios/:id` | idem (sin validación de `params`) | §6.2 ✓ |
| 12 | `PATCH /api/admin/usuarios/:id` | idem + `validate(updateUsuarioAdminSchema)` | §6.3 ✓ |
| 13 | `GET /api/categorias` | pública | §7.1 ✓ |
| 14 | `POST /api/solicitudes` | `authenticate` + `authorize(['CLIENTE'])` + `validate` | §8.1 ✓ |
| 15 | `GET /api/solicitudes` | `authenticate` + `validate(query)` | §8.2 ✓ |
| 16 | `GET /api/solicitudes/:id` | `authenticate` | §8.3 ✓ |
| 17 | `PATCH /api/solicitudes/:id` | `authenticate` + `authorize(['CLIENTE'])` + `validate` | §8.4 ✓ |
| 18 | `GET /api/solicitudes/:id/historial` | `authenticate` | §8.5 ✓ |
| 19 | `PATCH /api/solicitudes/:id/aceptar` | `authorize(['TECNICO'])` | §9 tabla + §9.1 ✓ |
| 20 | `PATCH /api/solicitudes/:id/rechazar` | `authorize(['TECNICO'])` + `validate(motivoSchema)` | §9 + §9.1 ✓ |
| 21 | `PATCH /api/solicitudes/:id/iniciar` | `authorize(['TECNICO'])` | §9 + §9.1 ✓ |
| 22 | `PATCH /api/solicitudes/:id/finalizar` | `authorize(['TECNICO'])` | §9 + §9.1 ✓ |
| 23 | `PATCH /api/solicitudes/:id/cancelar` | `authorize(['CLIENTE','ADMIN'])` + `validate(motivoSchema)` | §9 + §9.1 ✓ |

El README (tabla "Rutas y Control de Acceso") cubre las mismas 23 operaciones (alias anotadas inline) — consistente.

## Comprobaciones ejecutadas vs lecturas

**Ejecutado en esta revisión** (sondas propias, fuera del repo o sobre el workspace):

| Prueba | Resultado |
|---|---|
| `git diff a37f9ab..544c550` (nombres, contenido, conteo de líneas no-comentario) | Diff 100% documental/comentarios; `frontend/`, `data/`, `qa/` intactos |
| Stub CORS (`createCorsMiddleware` real con req/res simulados) | Origen permitido: `Vary: Origin` + `Access-Control-Allow-Origin` reflejado; **`Access-Control-Allow-Credentials` nunca se emite**. Denegado: 403 `{"error":{"code":"CORS_ORIGIN_DENIED","message":"Origen no permitido por la política CORS"}}` sin ACAO. Preflight permitido: 204 con `Allow-Methods`/`Allow-Headers`. Sin `Origin`: pasa. Denegado OPTIONS: 403 |
| Express 5.2 real (`express.json()` + handler global replicado verbatim de `index.js`) | JSON malformado → **400 `{"error":{"code":"INTERNAL_ERROR","message":"Unterminated string in JSON at position 10 (line 1 column 11)"}}`**. Error con `code`/`message` bajo `NODE_ENV=production` → **500 devuelve `err.code` y `err.message` crudos** (p.ej. `P2021` + detalle interno) |
| `node --input-type=module -e "import { randomBytes } …"` (comando documentado) | Genera hex de 64 chars; comando del `.env.example`/README **ejecutable** ✓ |
| Parseo de los 31 bloques ` ```json ` del contrato | 31/31 JSON válido; ejemplos coherentes con DTOs reales (login incluye `lastLogin`+`fechaActualizacion`; registro/me/admin los omiten; `passwordHash` jamás aparece) |
| `bash -n` sobre 37 bloques bash de README/DEPLOYMENT/MIGRATION_GUIDE | 36 OK; 1 "fallo" esperado = placeholder `urbanfix-backend:<tag_anterior>` (notación intencional, no defecto) |
| `node --check` de `src/config/prisma.js` e `index.js` | Sintaxis OK; diff de `prisma.js` = 0 líneas no-comentario |
| Conteo `it(`/`test(` en `tests/api/` | 67 + 11 = **78** — el "78 pruebas" de README/PLAN es exacto ✓ |
| Inventario `verify-migrations.js` | Bloques **F0–F11 + F2-Mislabeled + verificación sentinel** (mensaje final: "F0-F11 PASARON"; banner interno aún dice "F0-F10") |
| Resolución de enlaces relativos en docs cambiados | Todos existen (`AGENTS.md`, `API_CONTRACT.md`, `DEPLOYMENT.md`, `MIGRATION_GUIDE.md`, `../README.md`, `../.env.example`, 5 reportes `qa/be-0*`). **No hay enlaces con anchor** hacia secciones del contrato → la renumeración no rompe nada |
| Enums/schemas/dto contra Zod + Prisma + servicios | Roles, 8 categorías, `RECHAZADA` deprecada-en-bolsa, paginación `page/limit≤100`, filtros admin vía `GET /solicitudes?estado=` (sin ruta `/admin/solicitudes`, sin filtro server-side por rol de usuario), PATCH nullable (`celular: null` aceptado; `{}` → 400 donde hay `refine`), historial filtra `RECHAZO` a clientes, `SELECT…FOR UPDATE` + P2002→409: **todo coincide** |

**Solo lectura (sin reejecución, conforme a despacho):** suite `npm test` (78), `test:migrations`, build Docker, `/ready` bajo pausa. El código es idéntico al candidato `84d5db6` ya aprobado funcionalmente (`git diff` de `src/`, `tests/`, `prisma/`, `Dockerfile`, `compose.yaml` entre ambos = vacío), así que las aprobaciones funcionales previas siguen cubriendo el runtime.

**E1/E2 verificados resueltos:** `.env.example` + README §"Comportamiento de Comillas" + DEPLOYMENT §3 ahora distinguen correctamente Compose (despoja comillas) de `docker run --env-file` (las conserva literales) — E1 cerrado. `prisma.js`, contrato §1.4, DEPLOYMENT §6.2 y README §6 describen timeouts **por fase** sin SLA universal y citan la medición real ~4.005–4.012s — E2 cerrado.

## Defectos (documentales; corrección en texto, no en código)

### Contradicciones semánticas reales (afectan al consumidor del contrato)

- **D1 — §1.2 "Todas las respuestas de error utilizan un envoltorio estándar" es falso para `/ready`.** El contrato mismo (§1.4) documenta respuestas 503 con `{ "status", "message", "timestamp" }` — sin objeto `error`. *Ubicación:* `API_CONTRACT.md` línea 45. *Corrección:* acotar el alcance ("todas las respuestas de error de la API REST bajo `/api` y del manejador global") o añadir la excepción explícita de las sondas `/health`/`/ready`.
- **D2 — Tabla del 400 promete `VALIDATION_ERROR` para JSON malformado y `params`; la realidad difiere.** (a) Verificado: cuerpo JSON sintácticamente inválido → **HTTP 400 con `error.code = "INTERNAL_ERROR"`** y el mensaje crudo del parser (`express.json()` produce `err.status=400` sin `err.code`). (b) Ninguna ruta valida `req.params` con Zod (solo `body` y `query`); un `:id` con formato inválido llega al servicio y responde **404 NOT_FOUND**, no 400. *Ubicación:* línea 64. *Corrección:* limitar la fila a fallos de esquema Zod sobre `body`/`query`, y documentar como excepciones reales: JSON malformado → 400 `INTERNAL_ERROR` con mensaje del parser; `:id` no validado → 404.
- **D3 — Fila del 500: "En producción no expone trazas ni detalles internos" no está implementado.** Verificado con `NODE_ENV=production`: el handler global devuelve `err.code` y `err.message` verbatim (se probó `P2021` + texto interno); no hay saneamiento condicionado a `NODE_ENV`. *Ubicación:* línea 70. *Corrección:* describir el comportamiento real (500 devuelve `error.code`/`message` del error capturado, que pueden contener detalles internos del driver) o reformular la garantía como limitación conocida; no afirmar una protección inexistente.
- **D4 — §1.3 documenta `Access-Control-Allow-Credentials: false`; el middleware nunca emite esa cabecera** (verificado por stub: en todas las ramas las únicas cabeceras CORS son `Vary`, `Access-Control-Allow-Origin`, `Allow-Methods`, `Allow-Headers`). *Ubicación:* línea 81. *Corrección:* "la API omite por completo `Access-Control-Allow-Credentials`" (equivalente funcional a `false`, pero la cabecera no viaja).
- **D5 — §1.3 cita el mensaje de rechazo como `"Origen no permitido por CORS"`; el código emite `"Origen no permitido por la política CORS"`** (verificado por stub). *Ubicación:* línea 79. *Corrección:* usar el texto exacto del código o referenciar solo `code: CORS_ORIGIN_DENIED` sin citar `message`.

### Conteo falso de la suite de migraciones

- **D7 — "11 escenarios (F0 a F10)" es incorrecto.** `verify-migrations.js` ejecuta **F0–F11 + F2-Mislabeled + verificación sentinel** (su propio mensaje final dice `F0-F11`; el reporte QA de BE-01 ya escribió "F0–F11 + sentinel"). *Ubicaciones:* `README.md` línea 171; `BACKEND_PLAN.md` líneas 23 y 35 ("11 escenarios F0 a F10" / "11 fixtures (F0 a F10)"); relacionado: `MIGRATION_GUIDE.md` líneas 60 y 209 ("Fixtures F0 a F10" / "escenarios F0 a F10", aunque su matriz sí incluye la fila F2-Mis). *Corrección:* enumerar la realidad, p.ej. "F0–F11, más el fixture F2-Mislabeled y la verificación de supervivencia del sentinel"; evitar el número 11 o recalcularlo (13 escenarios con nombre + sentinel).

### Precisiones menores

- **D6 — "Identificadores: UUID v4" sobreafirma.** La generación por defecto (`@default(uuid())` en Prisma) sí produce v4, pero: el seed inserta IDs fijos con nibble de versión `1` (`a1111111-1111-…`), varios ejemplos del propio contrato no son v4 (`f1e2d3c4-b5a6-7890-…` v7, `a2b3c4d5-e6f7-8901-…` v8, `9a8b7c6d-5e4f-3a2b-…` v3) y no existe validación UUID sobre parámetros de entrada. *Ubicación:* línea 16. *Corrección:* "los IDs se generan por defecto como UUID v4" (no prometer que todo ID lo sea ni insinuar validación) y/o corregir los ejemplos a forma v4 (`4` en el 3er grupo, `8/9/a/b` en el 4º).
- **D8 — README §"1. Clonar o Ubicar el Repositorio" no contiene ningún `git clone` ni checkout.** Solo cubre el caso de checkout existente; un lector nuevo no puede seguir la guía (y clonar `origin/main` ni siquiera contendría este trabajo — el remoto llega solo a `e40b9ba`, algo que README sí explica correctamente en "Estado de Git"). *Corrección:* añadir `git clone` + `git checkout <rama>` con la nota de que las ramas de trabajo aún son locales, o retitular la sección.
- **D9 — README línea 58 da por fijo el nombre `backend_db-data`.** El volumen real es `db-data` prefijado por el **nombre del proyecto Compose** (por defecto el directorio): solo es `backend_db-data` si el checkout se llama `backend`. DEPLOYMENT §5.1 ya lo menciona con cuidado ("`urbanfix-db-data` o `backend_db-data`"). *Corrección:* "volumen `db-data` (nombrado por Compose como `<proyecto>_db-data`, p.ej. `backend_db-data` en un checkout estándar)".
- **D10 — §8.2 lista 5 estados filtrables omitiendo `RECHAZADA`, que el schema sí acepta** (`estadoEnum` incluye los 6 valores; `?estado=RECHAZADA` pasa validación y filtra —aunque en bolsa nunca haya filas—). *Corrección:* listar los 6 con la nota de deprecación o añadir "también se acepta `RECHAZADA` (deprecada)".

## Veredicto por criterio (#13)

| Criterio | Resultado |
|---|---|
| Contrato completo: todas las rutas + sondas + alias documentados | ✅ 23/23 con sección; matriz arriba |
| Fidelidad a schemas, DTOs, controladores y reglas | ✅ en lo funcional (DTOs, roles, bolsa, rechazos, transiciones, concurrencia); ❌ en errores/CORS por D1–D5 |
| Guías ejecutables (instalación, env, migraciones, Docker) | ✅ comandos verificados; ⚠️ D8 (sin clone) y D7 (conteo F0-F10) |
| Exclusiones honestas (sin aprobación Frontend, sin realtime UI, sin URL pública, #15 excluida) | ✅ declaradas correctamente en §11, README final, DEPLOYMENT §7, PLAN |
| E1 (comillas Compose vs Docker CLI) | ✅ resuelto y consistente en `.env.example`, README, DEPLOYMENT |
| E2 (timeouts por fase, sin SLA universal) | ✅ resuelto en `prisma.js`, contrato, DEPLOYMENT, README |
| Sin cambios de comportamiento / rutas protegidas intactas | ✅ diff 100% documental; `frontend/`, `data/`, `qa/` sin tocar |

**Veredicto global: CAMBIOS REQUERIDOS** — devolver al builder D1–D5, D7 (y preferiblemente D6, D8–D10 en la misma pasada). Nada de lo pedido requiere tocar código productivo: es alinear la documentación con el comportamiento real ya aprobado.

## Dependencias y recursos

- Dependencia externa registrada y respetada: conformidad/consumo de la SPA es de Frontend; no se afirma ni se prueba. Tiempo real: solo GET autenticadas documentadas.
- Issue #15 excluida: sin publicación, hosting ni credenciales.
- Recursos propios: `/tmp/uf-qa-be05/` (sondas), `backend/node_modules` instalado por QA en el workspace (no versionado; `.dockerignore` ya lo excluye). Sin bases, contenedores ni `.env` creados. Árbol Git protegido: solo este reporte añadido.
