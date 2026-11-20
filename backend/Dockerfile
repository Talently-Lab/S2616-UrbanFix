FROM node:24-bookworm-slim

# Prisma necesita openssl
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Asignar propiedad de /app al usuario no-root 'node'
RUN chown -R node:node /app

# Instalar dependencias con lockfile
COPY --chown=node:node package*.json ./
USER node
RUN npm ci

# Copiar configuración de Prisma y generar cliente
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node prisma.config.js ./
RUN DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate

# Copiar código fuente
COPY --chown=node:node src ./src

# Copiar selectivamente artefactos requeridos para npm run db:precheck
COPY --chown=node:node tests/migrations/migration-precheck.js ./tests/migrations/
COPY --chown=node:node tests/migrations/schemas ./tests/migrations/schemas

EXPOSE 3001

# Healthcheck de contenedor contra el endpoint /ready (sin depender de curl externo)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node --input-type=module -e "import http from 'node:http'; const port = process.env.PORT || 3001; const req = http.get('http://127.0.0.1:' + port + '/ready', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }); req.on('error', () => process.exit(1)); req.setTimeout(4000, () => { req.destroy(); process.exit(1); });"

# El contenedor arranca EXCLUSIVAMENTE el servidor HTTP con validación de configuración.
# No aplica migraciones ni seed automáticamente (ambos son pasos explícitos).
CMD ["node", "src/index.js"]
