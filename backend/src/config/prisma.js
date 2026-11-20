import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Prisma 7 necesita un driver adapter para conectarse a PostgreSQL.
// Configuración acotada de timeouts (BE-06 / D4):
// - connectionTimeoutMillis: 4000 garantiza un límite <=4s al abrir nuevas conexiones ante red muda o DB caída.
// - query_timeout: 4000 cancela en el cliente (socket) si la DB se pausa o congela sobre un socket ya establecido (warm pool).
// - statement_timeout: 4000 cancela en el servidor PostgreSQL consultas que superen los 4s.
// Ambos límites garantizan que /ready responda deterministamente en <= 4s (cumpliendo el SLA de <= 5s), purgando el
// socket averiado del pool y permitiendo autorecuperación inmediata una vez restablecido PostgreSQL.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 4000,
  query_timeout: 4000,
  statement_timeout: 4000
});

const prisma = new PrismaClient({ adapter });

export default prisma;
