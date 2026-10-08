FROM node:22-bookworm-slim

# Prisma necesita openssl
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.js ./

# generate no se conecta a la base, pero el config exige que la variable exista
RUN DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate

COPY src ./src

EXPOSE 3001

# Aplica las migraciones, siembra datos de prueba (idempotente) y arranca la API
CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/seed.js && node src/index.js"]