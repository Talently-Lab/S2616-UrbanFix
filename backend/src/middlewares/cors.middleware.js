/**
 * Middleware de control de acceso CORS según la política arquitectónica de UrbanFix (BE-03).
 *
 * Reglas:
 * 1. Cabecera Vary:
 *    Se establece siempre Vary: Origin en todas las respuestas procesadas (permitidas, denegadas
 *    o sin Origin) para garantizar cachés HTTP coherentes, preservando valores previos de Vary.
 * 2. Solicitudes sin header Origin (curl, health checks, server-to-server):
 *    Permitidas directamente sin restricciones CORS, continuando con el flujo normal de auth/rutas.
 * 3. Solicitudes con Origin no permitido (incluyendo 'null', '*', u orígenes fuera de allowlist):
 *    Rechazadas con HTTP 403, error JSON con código CORS_ORIGIN_DENIED y sin cabecera Access-Control-Allow-Origin.
 * 4. Solicitudes con Origin permitido:
 *    Retornan Access-Control-Allow-Origin con el origen exacto reflejado.
 *    Preflight OPTIONS: responde HTTP 204 con métodos y headers permitidos (Content-Type, Authorization).
 */
export function createCorsMiddleware(allowedOrigins = []) {
  const allowedSet = new Set(allowedOrigins);

  return (req, res, next) => {
    // Establecer Vary: Origin en todas las ramas para cachés coherentes
    if (typeof res.vary === 'function') {
      res.vary('Origin');
    } else {
      const existingVary = res.getHeader('Vary');
      if (!existingVary) {
        res.setHeader('Vary', 'Origin');
      } else if (!String(existingVary).split(',').map(s => s.trim().toLowerCase()).includes('origin')) {
        res.setHeader('Vary', `${existingVary}, Origin`);
      }
    }

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

    // Origen permitido: reflejar origen
    res.setHeader('Access-Control-Allow-Origin', origin);

    // Preflight OPTIONS
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      return res.status(204).end();
    }

    next();
  };
}
