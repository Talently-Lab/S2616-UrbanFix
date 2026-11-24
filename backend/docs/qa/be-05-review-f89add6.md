# Revalidación QA — BE-05 / issue #13, candidato corregido `f89add6`

**Tipo:** revalidación final del candidato corregido tras la revisión [be-05-review-544c550.md](./be-05-review-544c550.md) (D1–D10).
**Veredicto: APROBACIÓN TÉCNICA** — los 10 defectos documentales están resueltos con fidelidad verificada contra el código auditado; no quedan afirmaciones de contrato falsas ni conteos incorrectos. Cambio exclusivamente documental.

## Alcance y hashes

| Ítem | Valor |
|---|---|
| Candidato | `f89add69255bb77b8a3726346c3cdafc474f3b34` ("docs(api): resolver D1-D10 tras revision QA de BE-05 (544c550)") sobre `544c550` |
| Workspace QA | `GonzaCarrillo/be-13-docs-qa`: cherry-pick del candidato sobre el reporte `0ece425` → local `5a61eb4`; `git diff f89add6 HEAD` = **solo el reporte QA previo** → igualdad de archivos con el candidato verificada |
| Diff `544c550..f89add6` | 4 archivos, +40/−22: `backend/README.md`, `docs/API_CONTRACT.md`, `docs/BACKEND_PLAN.md`, `docs/MIGRATION_GUIDE.md` |
| Sin cambios | `src/`, `tests/`, `prisma/`, `package*.json`, `Dockerfile`, `compose.yaml`, `.env.example` (valores activos intactos), `frontend/`, `data/`, `qa/` |

## Revalidación por defecto

| D | Resumen | Veredicto | Evidencia |
|---|---|---|---|
| D1 | §1.2 "todos los errores usan envelope" vs `/ready` 503 plano | ✅ RESUELTO | §1.2 ahora acota: "respuestas de error de la API REST bajo `/api` y las emitidas por el manejador global", con excepción explícita de sondas operativas (`/ready` 503 → DTO plano, remite a §1.4). Correcto: el 503 lo emite el handler de la ruta, no el manejador global |
| D2 | 400 prometía `VALIDATION_ERROR` para JSON malformado y `params` | ✅ RESUELTO | Fila 400 limitada a "fallos de validación de esquema Zod sobre `body` o `query`" + nota que documenta lo verificado: JSON malformado → 400 `INTERNAL_ERROR` con mensaje del parser (coincide con mi smoke: `Unterminated string in JSON at position 10…`); `:id` sin validación Zod → 404, o 403 cuando la autorización por rol actúa antes — preciso: `authorize()` corre como middleware antes del servicio |
| D3 | 500 "en producción no expone detalles internos" sin implementar | ✅ RESUELTO | Fila reescrita: "`INTERNAL_ERROR` (o código de error del motor)… pueden incluir detalles internos del driver o de Prisma"; nota explícita de que se reenvía `err.code`/`err.message` sin saneamiento por `NODE_ENV`, declarado "límite conocido… área identificada para futuro hardening". Ya no se afirma seguridad inexistente — coincide con lo verificado (`P2021` + mensaje crudo en producción) |
| D4 | `Access-Control-Allow-Credentials: false` citado pero nunca emitido | ✅ RESUELTO | Ahora dice "la API **omite por completo** la cabecera… (equivale a no autorizar credenciales)" — igual a lo comprobado por stub: solo `Vary`, `ACAO`, `Allow-Methods`, `Allow-Headers` |
| D5 | Mensaje CORS citado incorrecto | ✅ RESUELTO | El ejemplo ahora cita `"Origen no permitido por la política CORS"` — coincide byte a byte con `cors.middleware.js` y mi stub |
| D6 | "UUID v4" como convención universal | ✅ RESUELTO | Convención reformulada: "generan por defecto como UUID v4 (`@default(uuid())`). No se impone validación estricta de versión v4 sobre parámetros de entrada y ciertos identificadores fijos (seed) utilizan versiones específicas". Además los 6 UUIDs de ejemplo fueron corregidos a forma v4 real (verificado programáticamente: versión `4`, variante `8/9/a/b` en los 6) |
| D7 | "11 escenarios (F0 a F10)" falso | ✅ RESUELTO | README, PLAN (×2) y MIGRATION_GUIDE ahora dicen "F0 a F11, más el fixture F2-Mislabeled y la comprobación de supervivencia del sentinel" — coincide con `verify-migrations.js` (F0–F11 + F2-Mis + sentinel). La matriz de la guía ganó la fila F11 ("Simulación de excepciones normales / prueba de teardown"), fiel al bloque F11 del runner. Sin restos de "F0 a F10"/"11 escenarios" |
| D8 | Sección "Clonar" sin `git clone` | ✅ RESUELTO | Renombrada "1. Obtener o Ubicar el Repositorio" con Opción 1: `git clone https://github.com/Talently-Lab/S2616-UrbanFix.git` (URL idéntica a `origin` verificada) + `git checkout chore/backend-orchestration` (= `e40b9ba` remoto, rama existente) + nota honesta de que BE-03…BE-05 solo viven en ramas locales. Opción 2: checkout existente |
| D9 | Nombre de volumen `backend_db-data` como fijo | ✅ RESUELTO | Ahora: volumen `db-data` "nombrado por Docker Compose como `<proyecto>_db-data`, por ejemplo `backend_db-data` en una estructura estándar" — refleja el prefijo por nombre de proyecto |
| D10 | Filtro `estado` omitía `RECHAZADA` | ✅ RESUELTO | §8.2 lista los 6 estados del enum con nota de que `RECHAZADA` pasa validación aunque esté deprecada en bolsa — coincide con `estadoEnum` |

## Comprobaciones ejecutadas en esta revalidación

- `git cherry-pick f89add6` sobre `0ece425` → `5a61eb4`; `git diff f89add6 HEAD` = solo reporte previo (igualdad de árbol con el candidato).
- Diff íntegro `544c550..f89add6` leído y contrastado con el código ya auditado (`src/index.js`, `cors.middleware.js`, `validate.middleware.js`, `env.js`, `verify-migrations.js`, `solicitud.schema.js`, `compose.yaml`, `prisma/seed.js`).
- Parseo de los **31 bloques JSON** del contrato: 31/31 válidos.
- Validación programática de los **6 UUIDs de ejemplo**: todos con forma v4 correcta (nibble de versión `4`, variante `8/9/a/b`).
- `bash -n` sobre los 12 bloques bash del README (incluido el nuevo bloque de clone/checkout): todos con sintaxis válida.
- Barrido de textos residuales "F0 a F10"/"11 escenarios"/"11 fixtures" en README y docs: **0 ocurrencias restantes** (excepto histórico de reportes QA previos, intencional).
- Enlaces relativos de los 4 archivos cambiados: todos los destinos existen; sin anchors nuevos rotos (la renumeración previa no era referenciada).
- Cobertura de rutas: las secciones §4–§9 del contrato no cambiaron en este commit salvo los UUIDs de ejemplo y el párrafo `estado`; el inventario de **21 canónicas + 2 alias = 23 operaciones** de la revisión previa permanece vigente.
- No se reejecutaron los 78 tests ni el build Docker (cambio solo de wording; la aprobación funcional de #14/`84d5db6` sigue vigente — `src/` y `tests/` idénticos).

## Veredicto por criterio (#13)

| Criterio | Resultado |
|---|---|
| Contrato completo (23 operaciones) | ✅ |
| Fidelidad a schemas/DTOs/controladores/reglas, incluido el área de errores y CORS | ✅ |
| Guías ejecutables y honestas (clone con aviso de remoto limitado, fixtures correctos, volumen prefijado) | ✅ |
| Exclusiones honestas (Frontend = dependencia externa; sin realtime; **#15 excluida, sin URL pública ni hosting**) | ✅ |
| E1/E2 | ✅ sigue resuelto |
| Diff solo documental, rutas protegidas intactas | ✅ |

**Veredicto global: APROBADO** para integración local. Sin falsedades de contrato pendientes; sin cambios pedidos. Queda en manos del arquitecto la integración y la presentación del lote al usuario antes de cualquier push (que requiere aprobación expresa del usuario).

## Recursos

Sonda temporal `/tmp/s.sh` eliminada. `backend/node_modules` de QA persiste en workspace (no versionado). Sin bases, contenedores ni `.env` creados. `frontend/`, `data/`, `qa/` sin tocar.
