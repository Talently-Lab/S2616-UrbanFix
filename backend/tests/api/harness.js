import net from 'node:net';
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const backendRoot = path.resolve(__dirname, '../..');

const { Client } = pg;

export function maskUrl(dbUrl) {
  try {
    const u = new URL(dbUrl);
    if (u.password) {
      u.password = '***';
    }
    return u.toString();
  } catch (_) {
    return 'URL_INVALIDA';
  }
}

export function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

export function isDockerAvailable() {
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 3000 });
    return true;
  } catch (_) {
    return false;
  }
}

export function getAdminUrl(dbUrl) {
  const parsed = new URL(dbUrl);
  parsed.pathname = '/postgres';
  return parsed.toString();
}

export async function executeAdminQuery(adminUrl, sql) {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    return await client.query(sql);
  } finally {
    await client.end();
  }
}

function runCommandAsync(command, envOverrides = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', command], {
      cwd: backendRoot,
      env: { ...process.env, ...envOverrides },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        const err = new Error(`Command failed: ${command}\nExit code: ${code}\nStderr: ${stderr}\nStdout: ${stdout}`);
        err.status = code;
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      }
    });
  });
}

/**
 * Espera a que un servidor PostgreSQL esté listo para aceptar conexiones.
 */
async function waitForPostgres(connectionString, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    let client;
    try {
      client = new Client({ connectionString, connectionTimeoutMillis: 1000 });
      await client.connect();
      await client.query('SELECT 1;');
      await client.end();
      return true;
    } catch (_) {
      if (client) {
        try { await client.end(); } catch (_) {}
      }
      await new Promise(r => setTimeout(r, 250));
    }
  }
  throw new Error(`Timeout de espera agotado (${timeoutMs}ms) conectando a PostgreSQL en ${maskUrl(connectionString)}`);
}

/**
 * Prepara el entorno de base de datos aislada:
 * - Si existe TEST_DATABASE_URL: crea una base efímera única en ese servidor.
 * - Si no existe TEST_DATABASE_URL: arranca un contenedor postgres:16-alpine efímero en un puerto libre.
 * - Si no hay Docker ni TEST_DATABASE_URL: aborta con un mensaje legible de requisitos (nunca fallback a DATABASE_URL).
 */
export async function setupTestDatabase() {
  const rawTestUrl = process.env.TEST_DATABASE_URL;

  if (rawTestUrl && typeof rawTestUrl === 'string' && rawTestUrl.trim()) {
    const baseTestUrl = rawTestUrl.trim();
    console.log(`[Harness DB] Usando servidor de pruebas indicado por TEST_DATABASE_URL: ${maskUrl(baseTestUrl)}`);
    const adminUrl = getAdminUrl(baseTestUrl);
    await waitForPostgres(adminUrl, 10000);

    const runId = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
    const dbName = `uf_test_api_${runId}`;
    console.log(`[Harness DB] Creando base de datos aislada para esta corrida: ${dbName}`);
    await executeAdminQuery(adminUrl, `CREATE DATABASE ${dbName};`);

    const parsed = new URL(baseTestUrl);
    parsed.pathname = `/${dbName}`;
    const testDbUrl = parsed.toString();

    return {
      testDbUrl,
      dbName,
      adminUrl,
      isDocker: false,
      containerName: null
    };
  }

  // Comprobar Docker
  if (!isDockerAvailable()) {
    const errorMsg = [
      '\n❌ ERROR DE CONFIGURACIÓN DEL ENTORNO DE PRUEBAS:',
      'No se encontró la variable TEST_DATABASE_URL y Docker no está disponible.',
      '',
      'Para ejecutar "npm test" de manera reproducible y aislada:',
      '  Opción A: Inicie el servicio Docker (el runner creará automáticamente un contenedor efímero postgres:16-alpine en un puerto libre).',
      '  Opción B: Defina la variable TEST_DATABASE_URL con una instancia de PostgreSQL exclusiva de pruebas con privilegio CREATEDB.',
      '     Ejemplo: TEST_DATABASE_URL="postgresql://postgres:testpass@localhost:55432/postgres"',
      '',
      'Por directiva de seguridad arquitectónica (AGENTS.md), el test runner tiene PROHIBIDO el fallback automático a DATABASE_URL',
      'para evitar modificar o reiniciar bases de datos de desarrollo o compartidas.\n'
    ].join('\n');
    throw new Error(errorMsg);
  }

  // Arrancar contenedor postgres:16-alpine efímero
  const pgPort = await getAvailablePort();
  const runId = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  const containerName = `uf-test-pg-${runId}`;
  const password = `testpass_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;

  console.log(`[Harness DB] Iniciando contenedor efímero Docker (${containerName}) en puerto ${pgPort}...`);
  try {
    execSync(
      `docker run --detach --name ${containerName} --publish 127.0.0.1:${pgPort}:5432 -e POSTGRES_PASSWORD=${password} postgres:16-alpine`,
      { stdio: 'pipe' }
    );
  } catch (dockerErr) {
    throw new Error(`Fallo al iniciar contenedor Docker efímero: ${dockerErr.message}`);
  }

  const testDbUrl = `postgresql://postgres:${password}@127.0.0.1:${pgPort}/postgres?schema=public`;
  console.log(`[Harness DB] Esperando readiness de PostgreSQL (${maskUrl(testDbUrl)})...`);
  await waitForPostgres(testDbUrl, 25000);
  console.log('[Harness DB] PostgreSQL efímero listo.');

  return {
    testDbUrl,
    dbName: 'postgres',
    adminUrl: testDbUrl,
    isDocker: true,
    containerName
  };
}

/**
 * Despliega las migraciones canónicas reparadas mediante prisma migrate deploy (nunca db push).
 */
export async function applyMigrations(testDbUrl) {
  console.log('[Harness Migrations] Aplicando migraciones canónicas con prisma migrate deploy...');
  const output = await runCommandAsync('./node_modules/.bin/prisma migrate deploy', { DATABASE_URL: testDbUrl });
  console.log('[Harness Migrations] Migraciones aplicadas exitosamente.');
  return output;
}

/**
 * Ejecuta el seed explícito de demostración/laboratorio.
 */
export async function applySeed(testDbUrl) {
  console.log('[Harness Seed] Sembrando datos de laboratorio (prisma/seed.js)...');
  const output = await runCommandAsync('node prisma/seed.js', { DATABASE_URL: testDbUrl });
  console.log('[Harness Seed] Seed completado.');
  return output;
}

/**
 * Espera a que la API responda en /health
 */
async function waitForApiReady(healthUrl, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(healthUrl);
      if (res.ok) {
        const body = await res.json();
        if (body.status === 'ok') {
          return true;
        }
      }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error(`Timeout agotado (${timeoutMs}ms) esperando arranque de la API en ${healthUrl}`);
}

/**
 * Inicia el proceso de la API Express en un puerto efímero libre.
 */
export async function startApiServer(testDbUrl) {
  const apiPort = await getAvailablePort();
  const testJwtSecret = `test_jwt_secret_${crypto.randomBytes(16).toString('hex')}`;

  console.log(`[Harness API] Arrancando proceso de API Express en puerto ${apiPort}...`);
  const serverProcess = spawn('node', ['src/index.js'], {
    cwd: backendRoot,
    env: {
      ...process.env,
      PORT: String(apiPort),
      DATABASE_URL: testDbUrl,
      JWT_SECRET: testJwtSecret
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stderrLogs = '';
  serverProcess.stderr.on('data', d => { stderrLogs += d; });

  const healthUrl = `http://127.0.0.1:${apiPort}/health`;
  const apiBaseUrl = `http://127.0.0.1:${apiPort}/api`;

  try {
    await waitForApiReady(healthUrl, 15000);
    console.log(`[Harness API] API lista y respondiendo en ${healthUrl}`);
  } catch (err) {
    serverProcess.kill('SIGKILL');
    throw new Error(`Fallo al iniciar API: ${err.message}\nLogs stderr: ${stderrLogs}`);
  }

  return {
    apiPort,
    apiBaseUrl,
    healthUrl,
    jwtSecret: testJwtSecret,
    serverProcess
  };
}

/**
 * Detiene el servidor API de forma controlada.
 */
export async function stopApiServer(serverProcess) {
  if (!serverProcess || serverProcess.killed || serverProcess.exitCode !== null) return;
  console.log('[Harness API] Deteniendo proceso del servidor API...');
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      try { serverProcess.kill('SIGKILL'); } catch (_) {}
      resolve();
    }, 3000);

    serverProcess.on('exit', () => {
      clearTimeout(timer);
      resolve();
    });

    serverProcess.kill('SIGTERM');
  });
}

/**
 * Limpieza estricta de todos los recursos efímeros creados:
 * - Mata el proceso API
 * - Elimina el contenedor Docker efímero o la base de datos creada en el servidor de pruebas
 */
export async function teardownTestEnvironment(env) {
  if (!env) return;
  console.log('\n[Harness Teardown] Limpiando recursos efímeros...');

  if (env.apiServer && env.apiServer.serverProcess) {
    await stopApiServer(env.apiServer.serverProcess);
  }

  if (env.db) {
    if (env.db.isDocker && env.db.containerName) {
      try {
        console.log(`  - Eliminando contenedor Docker efímero: ${env.db.containerName}`);
        execSync(`docker rm -f ${env.db.containerName}`, { stdio: 'ignore' });
      } catch (err) {
        console.error(`  ❌ Error eliminando contenedor ${env.db.containerName}: ${err.message}`);
      }
    } else if (!env.db.isDocker && env.db.dbName && env.db.adminUrl) {
      try {
        console.log(`  - Eliminando base de datos de prueba aislada: ${env.db.dbName}`);
        await executeAdminQuery(env.db.adminUrl, `DROP DATABASE IF EXISTS ${env.db.dbName} WITH (FORCE);`);
      } catch (err) {
        console.error(`  ❌ Error eliminando base de datos ${env.db.dbName}: ${err.message}`);
      }
    }
  }
  console.log('[Harness Teardown] Limpieza completada.');
}
