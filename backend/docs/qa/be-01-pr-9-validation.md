# Revalidación de la entrega específica de la issue #9

Fecha: 2026-11-20. Responsable: Codex, arquitecto/coordinador.

Esta comprobación valida la extracción de la reparación de migraciones sobre
`main@95d9587`, separada de las entregas de autenticación, API, concurrencia y
Docker. La aprobación independiente original de Devin consta en
[be-01-review-e826df7.md](./be-01-review-e826df7.md); esta revalidación del
coordinador comprueba la combinación exacta preparada para el PR de #9.

## Alcance

- Retira únicamente las dos migraciones iniciales duplicadas.
- Conserva byte a byte las tres migraciones canónicas y `schema.prisma`.
- Incluye precheck read-only, snapshots por etapa, guía de actualización y
  runner de migraciones con mejoras posteriores de aislamiento y limpieza.
- Añade `test:migrations` y `db:precheck` sin cambiar las dependencias.
- Las rutas, controladores, autenticación y configuración de producción
  permanecen iguales a `main`; `frontend/`, `data/` y `qa/` están intactos.

## Comandos ejecutados

Entorno: Node 24, npm y PostgreSQL 16 Alpine en contenedor exclusivo del despacho,
puerto localhost asignado dinámicamente y credenciales efímeras sin imprimir.

| Comprobación | Resultado |
| --- | --- |
| `npm ci --no-audit --no-fund` | Exit 0; 268 paquetes instalados según lockfile |
| `DATABASE_URL=<laboratorio> npx prisma validate` | Exit 0; esquema válido |
| `TEST_DATABASE_URL=<laboratorio> npm run test:migrations` | Exit 0; matriz completa verde, incluyendo generación del cliente |
| Comparación binaria de las tres SQL canónicas con `origin/main` | Idénticas |
| `node --check` de precheck y runner | Correcto |
| `git diff --cached --check` | Sin errores |
| Diff de rutas protegidas, `src/`, schema y lockfile | Sin cambios |

Resultados registrados por el runner:

- ✔ F0 superado exitosamente.
- ✔ F1 superado exitosamente.
- ✔ F2 superado exitosamente.
- ✔ F2-Mislabeled detectado y bloqueado exitosamente.
- ✔ F3 superado exitosamente.
- ✔ F4 superado exitosamente.
- ✔ F5 superado exitosamente.
- ✔ F6 superado exitosamente.
- ✔ F7 superado exitosamente.
- ✔ F8 superado exitosamente.
- ✔ F9 superado exitosamente.
- ✔ F10 superado exitosamente.
- ✔ F11 superado exitosamente.
- ✔ El sentinel ajeno uf_sentinel_must_survive_fa9b4668 sobrevivió a toda la ejecución sin ser tocado.

La instalación vacía se verificó mediante `migrate deploy` repetido y diff sin
cambios; el seed se ejecutó dos veces y los tres roles iniciaron sesión. Los
fixtures validan actualización conservadora y baselining con datos, además del
rechazo de estados no soportados. `db push` se usa únicamente para construir
el fixture F4 que simula una base sin ledger; no sustituye las migraciones de
instalación.

## Límites y limpieza

Las bases existentes desconocidas, con migraciones legacy o fallidas, requieren
backup y diagnóstico: el precheck las bloquea, no las repara automáticamente.
No se modificó ninguna base compartida o productiva. El contenedor exclusivo de
esta comprobación fue detenido y eliminado; los logs no contienen su contraseña.

La restauración del comando general `npm test` pertenece a #10 y se entrega por
separado. Este PR valida `npm run test:migrations`.
