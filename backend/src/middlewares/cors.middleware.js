/**
 * Middleware de control de acceso CORS según la política arquitectónica de UrbanFix (BE-03).
 *
 * Reglas:
 * 1. Solicitudes sin header Origin (curl, health checks, server-to-server):
 *    Permitidas directamente sin restricciones CORS, continuando con el flujo normal de auth/rutas.
 * 2. Solicitudes con Origin no permitido (incluyendo 'null', '*', u orígenes fuera de allowlist):
 *    Rechazadas con HTTP 403, error JSON con código CORS_ORIGIN_DENIED y sin cabecera Access-Control-Allow-Origin.
 * 3. Solicitudes con Origin permitido:
 *    Retornan Access-Control-Allow-Origin con el origen exacto y Vary: Origin.
 *    Preflight OPTIONS: responde HTTP 204 con métodos y headers permitidos (Content-Type, Authorization).
 */
export function createCorsMiddleware(allowedOrigins = []) {
  const allowedSet = new Set(allowedOrigins);

  return (req, res, next) => {
    const origin = req.headers.origin;

    // Requests sin Origin son permitidos directamente (curl, health, server-to-server)
    if (!origin) {
      return next();
    }

    // Validación de allowlist
    if (!allowedSet.has(origin)) {
      return res.status(403).json({
        error: {
          code: 'CORS_ORIGIN_DENIED',
          message: 'Origen no permitido por la política CORS'
        }
      });
    }

    // Origen permitido: reflejar origen y asegurar Vary: Origin
    res.setHeader('Access-Control-Allow-Origin', origin);
    const existingVary = res.getHeader('Vary');
    if (!existingVary) {
      res.setHeader('Vary', 'Origin');
    } else if (!String(existingVary).split(',').map(s => s.trim().toLowerCase()).includes('origin')) {
      res.setHeader('Vary', `${existingVary}, Origin`);
    }

    // Preflight OPTIONS
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      return res.status(204).end();
    }

    next();
  };
}
