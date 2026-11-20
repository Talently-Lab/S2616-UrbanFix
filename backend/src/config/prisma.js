import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Prisma 7 necesita un driver adapter para conectarse a PostgreSQL.
// Configuración acotada de timeouts por fase (BE-06 / D4 / E2):
// - connectionTimeoutMillis: 4000 acota a 4s el intento de abrir nuevas conexiones ante red muda o DB caída.
// - query_timeout: 4000 cancela en el cliente (socket) si la DB se pausa o congela sobre un socket ya establecido (warm pool).
// - statement_timeout: 4000 cancela en el servidor PostgreSQL consultas individuales que superen los 4s.
// Cada timeout opera por fase de forma independiente (no una garantía universal de extremo a extremo ni SLA absoluto
// bajo cualquier combinación de fallas). En las mediciones de QA bajo pausa de PostgreSQL, /ready respondió
// en ~4.005–4.012s, purgando el socket colgado del pool y permitiendo autorecuperación tras reanudar la base.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 4000,
  query_timeout: 4000,
  statement_timeout: 4000
});

const prisma = new PrismaClient({ adapter });

export default prisma;
