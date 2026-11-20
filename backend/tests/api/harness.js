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

/**
 * Registro de recursos compartidos activos para asegurar que teardown
 * siempre conozca los recursos adquiridos inmediatamente antes de esperas.
 */
export const activeResources = {
  containerIds: new Set(),
  databaseNames: new Set(),
  adminUrl: null,
  apiServerProcess: null,
  activeChildProcesses: new Set(),
  isShuttingDown: false,
  shutdownSignal: null
};

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
    execSync('docker info', { stdio: 'ignore', timeout: 10000 });
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
  const client = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 3000 });
  await client.connect();
  try {
    return await client.query(sql);
  } finally {
    await client.end();
  }
}

/**
 * Ejecuta comandos hijos en su propio process group (detached: true)
 * para garantizar que matar el proceso mate también procesos nietos (sh, node, prisma query-engine).
 */
export function runCommandAsync(command, envOverrides = {}) {
  if (activeResources.isShuttingDown) {
    return Promise.reject(new Error(`Comando abortado por apagado (${activeResources.shutdownSignal})`));
  }
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', command], {
      cwd: backendRoot,
      env: { ...process.env, ...envOverrides },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    activeResources.activeChildProcesses.add(child);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });

    child.on('error', (err) => {
      activeResources.activeChildProcesses.delete(child);
      reject(err);
    });

    child.on('close', (code, signal) => {
      activeResources.activeChildProcesses.delete(child);
      if (activeResources.isShuttingDown) {
        reject(new Error(`Comando cancelado por señal ${activeResources.shutdownSignal || signal}`));
        return;
      }
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
 * Mata todos los procesos hijos activos y sus árboles (process groups) mediante señal.
 */
export function killAllChildProcesses(signal = 'SIGTERM') {
  for (const child of activeResources.activeChildProcesses) {
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      try {
        process.kill(-child.pid, signal);
      } catch (e) {
        if (e.code !== 'ESRCH') {
          try { child.kill(signal); } catch (_) {}
        }
      }
    }
  }
  if (activeResources.apiServerProcess) {
    const p = activeResources.apiServerProcess;
    if (p.pid && p.exitCode === null && p.signalCode === null) {
      try {
        process.kill(-p.pid, signal);
      } catch (e) {
        if (e.code !== 'ESRCH') {
          try { p.kill(signal); } catch (_) {}
        }
      }
    }
  }
}

/**
 * Espera con timeout acotado y comprobación de cancelación a que PostgreSQL acepte conexiones.
 */
async function waitForPostgres(connectionString, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (activeResources.isShuttingDown) {
      throw new Error(`Espera de PostgreSQL cancelada por señal (${activeResources.shutdownSignal})`);
    }
    let client;
    try {
      client = new Client({ connectionString, connectionTimeoutMillis: 1500 });
      await client.connect();
      await client.query('SELECT 1;');
      await client.end();
      return true;
    } catch (_) {
      if (client) {
        try { await client.end(); } catch (_) {}
      }
      await new Promise(r => setTimeout(r, 200));
    }
  }
  throw new Error(`Timeout de espera agotado (${timeoutMs}ms) conectando a PostgreSQL en ${maskUrl(connectionString)}`);
}

/**
 * Prepara el entorno de base de datos aislada registrando inmediatamente la propiedad de cada recurso:
 * - Si existe TEST_DATABASE_URL: registra y crea base efímera única.
 * - Si no existe TEST_DATABASE_URL: arranca contenedor efímero postgres:16-alpine registrando su containerId de inmediato antes de esperar readiness.
 * - Si no hay Docker ni TEST_DATABASE_URL: falla legible sin tocar DATABASE_URL.
 */
export async function setupTestDatabase() {
  if (activeResources.isShuttingDown) {
    throw new Error(`Configuración de base de datos abortada por señal (${activeResources.shutdownSignal})`);
  }

  const rawTestUrl = process.env.TEST_DATABASE_URL;

  if (rawTestUrl && typeof rawTestUrl === 'string' && rawTestUrl.trim()) {
    const baseTestUrl = rawTestUrl.trim();
    console.log(`[Harness DB] Usando servidor de pruebas indicado por TEST_DATABASE_URL: ${maskUrl(baseTestUrl)}`);
    const adminUrl = getAdminUrl(baseTestUrl);
    activeResources.adminUrl = adminUrl;

    await waitForPostgres(adminUrl, 10000);

    const runId = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
    const dbName = `uf_test_api_${runId}`;

    // REGISTRO INMEDIATO ANTES DE LA OPERACIÓN DE CREACIÓN
    activeResources.databaseNames.add(dbName);
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
      containerId: null
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
  let containerId;
  try {
    const runOutput = execSync(
      `docker run --detach --name ${containerName} --publish 127.0.0.1:${pgPort}:5432 -e POSTGRES_PASSWORD=${password} postgres:16-alpine`,
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    containerId = runOutput.trim();
  } catch (dockerErr) {
    throw new Error(`Fallo al iniciar contenedor Docker efímero: ${dockerErr.message}`);
  }

  // REGISTRO INMEDIATO DE PROPIEDAD DEL CONTENEDOR POR ID ANTES DE READINESS
  activeResources.containerIds.add(containerId);

  const testDbUrl = `postgresql://postgres:${password}@127.0.0.1:${pgPort}/postgres?schema=public`;
  console.log(`[Harness DB] Esperando readiness de PostgreSQL (${maskUrl(testDbUrl)})...`);
  await waitForPostgres(testDbUrl, 25000);
  console.log('[Harness DB] PostgreSQL efímero listo.');

  return {
    testDbUrl,
    dbName: 'postgres',
    adminUrl: testDbUrl,
    isDocker: true,
    containerId
  };
}

/**
 * B1: Garantiza que Prisma Client esté generado en el entorno de laboratorio
 * con DATABASE_URL explícita de test, para soportar un arranque limpio tras npm ci.
 */
export async function ensurePrismaClient(testDbUrl) {
  if (activeResources.isShuttingDown) {
    throw new Error(`Generación de cliente Prisma abortada por señal (${activeResources.shutdownSignal})`);
  }
  console.log('[Harness Prisma] Verificando / generando Prisma Client en entorno de prueba...');
  const output = await runCommandAsync('./node_modules/.bin/prisma generate', { DATABASE_URL: testDbUrl });
  return output;
}

/**
 * Despliega las migraciones canónicas reparadas mediante prisma migrate deploy (nunca db push).
 */
export async function applyMigrations(testDbUrl) {
  if (activeResources.isShuttingDown) {
    throw new Error(`Migración abortada por señal (${activeResources.shutdownSignal})`);
  }
  console.log('[Harness Migrations] Aplicando migraciones canónicas con prisma migrate deploy...');
  const output = await runCommandAsync('./node_modules/.bin/prisma migrate deploy', { DATABASE_URL: testDbUrl });
  console.log('[Harness Migrations] Migraciones aplicadas exitosamente.');
  return output;
}

/**
 * Ejecuta el seed explícito de demostración/laboratorio.
 */
export async function applySeed(testDbUrl) {
  if (activeResources.isShuttingDown) {
    throw new Error(`Seed abortado por señal (${activeResources.shutdownSignal})`);
  }
  console.log('[Harness Seed] Sembrando datos de laboratorio (prisma/seed.js)...');
  const output = await runCommandAsync('node prisma/seed.js', { DATABASE_URL: testDbUrl });
  console.log('[Harness Seed] Seed completado.');
  return output;
}

/**
 * B6: Espera a que la API responda en /health con timeout por petición acotado (AbortSignal).
 */
async function waitForApiReady(healthUrl, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (activeResources.isShuttingDown) {
      throw new Error(`Espera de API cancelada por señal (${activeResources.shutdownSignal})`);
    }
    try {
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) });
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
 * B2: Registra inmediatamente el proceso hijo antes de await readiness y captura errores prematuros.
 */
export async function startApiServer(testDbUrl) {
  if (activeResources.isShuttingDown) {
    throw new Error(`Arranque de API abortado por señal (${activeResources.shutdownSignal})`);
  }

  const apiPort = await getAvailablePort();
  const testJwtSecret = `test_jwt_secret_${crypto.randomBytes(16).toString('hex')}`;

  console.log(`[Harness API] Arrancando proceso de API Express en puerto ${apiPort}...`);
  const serverProcess = spawn('node', ['src/index.js'], {
    cwd: backendRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(apiPort),
      DATABASE_URL: testDbUrl,
      JWT_SECRET: testJwtSecret,
      JWT_EXPIRES_IN: '7d',
      CORS_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173'
    },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  // REGISTRO INMEDIATO ANTES DE AWAIT READINESS
  activeResources.apiServerProcess = serverProcess;

  let stderrLogs = '';
  serverProcess.stderr.on('data', d => { stderrLogs += d; });

  let exitReject = null;
  const exitPromise = new Promise((_, reject) => {
    exitReject = reject;
  });

  serverProcess.on('error', err => {
    if (exitReject) exitReject(err);
  });
  serverProcess.on('exit', (code, signal) => {
    if (exitReject) {
      exitReject(new Error(`API server exited prematurely with code ${code}, signal ${signal}`));
    }
  });

  const healthUrl = `http://127.0.0.1:${apiPort}/health`;
  const apiBaseUrl = `http://127.0.0.1:${apiPort}/api`;

  try {
    await Promise.race([
      waitForApiReady(healthUrl, 15000),
      exitPromise
    ]);
    console.log(`[Harness API] API lista y respondiendo en ${healthUrl}`);
  } catch (err) {
    await stopApiServer(serverProcess);
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
 * B4: Detiene el servidor API asegurando que el proceso sea cosechado (reaped)
 * con timeout escalonado (SIGTERM -> SIGKILL) y mata todo el process group.
 */
export async function stopApiServer(serverProcess, timeoutMs = 4000) {
  if (!serverProcess) return;
  if (serverProcess.exitCode !== null || serverProcess.signalCode !== null) {
    activeResources.apiServerProcess = null;
    return;
  }

  const pid = serverProcess.pid;
  console.log(`[Harness API] Deteniendo proceso API (PGID/PID ${pid})...`);

  return new Promise((resolve, reject) => {
    let finished = false;

    const cleanupAndResolve = () => {
      if (!finished) {
        finished = true;
        activeResources.apiServerProcess = null;
        resolve();
      }
    };

    serverProcess.once('exit', cleanupAndResolve);
    serverProcess.once('close', cleanupAndResolve);

    // Enviar SIGTERM al process group
    try {
      process.kill(-pid, 'SIGTERM');
    } catch (e) {
      if (e.code === 'ESRCH') {
        cleanupAndResolve();
        return;
      }
      try { serverProcess.kill('SIGTERM'); } catch (_) {}
    }

    const killTimer = setTimeout(() => {
      if (finished) return;
      console.log(`[Harness API] Escalando a SIGKILL para PGID/PID ${pid}...`);
      try {
        process.kill(-pid, 'SIGKILL');
      } catch (e) {
        if (e.code === 'ESRCH') {
          cleanupAndResolve();
          return;
        }
        try { serverProcess.kill('SIGKILL'); } catch (_) {}
      }
    }, Math.floor(timeoutMs / 2));

    const timeoutTimer = setTimeout(() => {
      if (finished) return;
      finished = true;
      clearTimeout(killTimer);
      try {
        process.kill(pid, 0);
        reject(new Error(`API process ${pid} no pudo ser detenido tras ${timeoutMs}ms`));
      } catch (_) {
        activeResources.apiServerProcess = null;
        resolve();
      }
    }, timeoutMs);

    serverProcess.once('exit', () => {
      clearTimeout(killTimer);
      clearTimeout(timeoutTimer);
    });
  });
}

/**
 * B4: Limpieza estricta de todos los recursos efímeros creados:
 * Acumula todos los errores y lanza excepción si la limpieza no se completó íntegramente.
 */
export async function teardownTestEnvironment() {
  const cleanupErrors = [];
  console.log('\n[Harness Teardown] Limpiando recursos efímeros registrados...');

  // 1. Detener API
  if (activeResources.apiServerProcess) {
    try {
      await stopApiServer(activeResources.apiServerProcess);
    } catch (err) {
      console.error(`  ❌ Error deteniendo servidor API: ${err.message}`);
      cleanupErrors.push(err);
    }
  }

  // 2. Eliminar contenedores Docker propios registrados
  for (const containerId of Array.from(activeResources.containerIds)) {
    try {
      console.log(`  - Eliminando contenedor Docker efímero propio: ${containerId}`);
      execSync(`docker rm -f ${containerId}`, { stdio: 'ignore', timeout: 5000 });
      activeResources.containerIds.delete(containerId);
    } catch (err) {
      console.error(`  ❌ Error eliminando contenedor Docker ${containerId}: ${err.message}`);
      cleanupErrors.push(err);
    }
  }

  // 3. Eliminar bases de datos aisladas propias registradas
  if (activeResources.adminUrl) {
    for (const dbName of Array.from(activeResources.databaseNames)) {
      try {
        console.log(`  - Eliminando base de datos de prueba aislada: ${dbName}`);
        await executeAdminQuery(activeResources.adminUrl, `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`);
        activeResources.databaseNames.delete(dbName);
      } catch (err) {
        console.error(`  ❌ Error eliminando base de datos ${dbName}: ${err.message}`);
        cleanupErrors.push(err);
      }
    }
  }

  if (cleanupErrors.length > 0) {
    const errorMsg = `Fallos durante la limpieza de recursos: ${cleanupErrors.map(e => e.message).join('; ')}`;
    console.error(`\n❌ [Harness Teardown] ${errorMsg}`);
    const err = new Error(errorMsg);
    err.cleanupErrors = cleanupErrors;
    throw err;
  }

  console.log('[Harness Teardown] Limpieza completada sin recursos huérfanos.');
}
