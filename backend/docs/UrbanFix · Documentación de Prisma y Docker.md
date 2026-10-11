# UrbanFix · Documentación de Prisma y Docker

Esta guía explica cómo está armada la capa de datos del backend (Prisma + PostgreSQL) y cómo se empaqueta y se ejecuta el proyecto con Docker. Está pensada para que cualquier integrante del equipo entienda **qué hace cada archivo, dónde está y con qué se conecta**.

## Índice

1. [Visión general](#1-visi%C3%B3n-general)
2. [Mapa de archivos](#2-mapa-de-archivos)
3. [Prisma](#3-prisma)
4. [Docker](#4-docker)
5. [Variables de entorno](#5-variables-de-entorno)
6. [Flujos de trabajo](#6-flujos-de-trabajo)
7. [Referencia de comandos](#7-referencia-de-comandos)
8. [Problemas frecuentes](#8-problemas-frecuentes)
9. [Glosario](#9-glosario)

---

## 1. Visión general

El backend sigue una arquitectura por capas. Prisma es la capa de acceso a datos y PostgreSQL es donde persiste la información. Docker permite levantar ambos sin instalar nada más que Docker en la máquina.

```mermaid
graph LR
    C[Cliente Web/App] -->|HTTP| R[Rutas]
    R --> Ctr[Controllers]
    Ctr --> Svc[Services]
    Svc --> P[Prisma Client]
    P -->|adapter-pg| DB[(PostgreSQL)]

    subgraph Docker
        API[Contenedor urbanfix-api]
        PG[Contenedor urbanfix-db]
    end

    R -.-> API
    DB -.-> PG
```

| Pieza | Responsabilidad |
| --- | --- |
| **Rutas / Controllers / Services** | Reciben la petición, validan y aplican la lógica de negocio |
| **Prisma** | Define el modelo de datos, genera las tablas y traduce código JS a SQL |
| **PostgreSQL** | Almacena los datos |
| **Docker / Compose** | Empaqueta y ejecuta la API y la base de forma reproducible |

---

## 2. Mapa de archivos

```
Proyecto-UrbanFix/
├── docker-compose.yml          ← Orquesta los contenedores (db + api)
├── .env                        ← Variables para Compose (NO se sube a Git)
├── .env.example                ← Plantilla del anterior (sí se sube)
├── .gitignore
├── README.md
├── docs/
│   └── PRISMA_Y_DOCKER.md      ← Este documento
└── backend/
    ├── Dockerfile              ← Receta para construir la imagen de la API
    ├── .dockerignore           ← Archivos que Docker NO copia a la imagen
    ├── .env                    ← Variables para correr la API fuera de Docker (NO se sube)
    ├── .env.example            ← Plantilla (sí se sube)
    ├── package.json
    ├── package-lock.json
    ├── prisma.config.ts        ← Configuración del CLI de Prisma
    ├── prisma/
    │   ├── schema.prisma       ← Definición de modelos (fuente de verdad)
    │   └── migrations/
    │       ├── migration_lock.toml
    │       └── <fecha>_init/
    │           └── migration.sql
    └── src/
        ├── index.js            ← Arranque del servidor Express
        ├── config/
        │   └── prisma.js       ← Instancia única del cliente de Prisma
        ├── routes/
        ├── controllers/
        ├── services/           ← Aquí se usa Prisma
        └── middlewares/
```

---

## 3. Prisma

### 3.1 Qué es y qué problema resuelve

Prisma es un **ORM** (Object-Relational Mapper). En lugar de escribir SQL a mano, definís tus tablas en un archivo y consultás la base con JavaScript:

```js
// Sin Prisma (SQL)
SELECT * FROM "Usuario" WHERE email = 'a@a.com';

// Con Prisma
prisma.usuario.findUnique({ where: { email: 'a@a.com' } });
```

Hace tres cosas:

1. **Modelado:** describís tus datos en `schema.prisma`.
2. **Migraciones:** convierte ese modelo en tablas reales de PostgreSQL y guarda el historial de cambios.
3. **Cliente:** genera código JavaScript para consultar la base de forma segura (consultas parametrizadas, protegidas contra inyección SQL).

### 3.2 Las piezas de Prisma y cómo se relacionan

```mermaid
graph TD
    S[schema.prisma<br/>modelos] -->|prisma migrate dev| M[migrations/*.sql<br/>historial]
    M -->|se aplica a| DB[(PostgreSQL)]
    S -->|prisma generate| GC[Cliente generado<br/>en node_modules]
    CFG[prisma.config.ts<br/>URL de la base] -.->|usado por el CLI| M
    GC --> PJS[src/config/prisma.js]
    ENV[.env<br/>DATABASE_URL] --> CFG
    ENV --> PJS
    PJS -->|importado por| SVC[services/*.js]
    PJS -->|adapter-pg| DB
```

| Pieza | Ubicación | Para qué sirve |
| --- | --- | --- |
| `schema.prisma` | `backend/prisma/` | Define modelos, enums y relaciones. **Es la fuente de verdad** |
| `prisma.config.ts` | `backend/` | Le dice al CLI de Prisma dónde está el schema y cuál es la URL de la base |
| `migrations/` | `backend/prisma/` | Historial versionado de cambios en la base (SQL) |
| Cliente generado | `node_modules/` | Código autogenerado con métodos como `prisma.usuario.create()` |
| `config/prisma.js` | `backend/src/` | Crea **una sola** instancia del cliente que usa toda la app |
| `.env` | `backend/` | Guarda `DATABASE_URL` |
| `@prisma/adapter-pg` + `pg` | `node_modules/` | Driver que permite al cliente hablar con PostgreSQL (obligatorio desde Prisma 7) |

### 3.3 `schema.prisma`

Archivo: `backend/prisma/schema.prisma`. Tiene cuatro tipos de bloques.

#### `datasource`: a qué base se conecta

```prisma
datasource db {
  provider = "postgresql"
}
```

Solo declara el motor. En Prisma 7 **la URL ya no va acá**: está en `prisma.config.ts`.

#### `generator`: qué código se genera

```prisma
generator client {
  provider = "prisma-client-js"
}
```

Indica que `prisma generate` debe producir el cliente JavaScript (`@prisma/client`).

#### `enum`: valores permitidos

```prisma
enum Rol { CLIENTE  TECNICO  ADMIN }

enum EstadoSolicitud {
  PENDIENTE   // Creada por el cliente
  ACEPTADA    // Técnico aceptó
  RECHAZADA   // Técnico rechazó
  EN_PROCESO  // Trabajo en ejecución
  FINALIZADA  // Trabajo completado
  CANCELADA   // Cancelada por cliente o admin
}
```

Se crean como tipos `ENUM` en PostgreSQL, así que la base rechaza cualquier valor que no esté en la lista.

#### `model`: las tablas

Cada `model` se convierte en una tabla con el mismo nombre (`Usuario`, `SolicitudServicio`).

**Modelo `Usuario`**

| Campo | Tipo | Significado |
| --- | --- | --- |
| `id` | `String @id @default(uuid())` | Clave primaria; el UUID lo genera Prisma al crear el registro |
| `email` | `String @unique` | No puede repetirse (crea un índice único) |
| `passwordHash` | `String` | Contraseña **hasheada** con bcrypt, nunca en texto plano |
| `nombre` | `String` | Obligatorio |
| `celular` | `String?` | El `?` lo hace opcional (acepta `NULL`) |
| `rol` | `Rol @default(CLIENTE)` | Si no se indica, será `CLIENTE` |
| `fechaCreacion` | `DateTime @default(now())` | Se completa sola al crear |
| `fechaActualizacion` | `DateTime @updatedAt` | Prisma la actualiza sola en cada `update` |

**Modelo `SolicitudServicio`**

| Campo | Tipo | Significado |
| --- | --- | --- |
| `id` | `String @id @default(uuid())` | Clave primaria |
| `titulo`, `descripcion`, `categoria`, `direccion` | `String` | Datos del pedido (la categoría es texto libre) |
| `estado` | `EstadoSolicitud @default(PENDIENTE)` | Estado del ciclo de vida |
| `clienteId` | `String` | Clave foránea al cliente que la creó (obligatoria) |
| `tecnicoId` | `String?` | Clave foránea al técnico asignado (opcional hasta que alguien acepta) |

#### Relaciones

Hay **dos relaciones entre las mismas dos tablas**, por eso cada una lleva un nombre:

```prisma
// En Usuario
solicitudesComoCliente SolicitudServicio[] @relation("SolicitudesComoCliente")
solicitudesComoTecnico SolicitudServicio[] @relation("SolicitudesComoTecnico")

// En SolicitudServicio
cliente   Usuario  @relation("SolicitudesComoCliente", fields: [clienteId], references: [id])
tecnico   Usuario? @relation("SolicitudesComoTecnico", fields: [tecnicoId], references: [id])
```

```mermaid
erDiagram
    Usuario ||--o{ SolicitudServicio : "crea (clienteId)"
    Usuario |o--o{ SolicitudServicio : "atiende (tecnicoId)"
    Usuario {
        string id PK
        string email UK
        string passwordHash
        string nombre
        string celular
        Rol rol
    }
    SolicitudServicio {
        string id PK
        string titulo
        string descripcion
        string categoria
        string direccion
        EstadoSolicitud estado
        string clienteId FK
        string tecnicoId FK
    }
```

- Un usuario puede tener **muchas** solicitudes como cliente y **muchas** como técnico.
- Cada solicitud tiene **exactamente un** cliente y **como máximo un** técnico.
- `fields` indica la columna local (la clave foránea) y `references` la columna a la que apunta.
- Los campos de tipo lista (`SolicitudServicio[]`) y los de tipo modelo (`cliente`) **no son columnas**: son accesos que Prisma ofrece para navegar la relación (por ejemplo, `include: { cliente: true }`).
- Comportamiento al borrar (por defecto de Prisma): no se puede borrar un usuario que tenga solicitudes como cliente; si se borra un técnico, `tecnicoId` pasa a `NULL`.

### 3.4 `prisma.config.ts`

```ts
import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
})
```

| Línea | Qué hace |
| --- | --- |
| `import 'dotenv/config'` | Carga el archivo `.env` en `process.env` |
| `schema` | Ruta al `schema.prisma` |
| `datasource.url` | URL de conexión, leída de la variable `DATABASE_URL` |

Lo usa **solo el CLI de Prisma** (`migrate`, `generate`, `studio`). La aplicación en ejecución no lee este archivo: se conecta mediante `src/config/prisma.js`.

> `env('DATABASE_URL')` lanza error si la variable no existe. Por eso el Dockerfile le pasa un valor de relleno al ejecutar `prisma generate`.

### 3.5 Migraciones (`prisma/migrations/`)

Una migración es un archivo SQL que describe un cambio en la base. Todas juntas forman el **historial** de cómo evolucionó el esquema.

```
migrations/
├── migration_lock.toml          ← Fija el proveedor (postgresql); no se edita
└── 20260101120000_init/
    └── migration.sql            ← CREATE TYPE / CREATE TABLE / FOREIGN KEY...
```

- Cada carpeta se llama `<fecha-hora>_<nombre>` y se aplica **en orden**.
- Prisma registra qué migraciones ya se aplicaron en la tabla `_prisma_migrations` de la base.
- **Se suben a Git.** Sin ellas, otra persona (o el contenedor de Docker) no puede crear las tablas.
- Una migración ya aplicada **no se edita**: los cambios nuevos se hacen con una migración nueva.

### 3.6 El cliente generado y `src/config/prisma.js`

`npx prisma generate` lee el schema y genera, dentro de `node_modules`, un cliente con un método por cada modelo (`prisma.usuario`, `prisma.solicitudServicio`). Por eso:

- **No se sube a Git** (está en `node_modules`).
- **Hay que regenerarlo** tras instalar dependencias o cambiar el schema.

`backend/src/config/prisma.js` crea la instancia que usa toda la aplicación:

```js
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

module.exports = prisma;
```

- **`PrismaPg` (adapter):** es el puente entre el cliente de Prisma y el driver `pg` de PostgreSQL. Desde Prisma 7 es obligatorio.
- **Una sola instancia:** al exportarla como módulo, Node la cachea y todos los archivos comparten la misma conexión. Crear varios `new PrismaClient()` agotaría las conexiones de la base.

Uso desde un service:

```js
const prisma = require('../config/prisma');

const usuario = await prisma.usuario.findUnique({ where: { email } });

const solicitud = await prisma.solicitudServicio.create({
  data: { titulo, descripcion, categoria, direccion, clienteId },
});

const lista = await prisma.solicitudServicio.findMany({
  where: { estado: 'PENDIENTE' },
  include: { cliente: { select: { id: true, nombre: true } } },
});
```

### 3.7 Qué pasa cuando se ejecuta una consulta

```mermaid
sequenceDiagram
    participant S as Service
    participant P as Prisma Client
    participant A as adapter-pg / pg
    participant DB as PostgreSQL
    S->>P: prisma.usuario.findUnique({ where: { email } })
    P->>A: SQL parametrizado
    A->>DB: SELECT ... WHERE email = $1
    DB-->>A: filas
    A-->>P: resultado
    P-->>S: objeto JS tipado
```

### 3.8 Prisma Studio

`npx prisma studio` abre una interfaz web para ver y editar los datos de las tablas. Es útil para verificar que la conexión y los datos son los esperados. Solo para desarrollo.

### 3.9 Cuándo correr cada comando de Prisma

| Situación | Comando |
| --- | --- |
| Primera vez / cambiaste `schema.prisma` | `npx prisma migrate dev --name <descripcion>` y luego `npx prisma generate` |
| Instalaste dependencias o clonaste el repo | `npx prisma generate` |
| Hiciste `git pull` y hay migraciones nuevas | `npx prisma migrate dev` |
| Producción / contenedor | `npx prisma migrate deploy` (solo aplica, nunca crea migraciones) |
| Querés borrar todo y empezar de cero (**borra datos**) | `npx prisma migrate reset` |
| Ver el estado de las migraciones | `npx prisma migrate status` |

`migrate dev` **no** genera el cliente automáticamente en Prisma 7, por eso siempre se acompaña de `generate`.

---

## 4. Docker

### 4.1 Conceptos básicos

| Concepto | Qué es |
| --- | --- |
| **Imagen** | Plantilla de solo lectura con todo lo necesario para ejecutar algo (sistema, Node, tu código). Se construye con un `Dockerfile` |
| **Contenedor** | Una imagen en ejecución. Es descartable: al borrarlo se pierde lo que tenía adentro |
| **Volumen** | Almacenamiento que vive fuera del contenedor y sobrevive a su borrado. Es donde se guardan los datos de la base |
| **Red** | Red virtual que permite a los contenedores comunicarse por nombre |
| **Docker Compose** | Herramienta que define y levanta varios contenedores con un solo archivo y un solo comando |

### 4.2 Qué archivos de Docker tiene el proyecto

| Archivo | Ubicación | Función |
| --- | --- | --- |
| `docker-compose.yml` | raíz del repo | Define los servicios `db` y `api`, sus puertos, variables y volumen |
| `Dockerfile` | `backend/` | Receta para construir la imagen de la API |
| `.dockerignore` | `backend/` | Lista lo que no se copia a la imagen |
| `.env` | raíz del repo | Valores que Compose inyecta en `docker-compose.yml` (por ejemplo `JWT_SECRET`) |

### 4.3 `docker-compose.yml`

```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: urbanfix-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: urbanfix
      POSTGRES_PASSWORD: urbanfix_pass
      POSTGRES_DB: urbanfix_db
    ports:
      - "5434:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U urbanfix -d urbanfix_db"]
      interval: 5s
      timeout: 5s
      retries: 10

  api:
    build: ./backend
    container_name: urbanfix-api
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://urbanfix:urbanfix_pass@db:5432/urbanfix_db
      JWT_SECRET: ${JWT_SECRET}
      JWT_EXPIRES_IN: 7d
      PORT: 3001
    ports:
      - "3001:3001"

volumes:
  pgdata:
```

> El puerto de la izquierda de `ports` de `db` (aquí `5434`) es el que elegiste para tu máquina. Si en tu archivo es otro, usá el tuyo.

#### Servicio `db` (PostgreSQL)

| Clave | Qué hace |
| --- | --- |
| `image: postgres:16-alpine` | Usa la imagen oficial de Postgres 16 (variante liviana). No se construye: se descarga |
| `container_name` | Nombre fijo del contenedor |
| `restart: unless-stopped` | Se reinicia solo si se cae o si se reinicia Docker, salvo que lo frenes vos |
| `environment` | Crea el usuario, la contraseña y la base al **inicializar por primera vez** |
| `ports: "5434:5432"` | Formato `PUERTO_DE_TU_PC:PUERTO_DEL_CONTENEDOR`. Permite conectarte desde afuera (Prisma Studio, `npm run dev`) |
| `volumes: pgdata:...` | Guarda los datos en el volumen `pgdata`. Sin esto, los datos se perderían al borrar el contenedor |
| `healthcheck` | Cada 5 s ejecuta `pg_isready`. El servicio pasa a `healthy` cuando Postgres ya acepta conexiones |

> **Ojo:** `POSTGRES_USER`, `POSTGRES_PASSWORD` y `POSTGRES_DB` solo se aplican cuando el volumen está **vacío**. Si los cambiás después, no tienen efecto hasta borrar el volumen (`docker compose down -v`, que elimina los datos).

#### Servicio `api` (la aplicación)

| Clave | Qué hace |
| --- | --- |
| `build: ./backend` | Construye la imagen con el `Dockerfile` de `backend/` |
| `depends_on` + `service_healthy` | La API espera a que la base esté **lista**, no solo iniciada |
| `DATABASE_URL` | Apunta al host **`db`** (el nombre del servicio) y al puerto **interno** 5432 |
| `JWT_SECRET: ${JWT_SECRET}` | Toma el valor del `.env` de la raíz. Si falta, Compose avisa y la API no arranca |
| `ports: "3001:3001"` | Expone la API en `http://localhost:3001` |

#### `volumes`

Declara el volumen con nombre `pgdata`, administrado por Docker.

### 4.4 `backend/Dockerfile`

```dockerfile
FROM node:22-bookworm-slim

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts ./

RUN DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate

COPY src ./src

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
```

| Instrucción | Qué hace |
| --- | --- |
| `FROM node:22-bookworm-slim` | Imagen base: Node 22 sobre Debian, versión liviana |
| `RUN apt-get ... openssl` | Instala OpenSSL, que Prisma necesita en Debian slim |
| `WORKDIR /app` | Carpeta de trabajo dentro del contenedor |
| `COPY package*.json ./` + `RUN npm ci` | Instala las dependencias exactas del `package-lock.json`. Se copian primero para que Docker **reutilice la caché** si no cambiaron |
| `COPY prisma ./prisma` y `prisma.config.ts` | Trae el schema y las migraciones |
| `RUN ... npx prisma generate` | Genera el cliente de Prisma dentro de la imagen. Usa una URL falsa porque `generate` no se conecta a la base, pero el config exige que la variable exista |
| `COPY src ./src` | Copia el código al final, porque es lo que más cambia (aprovecha la caché) |
| `EXPOSE 3001` | Documenta el puerto que usa la app (no lo abre por sí solo; eso lo hace `ports` en Compose) |
| `CMD [...]` | Al **iniciar el contenedor**: aplica las migraciones pendientes y luego arranca el servidor |

Detalles importantes:

- `npm ci` instala también las `devDependencies`, y **eso es necesario**: la CLI `prisma` está ahí y se usa en `migrate deploy`. No agregues `--omit=dev` sin mover `prisma` a `dependencies`.
- El código se copia a la imagen: **si cambiás un archivo, hay que reconstruir** (`docker compose up -d --build`).
- Las migraciones corren cada vez que arranca el contenedor. Si no hay nada pendiente, no hace nada.

### 4.5 `backend/.dockerignore`

```
node_modules
.env
npm-debug.log
```

Evita copiar a la imagen:

- `node_modules`: se instala dentro del contenedor y la versión de tu máquina podría no ser compatible.
- `.env`: contiene secretos. Nunca debe quedar dentro de una imagen.

### 4.6 Archivos `.env` en Docker

| Archivo | Quién lo lee | Cuándo se usa |
| --- | --- | --- |
| `.env` (raíz) | Docker Compose | Para reemplazar `${JWT_SECRET}` en el `docker-compose.yml` |
| `backend/.env` | Prisma CLI y `npm run dev` | Solo cuando corrés la API **fuera** de Docker |

Dentro del contenedor no se usa ningún `.env`: las variables llegan por la sección `environment` del compose.

### 4.7 Redes y puertos: la parte que más confunde

Hay **dos mundos** con direcciones distintas:

| Desde dónde te conectás | Host de la base | Puerto |
| --- | --- | --- |
| **Contenedor `api`** → base | `db` | `5432` (interno) |
| **Tu PC** (`npm run dev`, Studio, DBeaver) → base | `localhost` | `5434` (el que mapeaste) |

```mermaid
graph LR
    subgraph "Tu PC (host)"
        B[Navegador / Postman]
        D[npm run dev]
    end
    subgraph "Red de Docker"
        A[api :3001]
        P[(db :5432)]
        A -->|"host: db"| P
    end
    B -->|localhost:3001| A
    D -->|localhost:5434| P
```

- Dentro de Docker, `localhost` es **el propio contenedor**, no tu PC ni otro contenedor. Por eso la API usa `db` y no `localhost`.
- `ports: "5434:5432"` es el "agujero" que conecta el puerto 5434 de tu PC con el 5432 del contenedor.
- Si un puerto de tu PC ya está ocupado, solo cambiás el número de la **izquierda**.

### 4.8 Qué pasa cuando ejecutás `docker compose up -d --build`

```mermaid
sequenceDiagram
    participant U as Vos
    participant C as Docker Compose
    participant DB as Contenedor db
    participant API as Contenedor api
    U->>C: docker compose up -d --build
    C->>C: Lee docker-compose.yml y .env
    C->>C: Construye la imagen de la API (Dockerfile)
    C->>DB: Crea y arranca Postgres (monta volumen pgdata)
    DB-->>C: healthcheck: healthy
    C->>API: Arranca el contenedor
    API->>DB: prisma migrate deploy (crea/actualiza tablas)
    API->>API: node src/index.js
    API-->>U: Servidor en http://localhost:3001
```

### 4.9 Persistencia de datos

| Acción | ¿Se pierden los datos? |
| --- | --- |
| `docker compose stop` / `down` | No (queda el volumen) |
| Reiniciar la PC | No |
| `docker compose up -d --build` | No |
| `docker compose down -v` | **Sí** (borra el volumen) |

### 4.10 Dos modos de trabajo

| Modo | Cuándo | Cómo |
| --- | --- | --- |
| **Todo en Docker** | Probar el proyecto completo, simular otra máquina, desplegar | `docker compose up -d --build` |
| **Solo la base en Docker** | Programar día a día con recarga automática | `docker compose up -d db` y luego `npm run dev` en `backend/` |

No uses ambos a la vez: la API del contenedor y `npm run dev` pelearían por el puerto 3001. En el modo "todo en Docker" **no** se corre `npm run dev`.

---

## 5. Variables de entorno

| Variable | Dónde se define | Qué hace |
| --- | --- | --- |
| `DATABASE_URL` | `backend/.env` (local) o `docker-compose.yml` (contenedor) | Cadena de conexión a PostgreSQL |
| `JWT_SECRET` | `.env` (raíz) para Docker; `backend/.env` para local | Clave para firmar los tokens JWT. La API no arranca sin ella |
| `JWT_EXPIRES_IN` | Igual que la anterior | Duración del token (por defecto `7d`) |
| `PORT` | `.env` o compose | Puerto del servidor (por defecto `3001`) |

Formato de `DATABASE_URL`:

```
postgresql://USUARIO:CONTRASEÑA@HOST:PUERTO/NOMBRE_BASE
```

- Local con Docker solo para la base: `postgresql://urbanfix:urbanfix_pass@localhost:5434/urbanfix_db`
- Dentro del contenedor de la API: `postgresql://urbanfix:urbanfix_pass@db:5432/urbanfix_db`
- Si la contraseña tiene caracteres especiales (`@`, `#`, `/`), hay que codificarlos (`@` → `%40`).

**Qué se sube a Git:** los `.env.example`. **Qué no:** los `.env` reales (ya están en `.gitignore`).

---

## 6. Flujos de trabajo

### 6.1 Primera vez en una máquina nueva (con Docker)

```bash
git clone <URL_DEL_REPO>
cd Proyecto-UrbanFix
cp .env.example .env          # y editá JWT_SECRET
docker compose up -d --build
docker compose logs -f api    # debe decir "Server running on port 3001"
curl http://localhost:3001/health
```

### 6.2 Desarrollo diario

```bash
docker compose up -d db
cd backend
npm install                   # solo si cambiaron dependencias
npx prisma generate           # solo si cambió el schema o es la primera vez
npm run dev
```

### 6.3 Cambiar el modelo de datos

1. Editá `backend/prisma/schema.prisma`.
2. Creá y aplicá la migración:

   ```bash
   npx prisma migrate dev --name descripcion_del_cambio
   npx prisma generate
   ```
3. Commiteá el `schema.prisma` **y** la nueva carpeta de `migrations/`.
4. Al reconstruir Docker (`--build`), el contenedor aplicará la migración solo.

### 6.4 Verificar que todo está conectado

```bash
docker compose ps                                                  # db: healthy, api: running
docker compose logs api                                            # migraciones aplicadas + server arriba
docker exec -it urbanfix-db psql -U urbanfix -d urbanfix_db -c "\dt"   # tablas creadas
curl http://localhost:3001/health
```

---

## 7. Referencia de comandos

### Docker

| Acción | Comando |
| --- | --- |
| Levantar todo (reconstruyendo) | `docker compose up -d --build` |
| Levantar solo la base | `docker compose up -d db` |
| Ver estado | `docker compose ps` |
| Ver logs | `docker compose logs -f api` |
| Entrar a la base | `docker exec -it urbanfix-db psql -U urbanfix -d urbanfix_db` |
| Frenar un servicio | `docker compose stop api` |
| Apagar todo (conserva datos) | `docker compose down` |
| Apagar y **borrar datos** | `docker compose down -v` |
| Ver la config final con variables ya resueltas | `docker compose config` |

### Prisma

| Acción | Comando |
| --- | --- |
| Crear y aplicar migración | `npx prisma migrate dev --name <nombre>` |
| Generar el cliente | `npx prisma generate` |
| Aplicar migraciones (producción) | `npx prisma migrate deploy` |
| Estado de las migraciones | `npx prisma migrate status` |
| Resetear la base (**borra datos**) | `npx prisma migrate reset` |
| Interfaz visual | `npx prisma studio` |

### SQL útil (dentro de `psql`)

```sql
\dt                              -- listar tablas
\d "Usuario"                     -- estructura de una tabla
SELECT email, rol FROM "Usuario";
\q                               -- salir
```

Las comillas dobles son necesarias porque Prisma crea las tablas con mayúscula inicial.

---

## 8. Problemas frecuentes

| Síntoma | Causa | Solución |
| --- | --- | --- |
| `port is already allocated` / `address already in use` | El puerto de tu PC está ocupado | Cambiá el número de la **izquierda** en `ports` o liberá el puerto |
| `The "JWT_SECRET" variable is not set` | Falta el `.env` en la raíz del repo | Crealo junto al `docker-compose.yml` |
| `no configuration file provided: not found` | Estás en otra carpeta | Corré el comando desde la raíz, donde está `docker-compose.yml` |
| `Can't reach database server` / `P1001` | Base apagada o host/puerto incorrecto | Dentro de Docker usar `db:5432`; desde tu PC `localhost:<puerto mapeado>` |
| `relation "Usuario" does not exist` | Faltan aplicar las migraciones | `npx prisma migrate dev` (local) o reconstruir con `--build` (Docker); verificá que exista `prisma/migrations/` |
| `Cannot find module '@prisma/client'` o el cliente no tiene los modelos | No se generó el cliente | `npx prisma generate` |
| `No database URL found` en Prisma Studio | El CLI no encontró `prisma.config.ts` o el `.env` | Ejecutalo desde `backend/` y revisá que `DATABASE_URL` exista |
| Cambié el código y el contenedor sigue igual | La imagen tiene el código viejo | `docker compose up -d --build` |
| Cambié `POSTGRES_PASSWORD` y no hace efecto | Esas variables solo se leen con el volumen vacío | `docker compose down -v` (borra datos) y volver a levantar |
| `npm ci` falla al construir | `package.json` y `package-lock.json` desincronizados | Corré `npm install` y commiteá ambos archivos |

---

## 9. Glosario

| Término | Significado |
| --- | --- |
| **ORM** | Herramienta que traduce objetos del lenguaje a tablas de la base |
| **Schema** | Descripción de la estructura de la base (tablas, campos, relaciones) |
| **Migración** | Cambio versionado y reproducible sobre el esquema de la base |
| **Driver adapter** | Componente que conecta el cliente de Prisma con un driver concreto (`pg` para PostgreSQL) |
| **Clave primaria (PK)** | Campo que identifica de forma única cada registro |
| **Clave foránea (FK)** | Campo que referencia la clave primaria de otra tabla |
| **UUID** | Identificador único universal (ej. `3f2b8c1e-...`) |
| **Imagen** | Plantilla inmutable con la que se crean contenedores |
| **Contenedor** | Instancia en ejecución de una imagen |
| **Volumen** | Almacenamiento persistente fuera del contenedor |
| **Healthcheck** | Comprobación periódica de que un servicio está funcionando |
| **Compose** | Herramienta para definir y ejecutar varios contenedores juntos |