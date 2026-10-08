# Contrato de API - UrbanFix

Versión: 0.1 (borrador para revisión de frontend y datos)

## 1. Convenciones generales

- **Base URL (local):** `http://localhost:3001/api`
- **Formato:** JSON (`Content-Type: application/json`), UTF-8.
- **Fechas:** ISO 8601 en UTC. Ej: `"2026-10-05T14:30:00.000Z"`.
- **IDs:** UUID (string).
- **Autenticación:** JWT en el header `Authorization: Bearer <token>`. Las rutas marcadas con 🔒 lo requieren.
- **Nunca** se devuelve `passwordHash`.

### Formato de respuesta exitosa

```json
{ "data": { } }
```

Listados paginados:

```json
{
  "data": [ ],
  "meta": { "page": 1, "limit": 20, "total": 57 }
}
```

### Formato de error

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Datos inválidos",
    "details": [{ "field": "email", "message": "Email inválido" }]
  }
}
```

| HTTP | `code`              | Cuándo                                              |
|------|---------------------|-----------------------------------------------------|
| 400  | `VALIDATION_ERROR`  | Body o query inválidos                              |
| 401  | `UNAUTHORIZED`      | Falta token, token inválido o credenciales erróneas |
| 403  | `FORBIDDEN`         | El rol o usuario no tiene permiso                   |
| 404  | `NOT_FOUND`         | El recurso no existe                                |
| 409  | `CONFLICT`          | Email duplicado o transición de estado no permitida |
| 500  | `INTERNAL_ERROR`    | Error inesperado                                    |

## 2. Enums

| Enum                | Valores                                                                      |
|---------------------|------------------------------------------------------------------------------|
| `Rol`               | `CLIENTE`, `TECNICO`, `ADMIN`                                                |
| `EstadoSolicitud`   | `PENDIENTE`, `ACEPTADA`, `RECHAZADA`, `EN_PROCESO`, `FINALIZADA`, `CANCELADA` |
| `CategoriaServicio` | `PLOMERIA`, `ELECTRICIDAD`, `GAS`, `CARPINTERIA`, `PINTURA`, `CERRAJERIA`, `ALBANILERIA`, `OTRO` |

## 3. Objetos

### Usuario

```json
{
  "id": "uuid",
  "email": "juan@mail.com",
  "nombre": "Juan Pérez",
  "celular": "3884123456",
  "rol": "CLIENTE",
  "fechaCreacion": "2026-10-05T14:30:00.000Z"
}
```

`celular` puede ser `null`.

### Solicitud

```json
{
  "id": "uuid",
  "titulo": "Pérdida en la cocina",
  "descripcion": "Se pierde agua debajo de la mesada",
  "categoria": "PLOMERIA",
  "direccion": "Av. Siempre Viva 742",
  "estado": "PENDIENTE",
  "clienteId": "uuid",
  "tecnicoId": null,
  "cliente": { "id": "uuid", "nombre": "Juan Pérez", "celular": "3884123456" },
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

`tecnicoId` y `tecnico` son `null` hasta que un técnico acepta. Las fechas del ciclo de vida son `null` hasta que ocurre el evento.

### HistorialEstado

```json
{
  "id": "uuid",
  "solicitudId": "uuid",
  "estadoAnterior": "PENDIENTE",
  "estadoNuevo": "ACEPTADA",
  "cambiadoPor": { "id": "uuid", "nombre": "Carlos Gómez", "rol": "TECNICO" },
  "motivo": null,
  "fechaCambio": "2026-10-05T15:00:00.000Z"
}
```

`estadoAnterior` es `null` en el primer registro (creación).

## 4. Autenticación

### POST `/auth/register`

Público. Solo permite crear `CLIENTE` o `TECNICO` (`ADMIN` no se crea por acá).

Request:

```json
{
  "email": "juan@mail.com",
  "password": "MinimoOchoCaracteres",
  "nombre": "Juan Pérez",
  "celular": "3884123456",
  "rol": "CLIENTE"
}
```

- `email`, `password` (mín. 8), `nombre`: obligatorios.
- `celular`: opcional. `rol`: opcional, por defecto `CLIENTE`.

Response `201`:

```json
{ "data": { "usuario": { }, "token": "jwt..." } }
```

Errores: `400`, `409` (email ya registrado).

### POST `/auth/login`

Público.

Request:

```json
{ "email": "juan@mail.com", "password": "MinimoOchoCaracteres" }
```

Response `200`:

```json
{ "data": { "usuario": { }, "token": "jwt..." } }
```

Errores: `400`, `401` (credenciales inválidas).

### GET `/auth/me` 🔒

Devuelve el usuario del token.

Response `200`: `{ "data": { Usuario } }`

## 5. Usuarios

### PATCH `/usuarios/me` 🔒

Actualiza el perfil propio. Todos los campos son opcionales.

Request:

```json
{ "nombre": "Juan P.", "celular": "3884999999" }
```

Response `200`: `{ "data": { Usuario } }`

## 6. Catálogos

### GET `/categorias`

Público. Devuelve los valores del enum para armar selectores.

Response `200`:

```json
{ "data": ["PLOMERIA", "ELECTRICIDAD", "GAS", "CARPINTERIA", "PINTURA", "CERRAJERIA", "ALBANILERIA", "OTRO"] }
```

## 7. Solicitudes de servicio

### POST `/solicitudes` 🔒 (CLIENTE)

Crea una solicitud en estado `PENDIENTE`. El `clienteId` se toma del token.

Request:

```json
{
  "titulo": "Pérdida en la cocina",
  "descripcion": "Se pierde agua debajo de la mesada",
  "categoria": "PLOMERIA",
  "direccion": "Av. Siempre Viva 742"
}
```

Todos los campos son obligatorios.

Response `201`: `{ "data": { Solicitud } }`. Se crea también el primer registro de historial.

Errores: `400`, `401`, `403`.

### GET `/solicitudes` 🔒

Lista según el rol:

| Rol       | Ve                                                                      |
|-----------|-------------------------------------------------------------------------|
| `CLIENTE` | Solo sus solicitudes                                                    |
| `TECNICO` | Solicitudes `PENDIENTE` (disponibles) y las asignadas a él              |
| `ADMIN`   | Todas                                                                   |

Query params (todos opcionales): `estado`, `categoria`, `page` (def. 1), `limit` (def. 20, máx. 100).

Ejemplo: `GET /solicitudes?estado=PENDIENTE&categoria=GAS&page=1&limit=20`

Response `200`: `{ "data": [Solicitud], "meta": { "page": 1, "limit": 20, "total": 0 } }`

Ordenadas por `fechaCreacion` descendente.

### GET `/solicitudes/:id` 🔒

Detalle de una solicitud. Solo el cliente dueño, el técnico asignado (o cualquier técnico si está `PENDIENTE`) y el admin.

Response `200`: `{ "data": { Solicitud } }`

Errores: `403`, `404`.

### PATCH `/solicitudes/:id` 🔒 (CLIENTE dueño)

Edita datos de la solicitud. Solo permitido mientras está en `PENDIENTE`.

Request (todos opcionales): `titulo`, `descripcion`, `categoria`, `direccion`.

Response `200`: `{ "data": { Solicitud } }`

Errores: `400`, `403`, `404`, `409` (ya no está `PENDIENTE`).

### GET `/solicitudes/:id/historial` 🔒

Mismos permisos de visibilidad que el detalle.

Response `200`: `{ "data": [HistorialEstado] }` ordenado por `fechaCambio` ascendente.

## 8. Cambios de estado

Cada acción es un endpoint propio. Todas devuelven `200` con `{ "data": { Solicitud } }` actualizada, y registran una fila en el historial dentro de la misma transacción.

| Endpoint                         | Quién                    | Transición                       | Body                          | Efecto en datos                        |
|----------------------------------|--------------------------|----------------------------------|-------------------------------|----------------------------------------|
| `PATCH /solicitudes/:id/aceptar`  | TECNICO                  | `PENDIENTE` → `ACEPTADA`        | vacío                         | `tecnicoId` = usuario, `fechaAceptacion` |
| `PATCH /solicitudes/:id/rechazar` | TECNICO                  | `PENDIENTE` → `RECHAZADA`       | `{ "motivo": "..." }` (obl.)  | Historial con motivo                   |
| `PATCH /solicitudes/:id/iniciar`  | TECNICO asignado         | `ACEPTADA` → `EN_PROCESO`       | vacío                         | `fechaInicio`                          |
| `PATCH /solicitudes/:id/finalizar`| TECNICO asignado         | `EN_PROCESO` → `FINALIZADA`     | vacío                         | `fechaFinalizacion`                    |
| `PATCH /solicitudes/:id/cancelar` | CLIENTE dueño o ADMIN    | `PENDIENTE`/`ACEPTADA` → `CANCELADA` | `{ "motivo": "..." }` (obl.) | `fechaCancelacion`, `motivoCancelacion` |

Errores comunes: `400` (falta `motivo`), `403` (rol o usuario sin permiso), `404`, `409` (transición no permitida desde el estado actual).

Ejemplo de error de transición:

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "No se puede finalizar una solicitud en estado PENDIENTE"
  }
}
```

## 9. Decisiones abiertas (a confirmar con el equipo)

1. **Asignación:** se asumió un modelo de "bolsa" donde cualquier técnico ve las `PENDIENTE` y la primera en aceptar se la queda. Si el cliente elige al técnico, hay que agregar `tecnicoId` al crear y un `GET /tecnicos`.
2. **Rechazo:** con este modelo, `RECHAZADA` es un estado final para toda la solicitud. Si se quiere que otro técnico pueda tomarla después, habría que dejarla en `PENDIENTE` y registrar solo el rechazo en el historial.
3. **Cancelar en `EN_PROCESO`:** hoy no está permitido. Confirmar si debe permitirse.
4. **Token:** falta agregar `jsonwebtoken` a las dependencias del backend.
5. **Validación:** definir librería (por ejemplo `zod`) para los `VALIDATION_ERROR`.
