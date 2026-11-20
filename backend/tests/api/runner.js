import { spawn } from 'node:child_process';
import path from 'node:path';
import {
  setupTestDatabase,
  ensurePrismaClient,
  applyMigrations,
  applySeed,
  startApiServer,
  teardownTestEnvironment,
  killAllChildProcesses,
  activeResources,
  backendRoot
} from './harness.js';

let teardownPromise = null;

async function performUnifiedTeardown() {
  if (teardownPromise) return teardownPromise;
  teardownPromise = (async () => {
    try {
      await teardownTestEnvironment();
    } catch (cleanupErr) {
      return cleanupErr;
    }
    return null;
  })();
  return teardownPromise;
}

function handleSignal(sig) {
  if (activeResources.isShuttingDown) return;
  activeResources.isShuttingDown = true;
  activeResources.shutdownSignal = sig;
  console.log(`\n[Runner ${sig}] Señal de interrupción recibida. Cancelando operaciones en curso y procediendo a teardown unificado...`);
  // Notificar a todos los procesos hijos activos para desbloquear awaits de inmediato
  killAllChildProcesses(sig);
}

process.on('SIGINT', () => { handleSignal('SIGINT'); });
process.on('SIGTERM', () => { handleSignal('SIGTERM'); });

async function runTests(apiBaseUrl, healthUrl, testDbUrl, jwtSecret) {
  if (activeResources.isShuttingDown) {
    throw new Error(`Ejecución de tests abortada por señal (${activeResources.shutdownSignal})`);
  }

  const testArgs = process.argv.slice(2);
  const targetFiles = testArgs.length > 0 ? testArgs : ['tests/api/api.test.js', 'tests/api/concurrency.test.js'];
  console.log(`\n[Runner Tests] Iniciando ejecución de tests de integración (${targetFiles.join(', ')}) con node:test...\n`);

  return new Promise((resolve) => {
    const child = spawn('node', ['--test', ...targetFiles], {
      cwd: backendRoot,
      env: {
        ...process.env,
        API_BASE_URL: apiBaseUrl,
        HEALTH_URL: healthUrl,
        DATABASE_URL: testDbUrl,
        JWT_SECRET: jwtSecret,
        NODE_ENV: 'test',
        JWT_EXPIRES_IN: '7d',
        CORS_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173'
      },
      detached: true,
      stdio: 'inherit'
    });

    activeResources.activeChildProcesses.add(child);

    child.on('close', (code, signal) => {
      activeResources.activeChildProcesses.delete(child);
      if (activeResources.isShuttingDown) {
        resolve(activeResources.shutdownSignal === 'SIGINT' ? 130 : 143);
        return;
      }
      resolve(code ?? 1);
    });

    child.on('error', (err) => {
      console.error('[Runner Tests] Error ejecutando tests:', err);
      activeResources.activeChildProcesses.delete(child);
      resolve(1);
    });
  });
}

function checkNotAborted() {
  if (activeResources.isShuttingDown) {
    throw new Error(`Operación abortada por señal (${activeResources.shutdownSignal})`);
  }
}

async function main() {
  console.log('================================================================');
  console.log('UrbanFix Backend - Runner de Integración de API (BE-02)');
  console.log('================================================================\n');

  let testExitCode = 1;
  let executionError = null;

  try {
    // 1. Configuración de Base de Datos aislada (Docker efímero o TEST_DATABASE_URL)
    // Se registra inmediatamente la propiedad de cada recurso adquirido
    const db = await setupTestDatabase();
    checkNotAborted();

    // B1: Generar Prisma Client en el entorno de laboratorio (soporta arranque limpio tras npm ci)
    await ensurePrismaClient(db.testDbUrl);
    checkNotAborted();

    // 2. Aplicar migraciones canónicas reparadas (NUNCA db push)
    await applyMigrations(db.testDbUrl);
    checkNotAborted();

    // 3. Sembrar datos explícitos de demostración/laboratorio
    await applySeed(db.testDbUrl);
    checkNotAborted();

    // 4. Iniciar API Express en puerto efímero con secreto JWT propio
    const apiServer = await startApiServer(db.testDbUrl);
    checkNotAborted();

    // 5. Ejecutar la suite HTTP con node:test y fetch nativos
    testExitCode = await runTests(apiServer.apiBaseUrl, apiServer.healthUrl, db.testDbUrl, apiServer.jwtSecret);

    if (testExitCode === 0) {
      console.log('\n✔ TODOS LOS TESTS DE INTEGRACIÓN PASARON EXITOSAMENTE.');
    } else {
      console.error(`\n❌ LA SUITE DE INTEGRACIÓN REPORTÓ FALLOS (Exit code: ${testExitCode}).`);
    }
  } catch (err) {
    executionError = err;
    if (!activeResources.isShuttingDown) {
      console.error('\n❌ ERROR EN EL ARRANQUE DEL RUNNER DE PRUEBAS:');
      console.error(err.message || err);
    }
    testExitCode = 1;
  } finally {
    // Teardown unificado que garantiza drenar todos los recursos activos
    const cleanupError = await performUnifiedTeardown();

    // Si se recibió señal SIGINT/SIGTERM, salir con código estándar
    if (activeResources.shutdownSignal) {
      const code = activeResources.shutdownSignal === 'SIGINT' ? 130 : 143;
      console.log(`[Runner] Saliendo con código ${code} por interrupción ${activeResources.shutdownSignal}.`);
      process.exit(code);
    }

    // B4: Si la limpieza tuvo fallos, la salida DEBE ser no-cero
    if (cleanupError) {
      console.error('\n❌ ERROR: Ocurrieron fallos durante la limpieza de recursos:', cleanupError.message);
      process.exit(1);
    }
  }

  process.exit(testExitCode);
}

main().catch(async (fatal) => {
  console.error('\n❌ ERROR FATAL INESPERADO:');
  console.error(fatal);
  await performUnifiedTeardown();
  process.exit(1);
});
