# UrbanFix: coordinación de backend

## Alcance obligatorio

Este ciclo trabaja exclusivamente en backend. Se permite leer el resto del
repositorio para comprobar compatibilidad, pero está prohibido modificar
`frontend/`, `data/` y `qa/`, incluso sus configuraciones, archivos generados
y dependencias. Los tests y reportes de QA se guardan en `backend/tests/`
y `backend/docs/qa/`.

La issue **#15 (BE-07, publicación pública)** está excluida de este ciclo por
instrucción explícita del usuario. No ejecutarla, aprovisionar infraestructura
ni solicitar datos de hosting para ella. La preparación local de Docker y la
documentación de #13/#14 siguen autorizadas.

Los cambios de implementación se limitan a `backend/`. El arquitecto mantiene
este archivo y puede actualizar la sección backend de `README.md` y crear
workflows en `.github/workflows/` limitados al backend cuando una issue lo
requiera. Cualquier ampliación del alcance necesita autorización del usuario.

## Responsabilidades

- **Codex, arquitecto y coordinador:** divide el trabajo en issues, define
  decisiones de arquitectura y dependencias, despacha tareas, resuelve preguntas
  y revisa el resultado. Decide si la evidencia permite cerrar una issue.
- **Antigravity, builder:** implementa la issue asignada y sus pruebas de
  regresión dentro del alcance. Entrega cambios revisables y comandos con sus
  resultados; deriva a Codex decisiones que alteren contratos o datos existentes.
- **Devin, QA tester:** valida de forma independiente una revisión concreta,
  reproduce fallos y documenta resultados. Puede escribir tests y reportes en
  backend; devuelve los defectos al builder y no corrige código de producción.

## Flujo por issue

1. Leer la issue, este archivo y los documentos que la issue referencie.
   Confirmar archivos permitidos, dependencias y criterios de aceptación.
2. Registrar el commit base y el estado inicial de Git. Cada despacho tiene
   un responsable de escritura; usar workspaces separados si los cambios
   pudieran solaparse. No modificar cambios ajenos.
3. Builder: reproducir el problema, implementar y ejecutar las comprobaciones
   relevantes. Comunicar bloqueos por el buzón de orquestación de Orca.
4. QA: verificar la revisión entregada en PostgreSQL aislado, registrar comandos,
   resultados esperados/reales y defectos con pasos para reproducir. Un test que
   no pudo ejecutarse se informa como bloqueado, nunca como aprobado.
5. Arquitecto: revisar arquitectura, evidencia y diff. Comprobar con Git que
   `frontend/`, `data/` y `qa/` no cambiaron. Cerrar solo con aceptación de QA
   y todos los criterios cumplidos; separar implementación de despliegue público.

Usar las habilidades `orchestration` y `orca-cli` para iniciar workers y
comunicarse con ellos; cargar sus guías desde el ejecutable Orca de la sesión.
Los workers despachados usan `ask` para preguntas y `worker_done` para entregar
su resultado, según el preámbulo de su despacho. No sustituir los agentes
asignados sin autorización del usuario.

## Decisiones y límites técnicos

- Conservar el stack Express, Prisma y PostgreSQL y la compatibilidad del
  contrato REST consumido por el frontend. Este ciclo no agrega una tabla
  `Servicio`: el modelo vigente utiliza `SolicitudServicio` y categoría.
- Para cambios de API, leer `backend/docs/API_CONTRACT.md` y actualizar el
  contrato junto con la implementación. La aprobación de Frontend y el consumo
  desde la SPA son dependencias externas; no declararlos probados por tests HTTP.
- Para migraciones, leer el historial completo antes de editarlo. Verificar una
  instalación vacía y documentar una ruta de actualización sin pérdida de datos.
  Preservar migraciones ya publicadas salvo decisión explícita del arquitecto;
  elevar una propuesta concreta si repararlas exige cambiar su historial.
- Usar bases y recursos temporales identificados por issue; limpiar solo los
  creados por el despacho. Nunca ejecutar reset, borrar volúmenes ni migrar una
  base compartida o productiva sin autorización específica del usuario.
- Configuración y secretos: ejemplos reproducibles sin secretos reales; JWT
  obligatorio, expiración configurable y seed de demostración explícito.
  Publicar una API no debe sembrar usuarios de prueba automáticamente.
- Tiempo real: primero documentar la actualización por consultas autenticadas
  del contrato existente. Agregar SSE/WebSocket requiere una decisión del
  arquitecto y una necesidad concreta; no prometer actualización de la SPA.
- Entregar commits locales por tarea cuando se soliciten. **Todo push a GitHub
  requiere aprobación explícita del usuario**, para la rama y los commits
  concretos que se presenten. La revisión del arquitecto o QA no sustituye esa
  aprobación; tampoco la aprobación de un push anterior. No crear PR que
  requiera publicar una rama hasta obtenerla. No hacer merge, publicar servicios,
  contratar infraestructura ni cerrar issues sin decisión del coordinador.

## Evidencia de entrega

Cada entrega identifica issue, commit o diff revisado, archivos modificados,
comandos ejecutados, resultado, limitaciones y recursos temporales eliminados.
La validación de flujos cubre autenticación y roles, aislamiento de solicitudes,
aceptación concurrente, rechazo, transiciones e historial cuando correspondan.
El despliegue solo está terminado al verificar una URL pública y su conexión
con PostgreSQL; un `/health` local o un Dockerfile no prueban producción.
