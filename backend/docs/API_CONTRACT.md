# Contrato de API — UrbanFix

Versión: 1.0 (consolidada — BE-05 / issue #13)

Este documento especifica el contrato HTTP, rutas, estructuras de datos (DTOs), códigos de respuesta, errores, políticas de seguridad y reglas de concurrencia del backend de UrbanFix.

---

## 1. Convenciones Generales

- **Base URL para la API:** `http://localhost:3001/api`
- **Sondas operativas (fuera de `/api`):** `http://localhost:3001/health` y `http://localhost:3001/ready`
- **Formato de intercambio:** JSON (`Content-Type: application/json; charset=utf-8`).
- **Codificación de caracteres:** UTF-8.
- **Fechas y marcas de tiempo:** Cadenas en formato ISO 8601 en UTC (ej: `"2026-10-05T14:30:00.000Z"`).
- **Identificadores:** Cadenas de texto (string). En la base de datos se generan por defecto como UUID v4 (`@default(uuid())`). No se impone una validación estricta de versión v4 sobre parámetros de entrada y ciertos identificadores fijos (como los provistos en el seed de laboratorio) utilizan versiones específicas.
- **Autenticación:** Cabecera HTTP `Authorization: Bearer <token>` con token JWT firmado. Las rutas marcadas con 🔒 requieren autenticación obligatoria.
- **Seguridad de contraseñas:** La propiedad `passwordHash` se almacena exclusivamente con hash bcrypt (salt rounds 10) y **nunca** se devuelve ni se expone en ninguna respuesta HTTP de la API.

### 1.1 Formato de Respuesta Exitosa

Respuesta de entidad única:
```json
{
  "data": {
    "id": "a1b2c3d4-e5f6-4a8b-9c0d-1e2f3a4b5c6d"
  }
}
```

Respuesta de listados paginados:
```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 0
  }
}
```

### 1.2 Formato de Error

Todas las respuestas de error de la API REST bajo `/api` y las emitidas por el manejador global de excepciones utilizan un envoltorio estándar con un objeto `error` (a excepción de las sondas operativas de infraestructura fuera de `/api`, tales como `/ready` 503, que retornan su propio DTO plano de estado de servicio; ver §1.4):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Datos de entrada inválidos",
    "details": [
      {
        "field": "email",
        "message": "Email inválido"
      }
    ]
  }
}
```

| Código HTTP | `error.code` | Descripción / Cuándo ocurre |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Fallos de validación de esquema Zod sobre el cuerpo (`body`) o parámetros de consulta (`query`). |
| `401` | `UNAUTHORIZED` | Token ausente, token con formato no válido, firma incorrecta, token expirado o credenciales de login inválidas. |
| `403` | `FORBIDDEN` | Usuario autenticado cuyo rol o pertenencia no tiene permiso para la acción (ej. cliente intentando tomar solicitudes, o técnico accediendo a solicitudes que rechazó). |
| `403` | `CORS_ORIGIN_DENIED` | Origen del navegador no autorizado por la allowlist de `CORS_ORIGINS`. Devuelto sin cabecera `Access-Control-Allow-Origin`. |
| `404` | `NOT_FOUND` | Ruta no registrada o recurso solicitado inexistente en la base de datos. |
| `409` | `CONFLICT` | Conflicto de estado o unicidad: email ya registrado, rechazo repetido, solicitud ya tomada por otro técnico o transición de estado no válida. |
| `500` | `INTERNAL_ERROR` (o código de error del motor) | Error imprevisto en el servidor. El manejador devuelve `error.code` (predeterminado `INTERNAL_ERROR`) y `error.message` del error capturado, que pueden incluir detalles internos del driver o de Prisma. |

> [!NOTE] Precisiones sobre Errores 400 y 500 en el Backend Actual
> - **Cuerpos JSON malformados:** Si un cliente envía un cuerpo con sintaxis JSON inválida que no puede ser parseado por `express.json()`, el middleware emite un error con status 400 sin código predefinido; el manejador global lo captura y responde HTTP 400 con `error.code: "INTERNAL_ERROR"` y el mensaje del parser de Express (`Unexpected token...`), en lugar de `VALIDATION_ERROR`.
> - **Parámetros de ruta (`:id`):** Los parámetros de ruta (`req.params.id`) no son validados con Zod en los routers; si se envía un identificador con formato arbitrario o inexistente, la petición prosigue al servicio y responde `404 NOT_FOUND` (o `403 FORBIDDEN` si el control de acceso del usuario evalúa pertenencia antes de consultar la existencia), no `400`.
> - **Manejo de 500 y ausencia de saneamiento por entorno:** El manejador global de errores actual reenvía `err.code` y `err.message` de forma directa sin filtrar mensajes internos de PostgreSQL o Prisma según `NODE_ENV`. Este comportamiento representa un límite conocido del backend actual y un área identificada para futuro hardening.

### 1.3 Política CORS y Seguridad de Transporte

- **Allowlist configurable:** La API restringe las peticiones de navegadores mediante la variable `CORS_ORIGINS`.
  - En `development` y `test`: si se omite, admite de forma predeterminada `http://localhost:5173` y `http://127.0.0.1:5173`.
  - En `production`: **exige** una lista explícita y no vacía de orígenes HTTP(S) autorizados, separados por coma. Se rechazan terminantemente el comodín `*` y el origen `null`.
- **Comportamiento por origen:**
  - **Origen permitido:** Devuelve la cabecera `Access-Control-Allow-Origin: <origin>` reflejando el origen exacto y la cabecera `Vary: Origin`. Las peticiones preflight (`OPTIONS`) responden HTTP `204 No Content` con métodos y cabeceras autorizados (`Content-Type, Authorization`).
  - **Origen no permitido:** Devuelve HTTP `403` con `{ "error": { "code": "CORS_ORIGIN_DENIED", "message": "Origen no permitido por la política CORS" } }`, sin cabeceras `Access-Control-Allow-Origin`.
  - **Peticiones sin cabecera `Origin`:** Herramientas CLI (curl, postman, scripts), tareas servidor a servidor y sondas de salud (`/health`, `/ready`) no incluyen cabecera `Origin` y son procesadas normalmente, sujetas únicamente a la autenticación estándar.
- **Sin cookies ni credenciales de sesión:** La API no emite ni lee cookies de sesión; la autenticación viaja exclusivamente como Bearer token en la cabecera `Authorization`. En concordancia, la API **omite por completo** la cabecera `Access-Control-Allow-Credentials` (lo que a nivel de navegador equivale a no autorizar credenciales).
- **Límite de seguridad:** CORS restringe únicamente a navegadores web; no sustituye la autenticación ni el control de acceso por roles (RBAC).

### 1.4 Sondas Operativas del Servidor (Liveness y Readiness)

Endpoints públicos situados en la raíz del servidor HTTP, fuera del prefijo `/api`:

#### GET `/health` (Liveness Probe)
- **Propósito:** Comprueba que el proceso de Node.js y el servidor Express están levantados y atienden peticiones HTTP. No contacta a PostgreSQL ni depende del esquema relacional.
- **Acceso:** Público.
- **Respuesta `200 OK`:**
  ```json
  {
    "status": "ok",
    "timestamp": "2026-11-20T20:00:00.000Z"
  }
  ```

#### GET `/ready` (Readiness Probe)
- **Propósito:** Comprueba que el proceso puede recibir tráfico productivo verificando conectividad real con PostgreSQL y la presencia física de las cuatro tablas esenciales del modelo de la aplicación en el esquema `public`: `Usuario`, `SolicitudServicio`, `HistorialEstadoSolicitud` y `RechazoSolicitud`.
- **Acceso:** Público.
- **Límites de tiempo por fase (BE-06 / E2):**
  El adaptador `PrismaPg` configura timeouts acotados por fase:
  - `connectionTimeoutMillis: 4000` en nuevas conexiones.
  - `query_timeout: 4000` en el socket cliente (cancela consultas sobre sockets ya abiertos si la base se congela).
  - `statement_timeout: 4000` en PostgreSQL para consultas individuales.
  Cada timeout acota su fase de forma independiente; no representan una garantía universal de extremo a extremo ni un SLA absoluto bajo cualquier combinación de fallas de red. En mediciones de QA bajo pausa de PostgreSQL (`docker pause`), la respuesta de error fue recibida en ~4.005–4.012s, purgando el socket colgado y permitiendo la recuperación automática tras reanudar la base.
- **Alcance de la sonda:** `/ready` verifica la existencia física de las 4 tablas del modelo. No realiza una validación exhaustiva de columnas ni cálculo de checksums de migraciones en cada petición (dicho análisis exhaustivo corresponde al paso de release mediante `npm run db:precheck`). Una base recién migrada pero sin filas de datos responde `200 OK` normalmente (la ausencia de datos no es un fallo de readiness).
- **Respuestas:**
  - **`200 OK` (Listo para recibir tráfico):**
    ```json
    {
      "status": "ready",
      "timestamp": "2026-11-20T20:00:00.000Z"
    }
    ```
  - **`503 Service Unavailable` (Esquema no preparado):**
    Emitido si la base de datos responde pero falta alguna de las tablas requeridas (ej. base vacía sin migraciones aplicadas):
    ```json
    {
      "status": "unavailable",
      "message": "Esquema de base de datos no preparado",
      "timestamp": "2026-11-20T20:00:00.000Z"
    }
    ```
  - **`503 Service Unavailable` (Base de datos no disponible):**
    Emitido si PostgreSQL no responde, rechaza la conexión o se supera el timeout:
    ```json
    {
      "status": "unavailable",
      "message": "Base de datos no disponible",
      "timestamp": "2026-11-20T20:00:00.000Z"
    }
    ```
- **Confidencialidad:** Las respuestas `503` son estrictamente genéricas y nunca revelan contraseñas, URLs de conexión, nombres de hosts ni fragmentos de errores SQL.

---

## 2. Enums del Sistema

| Enum | Valores permitidos | Descripción |
|---|---|---|
| `Rol` | `CLIENTE`, `TECNICO`, `ADMIN` | Roles del sistema. El registro público solo admite `CLIENTE` o `TECNICO`. `ADMIN` se asigna mediante seed o administración interna. |
| `EstadoSolicitud` | `PENDIENTE`, `ACEPTADA`, `RECHAZADA`, `EN_PROCESO`, `FINALIZADA`, `CANCELADA` | Estados del ciclo de vida. **Nota:** `RECHAZADA` está deprecada en el flujo de bolsa: el rechazo de un técnico mantiene la solicitud en `PENDIENTE` para otros técnicos y registra el rechazo en `RechazoSolicitud`. |
| `CategoriaServicio` | `PLOMERIA`, `ELECTRICIDAD`, `GAS`, `CARPINTERIA`, `PINTURA`, `CERRAJERIA`, `ALBANILERIA`, `OTRO` | Catálogo cerrado de 8 categorías de oficios y servicios. |

---

## 3. Estructuras de Datos y DTOs

> [!NOTE] Diferencias de Proyección entre DTOs
> Los objetos devueltos por los distintos endpoints no contienen siempre todos los campos del modelo relacional físico en la base de datos:
> - El endpoint de **Login** devuelve `Usuario` incluyendo `lastLogin` y `fechaActualizacion`, ya que actualiza la última conexión en esa operación.
> - Los endpoints de **Registro**, **Perfil (`/me`)**, **Listado de administración** y **Detalle de usuario** devuelven una proyección estándar que omite `lastLogin` y `fechaActualizacion`.
> - La propiedad `passwordHash` se excluye estrictamente en todas las proyecciones.

### 3.1 DTO de Usuario (Proyección Estándar)

Utilizado en registro, `/me` y endpoints de administración:
```json
{
  "id": "e4f3a1b2-c5d6-4e7f-8a9b-0c1d2e3f4a5b",
  "email": "juan@mail.com",
  "nombre": "Juan Pérez",
  "celular": "3884123456",
  "rol": "CLIENTE",
  "fechaCreacion": "2026-10-05T14:30:00.000Z"
}
```
*Nota:* `celular` puede ser `null`.

### 3.2 DTO de Usuario en Login (Proyección Completa con Sesión)

```json
{
  "id": "e4f3a1b2-c5d6-4e7f-8a9b-0c1d2e3f4a5b",
  "email": "juan@mail.com",
  "nombre": "Juan Pérez",
  "celular": "3884123456",
  "rol": "CLIENTE",
  "lastLogin": "2026-11-20T20:15:00.000Z",
  "fechaCreacion": "2026-10-05T14:30:00.000Z",
  "fechaActualizacion": "2026-11-20T20:15:00.000Z"
}
```

### 3.3 DTO de Solicitud de Servicio

El modelo relaciona `SolicitudServicio` con categoría; no existe una tabla `Servicio` independiente.
```json
{
  "id": "c7a8b9d0-1e2f-4a3b-8c5d-6e7f8a9b0c1d",
  "titulo": "Pérdida de agua bajo la mesada",
  "descripcion": "Fuga continua en la cañería del desagüe de la cocina",
  "categoria": "PLOMERIA",
  "direccion": "Av. Siempre Viva 742",
  "estado": "PENDIENTE",
  "clienteId": "e4f3a1b2-c5d6-4e7f-8a9b-0c1d2e3f4a5b",
  "tecnicoId": null,
  "cliente": {
    "id": "e4f3a1b2-c5d6-4e7f-8a9b-0c1d2e3f4a5b",
    "nombre": "Juan Pérez",
    "celular": "3884123456"
  },
  "tecnico": null,
  "fechaCreacion": "2026-10-05T14:30:00.000Z",
  "fechaAceptacion": null,
  "fechaInicio": null,
  "fechaFinalizacion": null,
  "fechaCancelacion": null,
  "motivoCancelacion": null,
  "fechaActualizacion": "2026-10-05T14:30:00.000Z"
}
```
*Detalles:*
- `tecnicoId` y `tecnico` son `null` hasta que un técnico toma la solicitud (`PATCH /solicitudes/:id/aceptar`).
- Cuando se asigna un técnico, `tecnico` contiene `{ "id": "...", "nombre": "...", "celular": "..." }`.
- Las marcas de tiempo del ciclo de vida son `null` hasta que se ejecuta la transición correspondiente.

### 3.4 DTO de Historial de Estados (`HistorialEstadoSolicitud`)

```json
{
  "id": "f1e2d3c4-b5a6-4890-8234-56789abcdef0",
  "solicitudId": "c7a8b9d0-1e2f-4a3b-8c5d-6e7f8a9b0c1d",
  "estadoAnterior": "PENDIENTE",
  "estadoNuevo": "ACEPTADA",
  "accion": null,
  "cambiadoPor": {
    "id": "9a8b7c6d-5e4f-4a2b-8c0d-e4f3a2b1c0d9",
    "nombre": "Carlos Gómez",
    "rol": "TECNICO"
  },
  "motivo": null,
  "fechaCambio": "2026-10-05T15:00:00.000Z"
}
```
*Detalles:*
- `estadoAnterior` es `null` únicamente en el primer registro generado al crear la solicitud.
- `accion` es `null` para transiciones de estado regulares, y toma el valor `"RECHAZO"` cuando un técnico rechaza una solicitud en bolsa sin alterar su estado `PENDIENTE`.
- `motivo` contiene el texto explicativo provisto en acciones de rechazo o cancelación.

---

## 4. Endpoints de Autenticación (`/api/auth`)

### 4.1 POST `/api/auth/register`
- **Acceso:** Público.
- **Descripción:** Registra un nuevo usuario cliente o técnico y devuelve sus datos junto con el token JWT de acceso.
- **Restricción de rol:** Solo admite `CLIENTE` o `TECNICO`. Si se envía `ADMIN`, el esquema Zod rechaza la petición con `400 VALIDATION_ERROR`.
- **Cuerpo de la petición:**
  ```json
  {
    "email": "nuevo_cliente@mail.com",
    "password": "PasswordSeguro123",
    "nombre": "Juan Pérez",
    "celular": "3884123456",
    "rol": "CLIENTE"
  }
  ```
  - `email`: obligatorio, formato de correo válido.
  - `password`: obligatorio, mínimo 8 caracteres.
  - `nombre`: obligatorio, mínimo 1 caracter.
  - `celular`: opcional, puede ser `null`.
  - `rol`: opcional, valores permitidos `"CLIENTE"`, `"TECNICO"` (predeterminado `"CLIENTE"`).
- **Respuesta `201 Created`:**
  ```json
  {
    "data": {
      "usuario": {
        "id": "e4f3a1b2-c5d6-4e7f-8a9b-0c1d2e3f4a5b",
        "email": "nuevo_cliente@mail.com",
        "nombre": "Juan Pérez",
        "celular": "3884123456",
        "rol": "CLIENTE",
        "fechaCreacion": "2026-11-20T20:20:00.000Z"
      },
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
  ```
- **Errores posibles:**
  - `400 VALIDATION_ERROR`: Campos obligatorios ausentes, email inválido, contraseña menor a 8 caracteres o intento de asignar rol `ADMIN`.
  - `409 CONFLICT`: El correo ya se encuentra registrado en el sistema.

### 4.2 POST `/api/auth/login`
- **Acceso:** Público.
- **Descripción:** Autentica credenciales de usuario, actualiza la fecha `lastLogin` y emite un nuevo token JWT.
- **Cuerpo de la petición:**
  ```json
  {
    "email": "juan@mail.com",
    "password": "MinimoOchoCaracteres"
  }
  ```
- **Respuesta `200 OK`:**
  ```json
  {
    "data": {
      "usuario": {
        "id": "e4f3a1b2-c5d6-4e7f-8a9b-0c1d2e3f4a5b",
        "email": "juan@mail.com",
        "nombre": "Juan Pérez",
        "celular": "3884123456",
        "rol": "CLIENTE",
        "lastLogin": "2026-11-20T20:25:00.000Z",
        "fechaCreacion": "2026-10-05T14:30:00.000Z",
        "fechaActualizacion": "2026-11-20T20:25:00.000Z"
      },
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
  ```
- **Errores posibles:**
  - `400 VALIDATION_ERROR`: Formato de email o contraseña inválidos.
  - `401 UNAUTHORIZED`: Credenciales incorrectas o usuario inexistente.

### 4.3 GET `/api/auth/me` 🔒
- **Acceso:** Autenticado (cualquier rol).
- **Descripción:** Devuelve los datos del usuario autenticado a partir del token JWT enviado en la cabecera `Authorization`.
- **Respuesta `200 OK`:**
  ```json
  {
    "data": {
      "id": "e4f3a1b2-c5d6-4e7f-8a9b-0c1d2e3f4a5b",
      "email": "juan@mail.com",
      "nombre": "Juan Pérez",
      "celular": "3884123456",
      "rol": "CLIENTE",
      "fechaCreacion": "2026-10-05T14:30:00.000Z"
    }
  }
  ```
- **Errores posibles:**
  - `401 UNAUTHORIZED`: Token ausente, inválido o expirado.

---

## 5. Endpoints de Usuarios (`/api/usuarios` y `/api/users`)

> [!NOTE] Rutas Alias
> La ruta `/api/users/me` está registrada como alias exacto de `/api/usuarios/me` para máxima compatibilidad con clientes existentes. Ambas comparten los mismos controladores y contratos.

### 5.1 GET `/api/usuarios/me` (o `/api/users/me`) 🔒
- **Acceso:** Autenticado (cualquier rol).
- **Descripción:** Obtiene los datos del perfil del usuario autenticado.
- **Respuesta `200 OK`:**
  ```json
  {
    "data": {
      "id": "e4f3a1b2-c5d6-4e7f-8a9b-0c1d2e3f4a5b",
      "email": "juan@mail.com",
      "nombre": "Juan Pérez",
      "celular": "3884123456",
      "rol": "CLIENTE",
      "fechaCreacion": "2026-10-05T14:30:00.000Z"
    }
  }
  ```
- **Errores:** `401 UNAUTHORIZED`.

### 5.2 PATCH `/api/usuarios/me` (o `/api/users/me`) 🔒
- **Acceso:** Autenticado (cualquier rol).
- **Descripción:** Actualiza datos del perfil propio (nombre y/o celular).
- **Cuerpo de la petición (debe incluir al menos un campo):**
  ```json
  {
    "nombre": "Juan Carlos Pérez",
    "celular": "3884999999"
  }
  ```
  - `nombre`: opcional, string no vacío.
  - `celular`: opcional, string o `null`.
- **Respuesta `200 OK`:**
  ```json
  {
    "data": {
      "id": "e4f3a1b2-c5d6-4e7f-8a9b-0c1d2e3f4a5b",
      "email": "juan@mail.com",
      "nombre": "Juan Carlos Pérez",
      "celular": "3884999999",
      "rol": "CLIENTE",
      "fechaCreacion": "2026-10-05T14:30:00.000Z"
    }
  }
  ```
- **Errores posibles:**
  - `400 VALIDATION_ERROR`: Si no se provee ningún campo para actualizar (`{}`) o el formato es incorrecto.
  - `401 UNAUTHORIZED`: Token ausente o inválido.

---

## 6. Endpoints de Administración (`/api/admin`)

Todas las rutas bajo `/api/admin` están protegidas por el middleware `authorize(['ADMIN'])`. Cualquier intento de acceso por usuarios con rol `CLIENTE` o `TECNICO` devuelve `403 FORBIDDEN`.

### 6.1 GET `/api/admin/usuarios` 🔒 (ADMIN)
- **Acceso:** Solo usuarios con rol `ADMIN`.
- **Descripción:** Lista paginada de todos los usuarios registrados en el sistema, ordenados por `fechaCreacion` descendente.
- **Parámetros de consulta (Query params):**
  - `page`: entero positivo >= 1 (predeterminado: `1`).
  - `limit`: entero positivo entre 1 y 100 (predeterminado: `20`).
  - *Nota:* El esquema del backend no filtra usuarios por rol del lado del servidor; el filtrado por rol o búsqueda por texto se resuelve en el frontend (`TablaUsuarios.jsx`).
- **Ejemplo de consulta:** `GET /api/admin/usuarios?page=1&limit=20`
- **Respuesta `200 OK`:**
  ```json
  {
    "data": [
      {
        "id": "e4f3a1b2-c5d6-4e7f-8a9b-0c1d2e3f4a5b",
        "email": "juan@mail.com",
        "nombre": "Juan Pérez",
        "celular": "3884123456",
        "rol": "CLIENTE",
        "fechaCreacion": "2026-10-05T14:30:00.000Z"
      },
      {
        "id": "9a8b7c6d-5e4f-4a2b-8c0d-e4f3a2b1c0d9",
        "email": "carlos@mail.com",
        "nombre": "Carlos Gómez",
        "celular": "3884654321",
        "rol": "TECNICO",
        "fechaCreacion": "2026-10-05T14:35:00.000Z"
      }
    ],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 2
    }
  }
  ```
- **Errores posibles:** `401 UNAUTHORIZED`, `403 FORBIDDEN`.

### 6.2 GET `/api/admin/usuarios/:id` 🔒 (ADMIN)
- **Acceso:** Solo usuarios con rol `ADMIN`.
- **Descripción:** Detalle de un usuario específico por su UUID.
- **Respuesta `200 OK`:**
  ```json
  {
    "data": {
      "id": "e4f3a1b2-c5d6-4e7f-8a9b-0c1d2e3f4a5b",
      "email": "juan@mail.com",
      "nombre": "Juan Pérez",
      "celular": "3884123456",
      "rol": "CLIENTE",
      "fechaCreacion": "2026-10-05T14:30:00.000Z"
    }
  }
  ```
- **Errores posibles:**
  - `401 UNAUTHORIZED`, `403 FORBIDDEN`.
  - `404 NOT_FOUND`: Usuario con ese ID no existe.

### 6.3 PATCH `/api/admin/usuarios/:id` 🔒 (ADMIN)
- **Acceso:** Solo usuarios con rol `ADMIN`.
- **Descripción:** Actualiza los datos de un usuario, permitiendo modificar su nombre, celular o reasignar su rol.
- **Cuerpo de la petición (al menos un campo requerido):**
  ```json
  {
    "nombre": "Juan Administrador",
    "celular": "3884111222",
    "rol": "ADMIN"
  }
  ```
  - `nombre`: opcional, string no vacío.
  - `celular`: opcional, string o `null`.
  - `rol`: opcional, valores permitidos `"CLIENTE"`, `"TECNICO"`, `"ADMIN"`.
- **Respuesta `200 OK`:**
  ```json
  {
    "data": {
      "id": "e4f3a1b2-c5d6-4e7f-8a9b-0c1d2e3f4a5b",
      "email": "juan@mail.com",
      "nombre": "Juan Administrador",
      "celular": "3884111222",
      "rol": "ADMIN",
      "fechaCreacion": "2026-10-05T14:30:00.000Z"
    }
  }
  ```
- **Errores posibles:**
  - `400 VALIDATION_ERROR`: Si no se provee ningún campo para actualizar (`{}`) o si se especifica un rol no válido.
  - `401 UNAUTHORIZED`, `403 FORBIDDEN`.
  - `404 NOT_FOUND`: Usuario con ese ID no existe.

---

## 7. Catálogos (`/api/categorias`)

### 7.1 GET `/api/categorias`
- **Acceso:** Público (no requiere token JWT).
- **Descripción:** Devuelve la lista de las 8 categorías oficiales de servicios disponibles en el sistema.
- **Respuesta `200 OK`:**
  ```json
  {
    "data": [
      "PLOMERIA",
      "ELECTRICIDAD",
      "GAS",
      "CARPINTERIA",
      "PINTURA",
      "CERRAJERIA",
      "ALBANILERIA",
      "OTRO"
    ]
  }
  ```

---

## 8. Solicitudes de Servicio (`/api/solicitudes`)

Todas las rutas bajo `/api/solicitudes` requieren autenticación obligatoria (🔒).

### 8.1 POST `/api/solicitudes` 🔒 (CLIENTE)
- **Acceso:** Solo usuarios con rol `CLIENTE`.
- **Descripción:** Crea una nueva solicitud en estado inicial `PENDIENTE`. El `clienteId` se toma de forma segura del token JWT autenticado. De forma atómica en la misma transacción, crea el registro inicial en `HistorialEstadoSolicitud`.
- **Cuerpo de la petición:**
  ```json
  {
    "titulo": "Fuga en llave de paso principal",
    "descripcion": "La llave pierde agua de forma constante al abrir el paso general",
    "categoria": "PLOMERIA",
    "direccion": "Av. Siempre Viva 742"
  }
  ```
  Todos los campos son obligatorios. `categoria` debe coincidir exactamente con una de las 8 categorías del enum `CategoriaServicio`.
- **Respuesta `201 Created`:**
  ```json
  {
    "data": {
      "id": "c7a8b9d0-1e2f-4a3b-8c5d-6e7f8a9b0c1d",
      "titulo": "Fuga en llave de paso principal",
      "descripcion": "La llave pierde agua de forma constante al abrir el paso general",
      "categoria": "PLOMERIA",
      "direccion": "Av. Siempre Viva 742",
      "estado": "PENDIENTE",
      "clienteId": "e4f3a1b2-c5d6-4e7f-8a9b-0c1d2e3f4a5b",
      "tecnicoId": null,
      "cliente": {
        "id": "e4f3a1b2-c5d6-4e7f-8a9b-0c1d2e3f4a5b",
        "nombre": "Juan Pérez",
        "celular": "3884123456"
      },
      "tecnico": null,
      "fechaCreacion": "2026-11-20T20:30:00.000Z",
      "fechaAceptacion": null,
      "fechaInicio": null,
      "fechaFinalizacion": null,
      "fechaCancelacion": null,
      "motivoCancelacion": null,
      "fechaActualizacion": "2026-11-20T20:30:00.000Z"
    }
  }
  ```
- **Errores posibles:**
  - `400 VALIDATION_ERROR`: Campos ausentes o categoría no permitida.
  - `401 UNAUTHORIZED`: Token ausente o inválido.
  - `403 FORBIDDEN`: Si el usuario no tiene rol `CLIENTE`.

### 8.2 GET `/api/solicitudes` 🔒
- **Acceso:** Autenticado (cualquier rol).
- **Descripción:** Lista solicitudes con paginación, ordenada por `fechaCreacion` descendente. La visibilidad de los datos depende estrictamente del rol del usuario autenticado:
  - **`CLIENTE`:** Solo visualiza las solicitudes donde él es el creador (`clienteId == user.id`).
  - **`TECNICO` (Modelo de Bolsa de Trabajo):**
    - Si consulta con `estado=PENDIENTE`: ve las solicitudes en estado `PENDIENTE` disponibles en la bolsa, **excluyendo** aquellas que él mismo haya rechazado previamente.
    - Si consulta con cualquier otro `estado` (ej. `ACEPTADA`, `EN_PROCESO`, `FINALIZADA`): ve únicamente las solicitudes asignadas a él (`tecnicoId == user.id`).
    - Si no especifica `estado`: ve las solicitudes en `PENDIENTE` disponibles (no rechazadas por él) más todas sus solicitudes asignadas (`tecnicoId == user.id`).
  - **`ADMIN`:** Visualiza todas las solicitudes del sistema.
- **Parámetros de consulta (Query params, todos opcionales):**
  - `estado`: filtro por estado. El esquema Zod acepta los 6 estados del enum: `PENDIENTE`, `ACEPTADA`, `EN_PROCESO`, `FINALIZADA`, `CANCELADA`, y también `RECHAZADA` (este último deprecado en el modelo de bolsa; pasa la validación y filtra la consulta, aunque en el flujo actual no existan filas asignadas con este estado).
    > [!IMPORTANT] Filtro de Estado para Administradores
    > Los administradores filtran solicitudes por estado invocando `GET /api/solicitudes?estado=...`. **No existe una ruta `/api/admin/solicitudes` separada ni un filtro por rol de usuario**.
  - `categoria`: filtro por categoría de servicio (`PLOMERIA`, etc.).
  - `page`: entero >= 1 (predeterminado: `1`).
  - `limit`: entero entre 1 y 100 (predeterminado: `20`).
- **Ejemplo:** `GET /api/solicitudes?estado=PENDIENTE&categoria=PLOMERIA&page=1&limit=20`
- **Respuesta `200 OK`:**
  ```json
  {
    "data": [
      {
        "id": "c7a8b9d0-1e2f-4a3b-8c5d-6e7f8a9b0c1d",
        "titulo": "Fuga en llave de paso principal",
        "descripcion": "La llave pierde agua de forma constante al abrir el paso general",
        "categoria": "PLOMERIA",
        "direccion": "Av. Siempre Viva 742",
        "estado": "PENDIENTE",
        "clienteId": "e4f3a1b2-c5d6-4e7f-8a9b-0c1d2e3f4a5b",
        "tecnicoId": null,
        "cliente": {
          "id": "e4f3a1b2-c5d6-4e7f-8a9b-0c1d2e3f4a5b",
          "nombre": "Juan Pérez",
          "celular": "3884123456"
        },
        "tecnico": null,
        "fechaCreacion": "2026-11-20T20:30:00.000Z",
        "fechaAceptacion": null,
        "fechaInicio": null,
        "fechaFinalizacion": null,
        "fechaCancelacion": null,
        "motivoCancelacion": null,
        "fechaActualizacion": "2026-11-20T20:30:00.000Z"
      }
    ],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 1
    }
  }
  ```

### 8.3 GET `/api/solicitudes/:id` 🔒
- **Acceso:** Autenticado.
- **Reglas de autorización:**
  - El **cliente creador** (`clienteId == user.id`) puede verla siempre.
  - Un **administrador** puede ver cualquier solicitud.
  - Un **técnico** puede verla si es el técnico asignado (`tecnicoId == user.id`), O si la solicitud está en estado `PENDIENTE` y no la ha rechazado previamente.
  - **Rechazo previo:** Si un técnico rechazó esta solicitud anteriormente e intenta consultarla directamente por su ID, recibe **`403 FORBIDDEN`** ("No tienes permisos para ver esta solicitud").
- **Respuesta `200 OK`:** Devuelve el objeto Solicitud completo `{ "data": { ... } }`.
- **Errores posibles:**
  - `401 UNAUTHORIZED`.
  - `403 FORBIDDEN`: Si el usuario no tiene permiso según las reglas anteriores.
  - `404 NOT_FOUND`: Si la solicitud no existe.

### 8.4 PATCH `/api/solicitudes/:id` 🔒 (CLIENTE dueño)
- **Acceso:** Solo usuarios con rol `CLIENTE` que sean propietarios de la solicitud (`clienteId == user.id`).
- **Descripción:** Edita los datos de la solicitud. Concurrencia controlada mediante `SELECT ... FOR UPDATE`.
- **Precondición estricta:** Solo se pueden editar solicitudes mientras se encuentren en estado `PENDIENTE`.
- **Cuerpo de la petición (campos opcionales):**
  ```json
  {
    "titulo": "Fuga en llave de paso (actualizado)",
    "descripcion": "La fuga empeoró, se necesita atención urgente",
    "categoria": "PLOMERIA",
    "direccion": "Av. Siempre Viva 742, timbre 2"
  }
  ```
- **Respuesta `200 OK`:** Devuelve el objeto Solicitud actualizado `{ "data": { ... } }`.
- **Errores posibles:**
  - `400 VALIDATION_ERROR`: Datos inválidos o categoría no admitida.
  - `401 UNAUTHORIZED`.
  - `403 FORBIDDEN`: Si el usuario no es el cliente creador.
  - `404 NOT_FOUND`: Si la solicitud no existe.
  - `409 CONFLICT`: Si la solicitud ya no se encuentra en estado `PENDIENTE` (ej. si fue tomada por un técnico concurrentemente).

### 8.5 GET `/api/solicitudes/:id/historial` 🔒
- **Acceso:** Mismas reglas de autorización de visibilidad que `GET /api/solicitudes/:id`.
- **Descripción:** Devuelve la lista completa de cambios de estado y acciones cronológicas de la solicitud, ordenadas por `fechaCambio` ascendente.
- **Privacidad del Cliente (Bolsa de Trabajo):**
  Para usuarios con rol `CLIENTE`, las acciones de rechazo individual de técnicos (`accion: "RECHAZO"`) son filtradas y **ocultas automáticamente**. El cliente únicamente observa las transiciones de estado de su trabajo, garantizando la privacidad de los rechazos internos de la bolsa de técnicos.
- **Respuesta `200 OK`:**
  ```json
  {
    "data": [
      {
        "id": "f1e2d3c4-b5a6-4890-8234-56789abcdef0",
        "solicitudId": "c7a8b9d0-1e2f-4a3b-8c5d-6e7f8a9b0c1d",
        "estadoAnterior": null,
        "estadoNuevo": "PENDIENTE",
        "accion": null,
        "cambiadoPor": {
          "id": "e4f3a1b2-c5d6-4e7f-8a9b-0c1d2e3f4a5b",
          "nombre": "Juan Pérez",
          "rol": "CLIENTE"
        },
        "motivo": null,
        "fechaCambio": "2026-11-20T20:30:00.000Z"
      },
      {
        "id": "a2b3c4d5-e6f7-4901-8345-6789abcdef01",
        "solicitudId": "c7a8b9d0-1e2f-4a3b-8c5d-6e7f8a9b0c1d",
        "estadoAnterior": "PENDIENTE",
        "estadoNuevo": "ACEPTADA",
        "accion": null,
        "cambiadoPor": {
          "id": "9a8b7c6d-5e4f-4a2b-8c0d-e4f3a2b1c0d9",
          "nombre": "Carlos Gómez",
          "rol": "TECNICO"
        },
        "motivo": null,
        "fechaCambio": "2026-11-20T20:35:00.000Z"
      }
    ]
  }
  ```
- **Errores posibles:** `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`.

---

## 9. Acciones y Transiciones de Estado de Solicitudes

Cada acción del ciclo de vida se invoca mediante un endpoint específico. Todas las transiciones se ejecutan bajo transacciones atómicas con bloqueo de fila `SELECT ... FOR UPDATE`, registran la fila correspondiente en `HistorialEstadoSolicitud` y responden `200 OK` con el objeto Solicitud actualizado.

| Endpoint | Quién | Estado previo | Estado resultante | Body | Efecto y reglas |
|---|---|---|---|---|---|
| `PATCH /api/solicitudes/:id/aceptar` | `TECNICO` | `PENDIENTE` | `ACEPTADA` | *Vacío* | Asigna `tecnicoId = user.id` y `fechaAceptacion`. Bloqueado (`409`) si ya fue tomada o si este técnico la rechazó previamente. |
| `PATCH /api/solicitudes/:id/rechazar` | `TECNICO` | `PENDIENTE` | `PENDIENTE` | `{"motivo": "..."}` | Registra `RechazoSolicitud` e historial con `accion: "RECHAZO"`. La solicitud **permanece `PENDIENTE`** para otros técnicos. Bloqueado (`409`) si ya la rechazó o si ya está asignada. |
| `PATCH /api/solicitudes/:id/iniciar` | `TECNICO` asignado | `ACEPTADA` | `EN_PROCESO` | *Vacío* | Fija `fechaInicio = now()`. Solo el técnico asignado (`403` si es otro técnico). |
| `PATCH /api/solicitudes/:id/finalizar` | `TECNICO` asignado | `EN_PROCESO` | `FINALIZADA` | *Vacío* | Fija `fechaFinalizacion = now()`. Solo el técnico asignado (`403` si es otro técnico). |
| `PATCH /api/solicitudes/:id/cancelar` | `CLIENTE` dueño o `ADMIN` | `PENDIENTE` o `ACEPTADA` | `CANCELADA` | `{"motivo": "..."}` | Fija `fechaCancelacion = now()` y `motivoCancelacion`. No se permite cancelar trabajos en `EN_PROCESO` ni `FINALIZADA`. |

### 9.1 Detalle de Endpoints de Acción

#### PATCH `/api/solicitudes/:id/aceptar` 🔒 (TECNICO)
- **Precondiciones:** La solicitud debe estar en estado `PENDIENTE`, sin técnico asignado (`tecnicoId === null`), y el técnico no debe haberla rechazado con anterioridad.
- **Respuesta exitosa `200 OK`:** Solicitud en estado `ACEPTADA` con `tecnicoId` establecido.
- **Errores:**
  - `403 FORBIDDEN`: Si el usuario no es `TECNICO`.
  - `404 NOT_FOUND`: Solicitud no existe.
  - `409 CONFLICT`: Si la solicitud ya no está en `PENDIENTE`, ya fue tomada por otro técnico o si este técnico ya la había rechazado.

#### PATCH `/api/solicitudes/:id/rechazar` 🔒 (TECNICO)
- **Precondiciones:** La solicitud debe estar en estado `PENDIENTE`, el técnico no debe haberla aceptado previamente y no debe haber registrado un rechazo previo para la misma.
- **Cuerpo requerido:**
  ```json
  {
    "motivo": "Fuera de mi zona de cobertura habitual"
  }
  ```
- **Respuesta exitosa `200 OK`:** Solicitud con estado `PENDIENTE` sin alterar. Se registra la fila en `RechazoSolicitud` y en el historial. A partir de este momento, la solicitud desaparece de las consultas de bolsa de este técnico y no podrá aceptarla ni consultarla.
- **Errores:**
  - `400 VALIDATION_ERROR`: Falta el campo `motivo`.
  - `403 FORBIDDEN`: Si el usuario no es `TECNICO`.
  - `409 CONFLICT`: Si la solicitud no está en `PENDIENTE`, si el técnico ya es el asignado o si ya la rechazó previamente.

#### PATCH `/api/solicitudes/:id/iniciar` 🔒 (TECNICO asignado)
- **Precondición:** Estado actual debe ser `ACEPTADA` y `solicitud.tecnicoId === user.id`.
- **Respuesta exitosa `200 OK`:** Solicitud en estado `EN_PROCESO` con `fechaInicio` establecida.
- **Errores:** `403 FORBIDDEN` (no es el técnico asignado), `409 CONFLICT` (estado actual no es `ACEPTADA`).

#### PATCH `/api/solicitudes/:id/finalizar` 🔒 (TECNICO asignado)
- **Precondición:** Estado actual debe ser `EN_PROCESO` y `solicitud.tecnicoId === user.id`.
- **Respuesta exitosa `200 OK`:** Solicitud en estado `FINALIZADA` con `fechaFinalizacion` establecida.
- **Errores:** `403 FORBIDDEN` (no es el técnico asignado), `409 CONFLICT` (estado actual no es `EN_PROCESO`).

#### PATCH `/api/solicitudes/:id/cancelar` 🔒 (CLIENTE dueño o ADMIN)
- **Precondición:** Estado actual debe ser `PENDIENTE` o `ACEPTADA`. Si es `CLIENTE`, debe ser el propietario (`solicitud.clienteId === user.id`). Un `ADMIN` puede cancelar cualquier solicitud en esos estados.
- **Cuerpo requerido:**
  ```json
  {
    "motivo": "Problema resuelto por cuenta propia"
  }
  ```
- **Respuesta exitosa `200 OK`:** Solicitud en estado `CANCELADA` con `fechaCancelacion` y `motivoCancelacion` establecidos.
- **Errores:**
  - `400 VALIDATION_ERROR`: Falta el campo `motivo`.
  - `403 FORBIDDEN`: Si el usuario no es el cliente dueño ni administrador.
  - `409 CONFLICT`: Si la solicitud ya se encuentra en `EN_PROCESO`, `FINALIZADA` o ya fue `CANCELADA`.

---

## 10. Reglas de Concurrencia y Serialización (BE-04)

Todas las escrituras y transiciones de estado sobre solicitudes se ejecutan dentro de transacciones atómicas de PostgreSQL con bloqueo pesimista a nivel de fila (`SELECT ... FOR UPDATE`). Las autorizaciones de pertenencia y las comprobaciones de estado se revalidan dentro de la transacción bajo el bloqueo, garantizando la equivalencia estricta con una ejecución serializada:

1. **Aceptación simultánea por dos técnicos:** Exactamente uno gana el lock y recibe `200 OK` con la asignación. El segundo técnico recibe `409 CONFLICT` indicando que la solicitud ya fue tomada.
2. **Mismo técnico: aceptar vs rechazar:** Si el rechazo se procesa primero, la solicitud permanece disponible en bolsa para otros técnicos y el intento posterior de aceptar recibe `409 CONFLICT`. Si la aceptación se procesa primero, el intento posterior de rechazar recibe `409 CONFLICT`.
3. **Rechazos simultáneos por el mismo técnico:** Dos peticiones concurrentes de rechazo del mismo técnico resultan en exactamente un `200 OK` y un `409 CONFLICT`. La restricción de unicidad relacional `(solicitudId, tecnicoId)` captura la colisión de forma controlada y nunca produce un error `500 INTERNAL_ERROR`.
4. **Rechazo y aceptación de técnicos distintos:** Si un técnico rechaza mientras la solicitud está `PENDIENTE`, su transacción concluye con `200 OK` (quedando excluida para él). Si inmediatamente después otro técnico la acepta, esta segunda acción también recibe `200 OK` y queda asignada. Si la aceptación gana el lock en primer lugar, el rechazo del otro técnico devuelve `409 CONFLICT` (la solicitud ya no está en `PENDIENTE`).
5. **Edición (`PATCH /solicitudes/:id`) vs aceptación:** La edición está restringida exclusivamente al estado `PENDIENTE`. Si la aceptación se consolida primero, la edición es rechazada con `409 CONFLICT`, impidiendo mutaciones inconsistentes de los términos una vez aceptado el trabajo.
6. **Cancelaciones concurrentes:** Dos cancelaciones simultáneas devuelven exactamente un `200 OK` y un `409 CONFLICT`, registrando una única entrada de cancelación en el historial.
7. **Cancelar vs Iniciar desde `ACEPTADA`:** Solo una de las transiciones triunfa; la que obtiene el bloqueo transiciona a `CANCELADA` o `EN_PROCESO`, y la perdedora recibe `409 CONFLICT`.
8. **Cancelar vs Aceptar desde `PENDIENTE`:** Si la cancelación gana el bloqueo, la solicitud queda `CANCELADA` y la aceptación es denegada con `409 CONFLICT` (las solicitudes canceladas no pueden ser tomadas). Si la aceptación gana primero (`PENDIENTE` → `ACEPTADA`), la posterior cancelación por parte del cliente o admin es válida y devuelve `200 OK` (`ACEPTADA` → `CANCELADA`).
9. **Ejecución repetida de transiciones:** Intentos duplicados de `iniciar` o `finalizar` devuelven un `200 OK` para la primera ejecución y `409 CONFLICT` para las posteriores. Los estados terminales (`FINALIZADA`, `CANCELADA`) rechazan cualquier transición posterior con `409 CONFLICT`.

---

## 11. Estado de Implementación y Dependencias Externas

1. **Frescura de datos y actualización de estado:**
   El contrato no incluye tecnologías de push en tiempo real (ni Server-Sent Events ni WebSockets). La actualización del estado de una solicitud y de los datos del técnico asignado se obtiene mediante consultas GET autenticadas al contrato REST existente. La periodicidad del refresco de la interfaz es responsabilidad de la aplicación cliente (SPA).
2. **Conformidad con Frontend (Dependencia Externa):**
   La conformidad de la interfaz de usuario y el consumo de estos endpoints desde los componentes React de la SPA constituyen una dependencia externa al backend. Los tests HTTP verifican el contrato y su semántica de servidor, pero no sustituyen la validación de integración visual ni la aceptación del equipo de frontend.
3. **Publicación Pública (Issue #15 Excluida):**
   Por instrucción explícita del usuario, la issue #15 (BE-07, despliegue público) se encuentra excluida de este ciclo. No se han aprovisionado servicios de hosting ni bases de datos de producción públicas, y no existe una URL pública de demostración configurada.
