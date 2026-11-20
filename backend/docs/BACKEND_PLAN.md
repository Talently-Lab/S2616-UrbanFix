# Plan de cierre de checkpoints backend

Fecha: 2026-11-20. Base auditada: `95d9587` en `main`.
Reglas de ejecución y responsabilidades: [AGENTS.md](../../AGENTS.md).

## Backlog

Cada issue contiene problema, alcance y criterios verificables. Builder:
Antigravity. QA independiente: Devin. Arquitectura y coordinación: Codex.

| ID | Issue | Prioridad | Dependencias | Estado de trabajo |
| --- | --- | --- | --- | --- |
| BE-01 | [#9 Reparar migraciones](https://github.com/Talently-Lab/S2616-UrbanFix/issues/9) | P0 | Ninguna | Integrada localmente; QA aprobado en e826df7; push de esta entrega autorizado por usuario; issue abierta |
| BE-02 | [#10 Restaurar npm test](https://github.com/Talently-Lab/S2616-UrbanFix/issues/10) | P0 | BE-01 para validación final | Integrada localmente; 31 casos HTTP y QA aprobado en 0829fc0; M1 verificado en práctica; push de esta entrega autorizado; issue abierta |
| BE-03 | [#11 Entorno, JWT y CORS](https://github.com/Talently-Lab/S2616-UrbanFix/issues/11) | P1 | Coordinar tests con BE-02 | Integrada localmente; QA aprobado en 4b1cc2d, 59 tests; sin autorización de nuevo push |
| BE-04 | [#12 Carreras y transiciones](https://github.com/Talently-Lab/S2616-UrbanFix/issues/12) | P1 | BE-01, BE-02 | Integrada localmente; QA aprobado en 4a1afab, 71 tests; sin aprobación de push |
| BE-05 | [#13 Contrato y documentación](https://github.com/Talently-Lab/S2616-UrbanFix/issues/13) | P1 | BE-01, BE-02, BE-03, BE-04, BE-06 | README raíz/backend y .env.example completos; falta consolidar contrato y comportamiento final |
| BE-06 | [#14 Docker y preparación de despliegue](https://github.com/Talently-Lab/S2616-UrbanFix/issues/14) | P1 | BE-01, BE-03 | Implementada localmente; Dockerfile Node 24 slim no-root sin auto-migrate/seed, compose.yaml, GET /ready y timeouts <=5s, 78 tests; pendiente validación QA Devin |
| BE-07 | [#15 Publicación y verificación pública](https://github.com/Talently-Lab/S2616-UrbanFix/issues/15) | P1 | BE-01 a BE-06, QA aprobado | Bloqueada hasta definir infraestructura y autorizar publicación concreta |

## Secuencia

1. Antigravity prepara la estrategia de BE-01 y la eleva al arquitecto antes de
   cambiar historial publicado. Devin reproduce la falla de instalación y de
   `npm test`, y entrega matriz de aceptación para BE-01/BE-02 en paralelo.
2. Tras la decisión del arquitecto, Antigravity implementa BE-01. Devin valida
   el commit entregado y devuelve defectos o aprobación con evidencia.
3. Antigravity implementa BE-02 y BE-03, seguido de BE-04 y BE-06; Devin valida
   cada entrega. El arquitecto puede reasignar lotes sin solapar escritura.
4. Consolidar BE-05 y verificar documentación contra comandos reales.
5. Presentar artefacto y plan de BE-07. Solicitar solo los datos y autorizaciones
   que falten para el proveedor, la base, el origen de frontend y la publicación.

Los despachos de Orca son la fuente de verdad del trabajo en ejecución. Una
issue permanece abierta hasta cumplir sus criterios y la revisión de QA.

## Evidencia inicial

- `npm ci`, `prisma validate` y `prisma generate`: correctos en auditoría.
- `prisma migrate deploy` con PostgreSQL vacío: falla en
  `20261005143951_init`, P3018 / SQLSTATE 42710 (`Rol` ya existe).
- `npm test`: falla porque `../scripts/test-api.sh` no existe.
- Con `prisma db push` en otra base temporal, 40 peticiones HTTP, aceptación
  concurrente y preflight CORS local pasaron; esto no valida las migraciones.
- Seed ejecutado dos veces sin duplicar los registros que crea.

## Decisiones de alcance

Se conserva el modelo actual `SolicitudServicio` y categoría, sin agregar una
tabla `Servicio` no utilizada por el contrato. La frescura del estado y del
técnico se documentará mediante GET autenticado; no se incorpora una tecnología
de push sin una necesidad acordada.

No se modifican `frontend/`, `data/` ni `qa/`. El cierre completo de tiempo real
en la SPA, la aprobación del contrato por Frontend y la integración visual
pública dependen de ese equipo. Los reportes de QA se guardan bajo backend.
No se presume que exista una base productiva o que sea descartable: toda
estrategia de migración debe distinguir instalación vacía y base existente.

## Control de publicación

La aprobación técnica y la integración en la rama local no autorizan un push.
Todo push requiere aprobación explícita del usuario para la rama y los commits
concretos. Las issues se mantienen abiertas en GitHub mientras sus entregas
no estén publicadas y verificadas en el destino correspondiente.

## Evidencia de BE-02

La revisión [be-02-review-0829fc0.md](./qa/be-02-review-0829fc0.md) valida
31 casos HTTP con PostgreSQL migrado, en los modos Docker automático y
TEST_DATABASE_URL explícita. También cubre instalación sin cliente generado,
fallo de readiness, fallo de cleanup, ejecución directa sin entorno del harness
y regresión negativa. Las ventanas de señales probadas no dejaron huérfanos.
Persiste un límite teórico no reproducido durante CREATE DATABASE en vuelo;
no se promete limpieza ante SIGKILL o caída del host. El filtro de rol en el
listado de usuarios no forma parte del requerimiento; la idempotencia del
seed se verifica en test:migrations, no se duplica en cada corrida HTTP.

## Entrega autorizada por el usuario

El usuario autorizó el commit y push de la entrega actual de BE-01/BE-02 y
documentación a la rama `chore/backend-orchestration`. BE-03 sigue en su
workspace de desarrollo y queda fuera de esta publicación. Esta autorización
no incluye merge a `main`, despliegue ni pushes futuros de nuevas entregas.

## Evidencia de BE-03

La revisión [be-03-review-4b1cc2d.md](./qa/be-03-review-4b1cc2d.md) aprueba
59 tests y la matriz de migraciones. QA verificó startup inválido, precedencia
de .env y entorno explícito, JWT real con 15m, rechazo de token expirado, CORS
permitido/denegado/sin Origin, Vary y ausencia de secretos en errores. Los cambios
están integrados localmente; la autorización de publicación anterior cubría
solo BE-01/BE-02. BE-03 y las entregas siguientes requieren aprobación de push.

## Evidencia de BE-04

La revisión [be-04-review-4a1afab.md](./qa/be-04-review-4a1afab.md) aprueba
71 tests. La primera revisión reprodujo seis fallos concurrentes en el baseline
y verificó el fix con bloqueos reales de PostgreSQL. La revalidación resuelve la
falta de DATABASE_URL en la suite con centinelas en otro proceso (cero contactos
ante variables ausentes/vacías). Se mantienen documentadas las limitaciones de
las barreras temporizadas de tests y de sus contadores síncronos. La entrega
está integrada localmente y requiere autorización de push.

## Evidencia de BE-06

Implementación de artefacto operativo y preparación de release (issue #14):
- `Dockerfile` actualizado a `node:24-bookworm-slim`, usuario no-root (`node`), instalación según `package-lock.json` verificado (`npm ci`), generación determinista de cliente Prisma sin secretos ni dependencias de red en build.
- `CMD ["node", "src/index.js"]`: arranca exclusivamente el servidor HTTP. Se eliminó la ejecución automática de `prisma migrate deploy` y `prisma/seed.js` al iniciar.
- Copia selectiva de utilidades de precheck (`tests/migrations/migration-precheck.js` y `tests/migrations/schemas/`) excluyendo suites de tests para mantener la imagen ligera.
- `.dockerignore` exhaustivo excluyendo `.env`, `.env.*`, logs, git y suites de tests.
- Endpoint público `GET /ready`: realiza consulta real a PostgreSQL (`prisma.$queryRaw`) comprobando presencia de las tablas de aplicación (`Usuario`, `SolicitudServicio`, `HistorialEstadoSolicitud`, `RechazoSolicitud`). Devuelve `200` si está preparada (la ausencia de filas de datos es válida) y `503` si la base no responde o faltan tablas. Se documenta su límite técnico: no realiza diff exhaustivo ni validación de checksums en cada petición (tarea que corresponde a `db:precheck` en release).
- Límites de timeout: `connectionTimeoutMillis: 5000` y `statement_timeout: 5000` en adaptador PrismaPg, acotando fallos de conexión a `<= 5s` sin consultas colgadas en segundo plano.
- Sonda `GET /health` preservada como liveness del proceso (devuelve `200` incluso con PostgreSQL caído). Ambas sondas integradas bajo política CORS existente y con respuestas 503 estrictamente sanitizadas sin filtrar credenciales ni sentencias SQL.
- Healthcheck de contenedor integrado usando `node:http` nativo (sin dependencias externas de `curl`).
- Archivo `backend/compose.yaml` versionado con servicios `db` (Postgres 16 Alpine con healthcheck) y `api`, volumen persistente aislado por proyecto y puertos configurables. Sin fallbacks de `JWT_SECRET` ni secretos inventados en `api`; soporta `DOCKER_DATABASE_URL` con percent-encoding para contraseñas con caracteres especiales.
- Suite `npm test` ampliada de 71 a 78 tests passing (100% verde), cubriendo liveness, readiness en base migrada, readiness 503 ante falta de esquema, y timeout acotado <= 5s ante PostgreSQL inaccesible.
- Smoke tests reales ejecutados cubriendo: startup fallido sin variables, password reservada (`probe@secret#/`), flujo homogéneo Compose, flujo directo con red propia, rollback atómico y recuperación automática de readiness.
- Documento [DEPLOYMENT.md](./DEPLOYMENT.md) y actualizaciones en `README.md`, `.env.example` y `API_CONTRACT.md`. La entrega está integrada localmente y requiere autorización de push.
