import 'dotenv/config';
import express from 'express';
import { loadConfig } from './config/env.js';
import { createCorsMiddleware } from './middlewares/cors.middleware.js';
import routes from './routes/index.js';
import prisma from './config/prisma.js';

// Validar configuración HTTP/auth/base de datos antes de escuchar
let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const app = express();

// CORS configurable por entorno
app.use(createCorsMiddleware(config.cors.allowedOrigins));
app.use(express.json());

// Health check (liveness del proceso)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Readiness check (comprobación de conectividad y esquema preparado con PostgreSQL)
const REQUIRED_TABLES = ['Usuario', 'SolicitudServicio', 'HistorialEstadoSolicitud', 'RechazoSolicitud'];

app.get('/ready', async (req, res) => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('Usuario', 'SolicitudServicio', 'HistorialEstadoSolicitud', 'RechazoSolicitud')
    `;

    const foundTables = new Set((rows || []).map((r) => r.table_name));
    const isReady = REQUIRED_TABLES.every((t) => foundTables.has(t));

    if (isReady) {
      return res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    }

    return res.status(503).json({
      status: 'unavailable',
      message: 'Esquema de base de datos no preparado',
      timestamp: new Date().toISOString()
    });
  } catch (_err) {
    return res.status(503).json({
      status: 'unavailable',
      message: 'Base de datos no disponible',
      timestamp: new Date().toISOString()
    });
  }
});

app.use('/api', routes);

// 404
app.use((req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' }
  });
});

// Manejador global de errores
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'Error interno del servidor';

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({
    error: {
      code,
      message,
      ...(err.details && { details: err.details })
    }
  });
});

const server = app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});

export { app, server, config };
