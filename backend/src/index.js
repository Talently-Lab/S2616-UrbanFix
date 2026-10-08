import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
