import dotenv from 'dotenv';

// Carga .env sin sobrescribir variables ya provistas explícitamente en process.env
dotenv.config();

export const PLACEHOLDER_JWT_SECRET = 'reemplazar-por-un-secreto-propio-aleatorio';
export const ALLOWED_NODE_ENVS = ['development', 'test', 'production'];

export class ConfigError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'ConfigError';
    this.details = details;
  }
}

/**
 * Valida la sintaxis de DATABASE_URL.
 * Debe ser una URL válida con protocolo postgres/postgresql, host y nombre de base de datos.
 * NUNCA imprime el contenido ni credenciales en el mensaje de error.
 */
export function validateDatabaseUrl(databaseUrl) {
  if (databaseUrl === undefined || databaseUrl === null || typeof databaseUrl !== 'string' || !databaseUrl.trim()) {
    throw new ConfigError('Variable de entorno DATABASE_URL no configurada o vacía. Requerida para iniciar la API.');
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl.trim());
  } catch (_) {
    throw new ConfigError('Variable de entorno DATABASE_URL sintácticamente inválida: formato de URL no válido.');
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new ConfigError('Variable de entorno DATABASE_URL sintácticamente inválida: protocolo debe ser postgres: o postgresql:.');
  }

  if (!parsed.hostname || !parsed.hostname.trim()) {
    throw new ConfigError('Variable de entorno DATABASE_URL sintácticamente inválida: host ausente.');
  }

  const dbName = parsed.pathname.replace(/^\/+/, '').trim();
  if (!dbName) {
    throw new ConfigError('Variable de entorno DATABASE_URL sintácticamente inválida: nombre de base de datos ausente.');
  }

  return databaseUrl.trim();
}

/**
 * Valida el puerto HTTP. Entero entre 1 y 65535. Default 3001.
 */
export function validatePort(portVal) {
  if (portVal === undefined || portVal === null || portVal === '') {
    return 3001;
  }

  const str = String(portVal).trim();
  if (!/^\d+$/.test(str)) {
    throw new ConfigError('Variable de entorno PORT inválida: debe ser un entero positivo entre 1 y 65535.');
  }

  const port = parseInt(str, 10);
  if (port < 1 || port > 65535) {
    throw new ConfigError('Variable de entorno PORT inválida: rango fuera de 1..65535.');
  }

  return port;
}

/**
 * Valida NODE_ENV: development, test, production. Default development.
 */
export function validateNodeEnv(nodeEnvVal) {
  if (nodeEnvVal === undefined || nodeEnvVal === null || nodeEnvVal === '') {
    return 'development';
  }

  const str = String(nodeEnvVal).trim();
  if (!ALLOWED_NODE_ENVS.includes(str)) {
    throw new ConfigError(`Variable de entorno NODE_ENV inválida: valor no permitido (permitidos: ${ALLOWED_NODE_ENVS.join(', ')}).`);
  }

  return str;
}

/**
 * Valida JWT_SECRET:
 * - Requerido, no vacío.
 * - Al menos 32 caracteres.
 * - Rechaza el placeholder exacto de .env.example.
 * NUNCA imprime el valor del secreto en los mensajes de error.
 */
export function validateJwtSecret(secretVal) {
  if (secretVal === undefined || secretVal === null || typeof secretVal !== 'string' || !secretVal.trim()) {
    throw new ConfigError('Variable de entorno JWT_SECRET no configurada o vacía. Requerida para emitir y validar JWT.');
  }

  const secret = secretVal.trim();
  if (secret === PLACEHOLDER_JWT_SECRET) {
    throw new ConfigError('Variable de entorno JWT_SECRET inválida: no debe utilizar el placeholder de ejemplo.');
  }

  if (secret.length < 32) {
    throw new ConfigError('Variable de entorno JWT_SECRET inválida: debe tener una longitud mínima de 32 caracteres.');
  }

  return secret;
}

/**
 * Valida JWT_EXPIRES_IN:
 * - Entero positivo con unidad explícita (s, m, h, d).
 * - Rechaza enteros sin unidad para evitar ambigüedad de milisegundos.
 * - Calcula y retorna segundos para jwt.sign.
 * - Controla overflow en enteros seguros.
 * Default 7d (604800 segundos).
 */
export function validateJwtExpiresIn(expiresInVal) {
  if (expiresInVal === undefined || expiresInVal === null || expiresInVal === '') {
    return { raw: '7d', seconds: 604800 };
  }

  const str = String(expiresInVal).trim();
  const match = str.match(/^([1-9]\d*)([smhd])$/);
  if (!match) {
    throw new ConfigError('Variable de entorno JWT_EXPIRES_IN inválida: debe ser un entero positivo con unidad explícita (s, m, h, d), ej. 30m, 1h, 7d.');
  }

  const amount = parseInt(match[1], 10);
  const unit = match[2];

  let multiplier;
  switch (unit) {
    case 's': multiplier = 1; break;
    case 'm': multiplier = 60; break;
    case 'h': multiplier = 3600; break;
    case 'd': multiplier = 86400; break;
    default:
      throw new ConfigError('Variable de entorno JWT_EXPIRES_IN inválida: unidad no soportada.');
  }

  const seconds = amount * multiplier;
  if (!Number.isSafeInteger(seconds) || seconds <= 0 || seconds > 3153600000) { // límite razonable de 100 años
    throw new ConfigError('Variable de entorno JWT_EXPIRES_IN inválida: duración excede el rango máximo seguro permitido.');
  }

  return { raw: str, seconds };
}

/**
 * Valida CORS_ORIGINS:
 * - Lista separada por comas de orígenes HTTP(S).
 * - Normalizada a origin (sin paths, query ni credenciales).
 * - Rechaza '*' y 'null'.
 * - En development y test: si se omite, default a localhost:5173 y 127.0.0.1:5173.
 * - En production: obligatoria y no vacía.
 */
export function validateCorsOrigins(corsOriginsVal, nodeEnv = 'development') {
  const isProd = nodeEnv === 'production';
  const hasValue = corsOriginsVal !== undefined && corsOriginsVal !== null && String(corsOriginsVal).trim() !== '';

  if (!hasValue) {
    if (isProd) {
      throw new ConfigError('Variable de entorno CORS_ORIGINS requerida en producción y no puede estar vacía.');
    }
    return ['http://localhost:5173', 'http://127.0.0.1:5173'];
  }

  const rawEntries = String(corsOriginsVal).split(',');
  const normalizedOrigins = [];

  for (let i = 0; i < rawEntries.length; i++) {
    const rawEntry = rawEntries[i];
    const entry = rawEntry.trim();
    const pos = i + 1;
    if (!entry) {
      throw new ConfigError(`Variable de entorno CORS_ORIGINS inválida: entrada ${pos} vacía entre comas.`);
    }

    if (entry === '*' || entry === 'null' || entry.includes('*')) {
      throw new ConfigError(`Variable de entorno CORS_ORIGINS inválida: entrada ${pos} no puede ser "*" ni "null".`);
    }

    let parsed;
    try {
      parsed = new URL(entry);
    } catch (_) {
      throw new ConfigError(`Variable de entorno CORS_ORIGINS inválida: entrada ${pos} no es una URL válida.`);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new ConfigError(`Variable de entorno CORS_ORIGINS inválida: entrada ${pos} debe usar protocolo http o https.`);
    }

    if (parsed.pathname !== '/' && parsed.pathname !== '') {
      throw new ConfigError(`Variable de entorno CORS_ORIGINS inválida: entrada ${pos} no debe contener ruta/path.`);
    }

    if (parsed.search) {
      throw new ConfigError(`Variable de entorno CORS_ORIGINS inválida: entrada ${pos} no debe contener parámetros query.`);
    }

    if (parsed.hash) {
      throw new ConfigError(`Variable de entorno CORS_ORIGINS inválida: entrada ${pos} no debe contener fragmento hash.`);
    }

    if (parsed.username || parsed.password) {
      throw new ConfigError(`Variable de entorno CORS_ORIGINS inválida: entrada ${pos} no debe incluir credenciales.`);
    }

    const origin = parsed.origin;
    if (!normalizedOrigins.includes(origin)) {
      normalizedOrigins.push(origin);
    }
  }

  if (normalizedOrigins.length === 0) {
    throw new ConfigError('Variable de entorno CORS_ORIGINS inválida: no se encontraron orígenes válidos.');
  }

  return normalizedOrigins;
}

/**
 * Obtiene y valida exclusivamente la configuración JWT requerida por auth.
 * Útil para servicios y pruebas sin exigir configuración HTTP ni base de datos completa.
 */
export function getJwtConfig(env = process.env) {
  const secret = validateJwtSecret(env.JWT_SECRET);
  const expiresIn = validateJwtExpiresIn(env.JWT_EXPIRES_IN);
  return {
    secret,
    expiresIn: expiresIn.raw,
    expiresInSeconds: expiresIn.seconds
  };
}

/**
 * Valida la configuración global de la aplicación antes del arranque HTTP.
 * Si alguna variable es inválida, recopila todos los errores y lanza ConfigError.
 */
export function loadConfig(env = process.env) {
  const errors = [];

  let nodeEnv;
  try {
    nodeEnv = validateNodeEnv(env.NODE_ENV);
  } catch (err) {
    errors.push(err.message);
  }

  let port;
  try {
    port = validatePort(env.PORT);
  } catch (err) {
    errors.push(err.message);
  }

  let databaseUrl;
  try {
    databaseUrl = validateDatabaseUrl(env.DATABASE_URL);
  } catch (err) {
    errors.push(err.message);
  }

  let jwtSecret;
  try {
    jwtSecret = validateJwtSecret(env.JWT_SECRET);
  } catch (err) {
    errors.push(err.message);
  }

  let jwtExpiresIn;
  try {
    jwtExpiresIn = validateJwtExpiresIn(env.JWT_EXPIRES_IN);
  } catch (err) {
    errors.push(err.message);
  }

  let allowedOrigins;
  try {
    allowedOrigins = validateCorsOrigins(env.CORS_ORIGINS, nodeEnv || 'development');
  } catch (err) {
    errors.push(err.message);
  }

  if (errors.length > 0) {
    throw new ConfigError(
      `Fallo de validación de configuración al iniciar API:\n${errors.map(e => `  - ${e}`).join('\n')}`,
      errors
    );
  }

  return {
    nodeEnv,
    port,
    databaseUrl,
    jwt: {
      secret: jwtSecret,
      expiresIn: jwtExpiresIn.raw,
      expiresInSeconds: jwtExpiresIn.seconds
    },
    cors: {
      allowedOrigins
    }
  };
}
