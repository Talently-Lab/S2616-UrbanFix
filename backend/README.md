# 🛠️ Backend - Guía de Inicio Rápido

Esta guía detalla cómo correr la aplicación en modo desarrollo (`npm run dev`) utilizando **únicamente la base de datos PostgreSQL en Docker** (sin necesidad de compilar la imagen completa de la API).

---

## 📋 Requisitos Previos

- [Node.js](https://nodejs.org/) instalado.
- [Docker](https://www.docker.com/) y Docker Compose en funcionamiento.

---

## 🚀 Pasos para Iniciar

### 1. Configurar Variables de Entorno

Asegurate de que el archivo `backend/.env` apunte al contenedor de Postgres (puerto `5434`, usuario `urbanfix`):

```env
DATABASE_URL="postgresql://urbanfix:urbanfix_pass@localhost:5434/urbanfix_db?schema=public"
```

> **Nota:** Si tu Postgres local corre en el puerto `5432`, modifícalo según la base de datos que quieras utilizar.

---

### 2. Levantar la Base de Datos en Docker

Iniciá solo el servicio de base de datos en segundo plano:

```bash
docker compose up -d db
```

> 💡 **Tip:** El volumen conserva las migraciones y seed de ejecuciones previas. Si necesitás empezar desde cero y limpiar los datos, ejecutá:
> ```bash
> docker compose down -v
> docker compose up -d db
> ```

---
### Todavia no realizar, en semana 4 se agrega el seed.js y los tests en scripts
### 3. Preparar la Base de Datos

Desde la carpeta `backend/`, corré las migraciones y los datos de prueba (seeds) con Prisma:

```bash
cd backend
npx prisma migrate deploy
npx prisma db seed
```

---

### 4. Correr la Aplicación

Ejecutá el servidor en modo desarrollo:

```bash
npm run dev
```

La API quedará escuchando en:
👉 **`http://localhost:3001/api`**

---

## 🛑 Detener el Servicio

Cuando termines de trabajar, podés detener el contenedor de la base de datos sin perder tus datos:

```bash
docker compose stop db
```

*(O `docker compose down` si preferís bajar el contenedor conservando el volumen).*