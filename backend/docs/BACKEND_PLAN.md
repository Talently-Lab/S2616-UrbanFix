# Plan de Cierre de Checkpoints Backend

Fecha: 2026-11-20. Base auditada: `95d9587` en `main`.
Reglas de ejecución y responsabilidades: [AGENTS.md](../../AGENTS.md).

## Backlog

Cada issue contiene problema, alcance y criterios verificables. Builder:
Antigravity. QA independiente: Devin. Arquitectura y coordinación: Codex.

| ID | Issue | Prioridad | Dependencias | Estado de trabajo |
| --- | --- | --- | --- | --- |
| BE-01 | [#9 Reparar migraciones](https://github.com/Talently-Lab/S2616-UrbanFix/issues/9) | P0 | Ninguna | Integrada en rama local; QA aprobado en `e826df7`; push de esta entrega autorizado por usuario hasta `e40b9ba`; issue abierta |
| BE-02 | [#10 Restaurar npm test](https://github.com/Talently-Lab/S2616-UrbanFix/issues/10) | P0 | BE-01 para validación final | Integrada en rama local; 31 casos HTTP y QA aprobado en `0829fc0`; M1 verificado; push de esta entrega autorizado hasta `e40b9ba`; issue abierta |
| BE-03 | [#11 Entorno, JWT y CORS](https://github.com/Talently-Lab/S2616-UrbanFix/issues/11) | P1 | Coordinar tests con BE-02 | Integrada en rama local; QA aprobado en `4b1cc2d` (59 tests); pendiente autorización de push |
| BE-04 | [#12 Carreras y transiciones](https://github.com/Talently-Lab/S2616-UrbanFix/issues/12) | P1 | BE-01, BE-02 | Integrada en rama local; QA aprobado en `4a1afab` (71 tests); pendiente autorización de push |
| BE-06 | [#14 Docker y preparación de despliegue](https://github.com/Talently-Lab/S2616-UrbanFix/issues/14) | P1 | BE-01, BE-03 | Integrada en rama local; QA técnico aprobado en `84d5db6` (78 tests, D1–D4 resueltos); pendiente autorización de push |
| BE-05 | [#13 Contrato y documentación](https://github.com/Talently-Lab/S2616-UrbanFix/issues/13) | P1 | BE-01 a BE-04, BE-06 | Integrada localmente; QA aprobado en `f89add6`; 23 operaciones documentadas y D1–D10 resueltos; pendiente autorización de push |
| BE-07 | [#15 Publicación y verificación pública](https://github.com/Talently-Lab/S2616-UrbanFix/issues/15) | P1 | BE-01 a BE-06, QA aprobado | **Excluida por instrucción explícita del usuario**; no ejecutar, ni aprovisionar ni pedir infraestructura |

## Secuencia Ejecutada y Estado

1. **BE-01:** Antigravity implementó la secuencia canónica limpia (eliminando duplicados obsoletos de semanas previas) y la herramienta `db:precheck`. Devin validó la matriz de migraciones F0 a F11 (incluyendo F2-Mislabeled y supervivencia del centinela) en [be-01-review-e826df7.md](./qa/be-01-review-e826df7.md).
2. **BE-02:** Antigravity restauró el harness de pruebas automatizadas con Docker efímero y teardown reactivo de señales (`SIGINT`/`SIGTERM`, resolución de M1). Devin aprobó 31 casos en [be-02-review-0829fc0.md](./qa/be-02-review-0829fc0.md).
3. **Pushes autorizados a la fecha:** El usuario autorizó formalmente el push de las entregas de BE-01 y BE-02 hasta el commit `e40b9ba` en la rama `chore/backend-orchestration`. Todo el trabajo posterior reside exclusivamente en la rama de trabajo local.
4. **BE-03:** Validación sincrónica de entorno en memoria (`src/config/env.js`), obligatoriedad de `JWT_SECRET` (mínimo 32 caracteres, sin fallbacks débiles y rechazando placeholder) y middleware de CORS configurable con allowlist estricta en producción. Devin aprobó 59 casos en [be-03-review-4b1cc2d.md](./qa/be-03-review-4b1cc2d.md).
5. **BE-04:** Control de concurrencia pesimista con bloqueo de fila `SELECT ... FOR UPDATE` en PostgreSQL para transiciones de estado y bolsa de trabajo. Serialización estricta ante colisiones (un ganador 200 y perdedores 409, sin errores 500). Devin aprobó 71 casos en [be-04-review-4a1afab.md](./qa/be-04-review-4a1afab.md).
6. **BE-06:** Creación de artefacto Docker reproducible (`node:24-bookworm-slim`, usuario no-root `node`, dependencias por `npm ci`, sin auto-migrate ni auto-seed en arranque), archivo `compose.yaml` local aislado, sonda `/ready` con verificación de esquema y timeouts acotados por fase (`connectionTimeoutMillis: 4000`, `query_timeout: 4000`, `statement_timeout: 4000`), resolviendo defectos D1 a D4. Devin aprobó la entrega en [be-06-review-84d5db6.md](./qa/be-06-review-84d5db6.md) con 78 tests.
7. **BE-05 (Entrega Actual):** Consolidación exhaustiva del contrato de API ([API_CONTRACT.md](./API_CONTRACT.md)), documentación de instalación y operación ([README.md](../README.md), [DEPLOYMENT.md](./DEPLOYMENT.md), [.env.example](../.env.example)), inventario de rutas completas (incluyendo `/api/admin`, `/api/users/me`, sondas operativas), diferenciación precisa de DTOs, y resolución de las observaciones editoriales E1 (comillas en Compose vs Docker CLI) y E2 (timeouts acotados por fase). La revalidación [be-05-review-f89add6.md](./qa/be-05-review-f89add6.md) aprueba las 23 operaciones y las correcciones D1–D10; el cambio final es documental, sin modificar runtime ni repetir innecesariamente las pruebas funcionales.
8. **BE-07 / #15 Excluida:** Por indicación expresa del usuario ("no hagas la 15"), la publicación pública en internet no se ejecuta. El ciclo de desarrollo concluye con la suite local verificada y la documentación consolidada.

## Evidencia y Métricas de QA Integradas

- **Suite de Pruebas HTTP (`npm test`):** 78 casos pasando (100% verde), cubriendo registro, login, usuarios, alias, administración, categorías, solicitudes, bolsa de trabajo, rechazos, concurrencia de transiciones, validación de startup, liveness `/health` y readiness `/ready`.
- **Suite de Migraciones (`npm run test:migrations`):** Matriz completa F0 a F11 más el fixture F2-Mislabeled y la comprobación de supervivencia del sentinel, con base PostgreSQL limpia, baselining con datos preexistentes de semana 3 mediante procedimiento conservador, diffs de snapshots DDL y mitigación de procesos huérfanos.
- **Auditoría de Secretos y Confidencialidad:** Las respuestas 503 y los registros de error de configuración nunca exponen contraseñas, URLs de conexión ni consultas SQL internas.

## Decisiones de Alcance y Límites Técnicos

- **Modelo de datos:** Se mantiene la relación `SolicitudServicio` con categoría sin agregar una tabla `Servicio` redundante.
- **Tiempo real y SPA:** El refresco y consulta de estado se efectúa mediante consultas GET autenticadas al contrato REST existente. No se agregan tecnologías de push (ni SSE ni WebSockets). El refresco automático de pantalla y la conformidad de diseño continúan como dependencias externas del equipo de Frontend.
- **Rutas protegidas y responsables:** Está prohibido modificar `frontend/`, `data/` y `qa/`. Los workers escriben únicamente en backend; el arquitecto mantiene `AGENTS.md` y la sección backend del `README.md` raíz, según las reglas de coordinación.
- **Control de publicación:** Ningún cambio local posterior a `e40b9ba` ha sido publicado en GitHub. Todo push futuro requiere aprobación explícita del usuario.

## Cierre técnico del alcance

Las seis entregas BE-01 a BE-06 tienen aprobación independiente de QA y están
integradas en la rama local de coordinación. Las issues de GitHub permanecen
abiertas y no hubo merge a main. BE-07 / #15 sigue excluida. El lote posterior
a e40b9ba se presenta para autorización explícita de push antes de publicarlo.

Límites documentados: la aceptación visual del Frontend y su refresco automático
no se verifican en este ciclo; las sondas locales no prueban publicación pública.
El contrato también identifica el comportamiento actual de errores globales
(400 de parser y mensajes 500 sin saneamiento por entorno) sin atribuir al
backend garantías que no implementa. No se añadieron cambios fuera del alcance
para alterar esos comportamientos durante la consolidación documental.
