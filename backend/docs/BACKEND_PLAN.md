# Plan de cierre de checkpoints backend

Fecha: 2026-11-20. Base auditada: `95d9587` en `main`.
Reglas de ejecución y responsabilidades: [AGENTS.md](../../AGENTS.md).

## Backlog

Cada issue contiene problema, alcance y criterios verificables. Builder:
Antigravity. QA independiente: Devin. Arquitectura y coordinación: Codex.

| ID | Issue | Prioridad | Dependencias | Estado inicial |
| --- | --- | --- | --- | --- |
| BE-01 | [#9 Reparar migraciones](https://github.com/Talently-Lab/S2616-UrbanFix/issues/9) | P0 | Ninguna | Primera tarea de builder; requiere decisión de estrategia de migración |
| BE-02 | [#10 Restaurar npm test](https://github.com/Talently-Lab/S2616-UrbanFix/issues/10) | P0 | BE-01 para validación final | Devin comienza reproducción y matriz de casos; implementación posterior de Antigravity |
| BE-03 | [#11 Entorno, JWT y CORS](https://github.com/Talently-Lab/S2616-UrbanFix/issues/11) | P1 | Coordinar tests con BE-02 | Pendiente |
| BE-04 | [#12 Carreras y transiciones](https://github.com/Talently-Lab/S2616-UrbanFix/issues/12) | P1 | BE-01, BE-02 | Pendiente de reproducción; corregir defectos confirmados |
| BE-05 | [#13 Contrato y documentación](https://github.com/Talently-Lab/S2616-UrbanFix/issues/13) | P1 | BE-01, BE-02, BE-03, BE-04, BE-06 | Pendiente de consolidar comportamiento final |
| BE-06 | [#14 Docker y preparación de despliegue](https://github.com/Talently-Lab/S2616-UrbanFix/issues/14) | P1 | BE-01, BE-03 | Pendiente |
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
