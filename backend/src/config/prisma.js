import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Prisma 7 necesita un driver adapter para conectarse a PostgreSQL.
// Configuración acotada de timeouts (BE-06):
// - connectionTimeoutMillis: 5000 garantiza un límite <=5s ante fallos de conexión de red o DB inaccesible.
// - statement_timeout: 5000 cancela sentencias SQL individuales que superen los 5s, evitando consultas pendientes ilimitadas.
// Ambos valores son compatibles con transacciones concurrentes de la aplicación y bloqueos breves de fila.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
  statement_timeout: 5000
});

const prisma = new PrismaClient({ adapter });

export default prisma;
