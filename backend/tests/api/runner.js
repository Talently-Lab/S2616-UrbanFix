import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  setupTestDatabase,
  applyMigrations,
  applySeed,
  startApiServer,
  teardownTestEnvironment,
  backendRoot,
  maskUrl
} from './harness.js';

let env = null;
let testChildProcess = null;
let isShuttingDown = false;
let teardownPromise = null;

async function performTeardown() {
  if (teardownPromise) return teardownPromise;
  teardownPromise = (async () => {
    isShuttingDown = true;
    if (testChildProcess && !testChildProcess.killed) {
      try { testChildProcess.kill('SIGTERM'); } catch (_) {}
    }
    if (env) {
      await teardownTestEnvironment(env);
      env = null;
    }
  })();
  return teardownPromise;
}

async function handleSignal(sig) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[Runner ${sig}] Interrupción recibida. Cancelando ejecución y limpiando recursos...`);
  await performTeardown();
  process.exit(sig === 'SIGINT' ? 130 : 143);
}

process.on('SIGINT', () => { handleSignal('SIGINT'); });
process.on('SIGTERM', () => { handleSignal('SIGTERM'); });

async function runTests(apiBaseUrl, healthUrl, testDbUrl, jwtSecret) {
  const testArgs = process.argv.slice(2);
  const targetFiles = testArgs.length > 0 ? testArgs : ['tests/api/api.test.js'];
  console.log(`\n[Runner Tests] Iniciando ejecución de tests de integración (${targetFiles.join(', ')}) con node:test...\n`);
  return new Promise((resolve) => {
    const child = spawn('node', ['--test', ...targetFiles], {
      cwd: backendRoot,
      env: {
        ...process.env,
        API_BASE_URL: apiBaseUrl,
        HEALTH_URL: healthUrl,
        DATABASE_URL: testDbUrl,
        JWT_SECRET: jwtSecret
      },
      stdio: 'inherit'
    });
    testChildProcess = child;

    child.on('close', (code) => {
      testChildProcess = null;
      resolve(code ?? 1);
    });
    child.on('error', (err) => {
      console.error('[Runner Tests] Error ejecutando tests:', err);
      testChildProcess = null;
      resolve(1);
    });
  });
}

async function main() {
  console.log('================================================================');
  console.log('UrbanFix Backend - Runner de Integración de API (BE-02)');
  console.log('================================================================\n');

  let testExitCode = 1;

  try {
    // 1. Configuración de Base de Datos aislada (Docker efímero o TEST_DATABASE_URL)
    const db = await setupTestDatabase();
    env = { db, apiServer: null };

    // 2. Aplicar migraciones canónicas reparadas (NUNCA db push)
    await applyMigrations(db.testDbUrl);

    // 3. Sembrar datos explícitos de demostración/laboratorio
    await applySeed(db.testDbUrl);

    // 4. Iniciar API Express en puerto efímero con secreto JWT propio
    const apiServer = await startApiServer(db.testDbUrl);
    env.apiServer = apiServer;

    // 5. Ejecutar la suite HTTP con node:test y fetch nativos
    testExitCode = await runTests(apiServer.apiBaseUrl, apiServer.healthUrl, db.testDbUrl, apiServer.jwtSecret);

    if (testExitCode === 0) {
      console.log('\n✔ TODOS LOS TESTS DE INTEGRACIÓN PASARON EXITOSAMENTE.');
    } else {
      console.error(`\n❌ LA SUITE DE INTEGRACIÓN REPORTÓ FALLOS (Exit code: ${testExitCode}).`);
    }
  } catch (err) {
    console.error('\n❌ ERROR EN EL ARRANQUE DEL RUNNER DE PRUEBAS:');
    console.error(err.message || err);
    testExitCode = 1;
  } finally {
    await performTeardown();
  }

  process.exit(testExitCode);
}

main().catch(async (fatal) => {
  console.error('\n❌ ERROR FATAL INESPERADO:');
  console.error(fatal);
  await performTeardown();
  process.exit(1);
});
