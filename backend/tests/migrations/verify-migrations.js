import pg from 'pg';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {
  inspectDatabaseState,
  CANONICAL_MIGRATIONS,
  computeMigrationChecksum,
  diffAgainstSnapshot
} from './migration-precheck.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '../..');

const { Client } = pg;

// 1. REGLA OBLIGATORIA: Exigir TEST_DATABASE_URL explícita sin fallback a DATABASE_URL.
const rawTestUrl = process.env.TEST_DATABASE_URL;
if (!rawTestUrl || typeof rawTestUrl !== 'string' || !rawTestUrl.trim()) {
  console.error('\n❌ ERROR DE CONFIGURACIÓN DE SEGURIDAD:');
  console.error('La variable de entorno TEST_DATABASE_URL debe estar explícitamente configurada.');
  console.error('Ejemplo de laboratorio: TEST_DATABASE_URL="postgresql://postgres:testpass@localhost:55432/postgres"');
  console.error('Por reglas de seguridad y AGENTS.md, NO se permite fallback a DATABASE_URL para evitar tocar bases compartidas.\n');
  process.exit(1);
}

const BASE_DATABASE_URL = rawTestUrl.trim();

function maskUrl(dbUrl) {
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

function getAdminUrl(dbUrl) {
  const parsed = new URL(dbUrl);
  parsed.pathname = '/postgres';
  return parsed.toString();
}

function getDatabaseUrl(dbUrl, dbName) {
  const parsed = new URL(dbUrl);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

// Registro estricto de bases creadas por este runner para limpieza
const createdDatabases = new Set();
let sentinelDbName = null;
let cleanupHasFailures = false;
let isShuttingDown = false;
let terminationSignal = null;
let activeChild = null;
let cleanupPromise = null;

async function executeAdminQuery(sql) {
  const client = new Client({ connectionString: getAdminUrl(BASE_DATABASE_URL) });
  await client.connect();
  try {
    return await client.query(sql);
  } finally {
    await client.end();
  }
}

async function cleanupCreatedDatabases() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    isShuttingDown = true;
    if (createdDatabases.size === 0 && !sentinelDbName) return;
    console.log('\n[Limpieza unificada] Eliminando exclusivamente bases de prueba creadas durante esta ejecución...');
    for (const dbName of Array.from(createdDatabases)) {
      try {
        await executeAdminQuery(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`);
        console.log(`  - Eliminada: ${dbName}`);
        createdDatabases.delete(dbName);
      } catch (dropErr) {
        console.error(`  ❌ Error al eliminar base de prueba ${dbName}: ${dropErr.message}`);
        cleanupHasFailures = true;
      }
    }
    if (sentinelDbName) {
      try {
        await executeAdminQuery(`DROP DATABASE IF EXISTS ${sentinelDbName} WITH (FORCE);`);
        console.log(`  - Sentinel propio purgado: ${sentinelDbName}`);
        sentinelDbName = null;
      } catch (dropErr) {
        console.error(`  ❌ Error al purgar sentinel ${sentinelDbName}: ${dropErr.message}`);
        cleanupHasFailures = true;
      }
    }
  })();
  return cleanupPromise;
}

// Manejadores de terminación unificados para resolver M1 (carrera SIGINT/SIGTERM)
async function onSignal(sig) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  terminationSignal = sig;
  console.log(`\n[${sig} recibido] Cancelando ejecución y limpiando recursos propios inmediatamente...`);
  if (activeChild && activeChild.pid) {
    try {
      process.kill(-activeChild.pid, sig);
    } catch (e) {
      if (e.code !== 'ESRCH') {
        try { activeChild.kill(sig); } catch (_) {}
      }
    }
  }
  await cleanupCreatedDatabases();
  process.exit(sig === 'SIGINT' ? 130 : 143);
}

process.on('SIGINT', () => { onSignal('SIGINT'); });
process.on('SIGTERM', () => { onSignal('SIGTERM'); });

/**
 * Crea una base de datos con nombre impredecible sin borrar previamente bases ajenas.
 * Registra el nombre anticipadamente para que ante interrupción durante CREATE DATABASE
 * el teardown ejecute DROP DATABASE IF EXISTS y no queden bases huérfanas en vuelo.
 */
async function createIsolatedTestDatabase(label) {
  if (isShuttingDown) {
    throw new Error(`Operación abortada por señal de interrupción (${terminationSignal}). No se crearán nuevas bases.`);
  }
  const runId = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  const dbName = `uf_${label}_${runId}`;
  
  // Registro anticipado para cubrir ventana de operación en vuelo
  createdDatabases.add(dbName);
  try {
    await executeAdminQuery(`CREATE DATABASE ${dbName};`);
  } catch (err) {
    if (!isShuttingDown) {
      try { await executeAdminQuery(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`); } catch (_) {}
      createdDatabases.delete(dbName);
    }
    throw err;
  }

  return {
    dbName,
    url: getDatabaseUrl(BASE_DATABASE_URL, dbName)
  };
}

function runCommand(command, envOverrides = {}) {
  if (isShuttingDown) {
    return Promise.reject(new Error(`Comando abortado por señal de interrupción (${terminationSignal})`));
  }
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', command], {
      cwd: backendRoot,
      env: { ...process.env, ...envOverrides },
      detached: true, // Process group para terminar árboles de procesos completos
      stdio: ['ignore', 'pipe', 'pipe']
    });
    activeChild = child;
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('error', err => {
      if (activeChild === child) activeChild = null;
      reject(err);
    });
    child.on('close', (code, signal) => {
      if (activeChild === child) activeChild = null;
      if (isShuttingDown) {
        reject(new Error(`Comando cancelado por señal ${terminationSignal || signal}`));
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

function runPrismaMigrateDeploy(dbUrl) {
  return runCommand('./node_modules/.bin/prisma migrate deploy', { DATABASE_URL: dbUrl });
}

function runPrismaMigrateDiff(dbUrl) {
  return runCommand('./node_modules/.bin/prisma migrate diff --from-schema prisma/schema.prisma --to-config-datasource --exit-code', { DATABASE_URL: dbUrl });
}

function runPrismaResolve(dbUrl, migrationName) {
  return runCommand(`./node_modules/.bin/prisma migrate resolve --applied ${migrationName}`, { DATABASE_URL: dbUrl });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function main() {
  console.log('================================================================');
  console.log('UrbanFix Backend - Suite de Verificación BE-01 (Matriz F0-F10 + Resiliencia)');
  console.log('Servidor PostgreSQL objetivo (enmascarado):', maskUrl(BASE_DATABASE_URL));
  console.log('Aviso: Requiere privilegio CREATEDB en el servidor de pruebas.');
  console.log('================================================================\n');

  // Asegurar cliente generado
  await runCommand('./node_modules/.bin/prisma generate');

  // Crear base sentinel para verificar que el runner no toca bases preexistentes ajenas
  sentinelDbName = `uf_sentinel_must_survive_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
  await executeAdminQuery(`CREATE DATABASE ${sentinelDbName};`);
  console.log(`Sentinel ajeno creado para test de no-destrucción: ${sentinelDbName}\n`);

  try {
    // -----------------------------------------------------------------
    // F0: Instalación vacía
    // Deploy repetido, diff cero, seed idempotente y login 3 roles
    // -----------------------------------------------------------------
    console.log('--- [F0] Instalación vacía (Defecto D2 resuelto) ---');
    const { dbName: dbF0, url: urlF0 } = await createIsolatedTestDatabase('f0_empty');
    console.log(`Creada base aislada: ${dbF0}`);

    console.log('F0.1. Pre-check: estado inicial debe ser CLEAN_DATABASE...');
    const precheck0 = await inspectDatabaseState(urlF0);
    assert(precheck0.status === 'CLEAN_DATABASE', 'Estado inicial debe ser CLEAN_DATABASE');
    assert(precheck0.supported === true, 'CLEAN_DATABASE debe ser supported=true');

    console.log('F0.2. Primer migrate deploy...');
    const deploy1Output = await runPrismaMigrateDeploy(urlF0);
    assert(deploy1Output.includes('All migrations have been successfully applied'), 'Migraciones deben aplicarse');

    console.log('F0.3. Segundo migrate deploy (idempotencia)...');
    const deploy2Output = await runPrismaMigrateDeploy(urlF0);
    assert(deploy2Output.includes('No pending migrations to apply'), 'Segundo deploy debe ser idempotente');

    console.log('F0.4. Comprobación diff contra schema.prisma...');
    const diff0Output = await runPrismaMigrateDiff(urlF0);
    assert(diff0Output.trim() === '' || diff0Output.includes('No difference detected'), 'Diff debe ser cero');

    console.log('F0.5. Ejecutar seed por primera vez...');
    await runCommand('node prisma/seed.js', { DATABASE_URL: urlF0 });

    console.log('F0.6. Ejecutar seed por segunda vez (idempotencia)...');
    await runCommand('node prisma/seed.js', { DATABASE_URL: urlF0 });

    // Comprobar conteos en DB tras doble seed
    const client0 = new Client({ connectionString: urlF0 });
    await client0.connect();
    try {
      const userCount = await client0.query('SELECT count(*)::int as count FROM "Usuario";');
      assert(userCount.rows[0].count === 3, `Esperados 3 usuarios tras doble seed, obtenidos: ${userCount.rows[0].count}`);
      const reqCount = await client0.query('SELECT count(*)::int as count FROM "SolicitudServicio";');
      assert(reqCount.rows[0].count === 1, `Esperada 1 solicitud tras doble seed, obtenidas: ${reqCount.rows[0].count}`);
    } finally {
      await client0.end();
    }

    console.log('F0.7. Validar autenticación/login de los 3 roles...');
    const loginCheckScript = `
      import('./src/services/auth.service.js').then(async ({ login }) => {
        const roles = [
          { email: 'juan@mail.com', rol: 'CLIENTE' },
          { email: 'carlos@mail.com', rol: 'TECNICO' },
          { email: 'admin@mail.com', rol: 'ADMIN' }
        ];
        for (const { email, rol } of roles) {
          const res = await login(email, 'MinimoOchoCaracteres');
          if (res.usuario.email !== email || res.usuario.rol !== rol || !res.usuario.lastLogin || !res.token) {
            throw new Error('Fallo validando login para ' + email);
          }
          console.log('Login OK:', res.usuario.email, res.usuario.rol, res.usuario.lastLogin);
        }
        process.exit(0);
      }).catch(err => {
        console.error(err);
        process.exit(1);
      });
    `;
    await runCommand(`node -e "${loginCheckScript.replace(/"/g, '\\"')}"`, { DATABASE_URL: urlF0 });
    console.log('✔ F0 superado exitosamente.\n');

    // -----------------------------------------------------------------
    // F1: Base canónica ya actualizada
    // Verificación de datos Y diff tras deploy no-op adicional
    // -----------------------------------------------------------------
    console.log('--- [F1] Base canónica ya actualizada (Idempotencia y preservación) ---');
    console.log('F1.1. Inspeccionar estado previo...');
    const precheck1 = await inspectDatabaseState(urlF0);
    assert(precheck1.status === 'CANONICAL_FULLY_UPDATED', 'Estado debe ser CANONICAL_FULLY_UPDATED');

    console.log('F1.2. Snapshot de datos antes del deploy repetido...');
    const client1 = new Client({ connectionString: urlF0 });
    await client1.connect();
    let usersBeforeF1, reqsBeforeF1;
    try {
      usersBeforeF1 = (await client1.query('SELECT id, email, rol, "lastLogin" FROM "Usuario" ORDER BY email')).rows;
      reqsBeforeF1 = (await client1.query('SELECT id, titulo, estado, categoria FROM "SolicitudServicio" ORDER BY id')).rows;
    } finally {
      await client1.end();
    }

    console.log('F1.3. Ejecutar migrate deploy en base ya actualizada...');
    const deployAgainOutput = await runPrismaMigrateDeploy(urlF0);
    assert(deployAgainOutput.includes('No pending migrations to apply'), 'No deben existir migraciones pendientes');

    console.log('F1.4. Comprobar que los datos siguen 100% idénticos...');
    const client1Post = new Client({ connectionString: urlF0 });
    await client1Post.connect();
    try {
      const usersAfterF1 = (await client1Post.query('SELECT id, email, rol, "lastLogin" FROM "Usuario" ORDER BY email')).rows;
      const reqsAfterF1 = (await client1Post.query('SELECT id, titulo, estado, categoria FROM "SolicitudServicio" ORDER BY id')).rows;
      assert(JSON.stringify(usersBeforeF1) === JSON.stringify(usersAfterF1), 'Usuarios mutaron tras deploy no-op');
      assert(JSON.stringify(reqsBeforeF1) === JSON.stringify(reqsAfterF1), 'Solicitudes mutaron tras deploy no-op');
    } finally {
      await client1Post.end();
    }

    const diff1Output = await runPrismaMigrateDiff(urlF0);
    assert(diff1Output.trim() === '' || diff1Output.includes('No difference detected'), 'Diff debe ser cero');
    console.log('✔ F1 superado exitosamente.\n');

    // -----------------------------------------------------------------
    // F2: Base canónica inicial con datos existentes (Defecto D3 resuelto)
    // Actualización conservadora con transacción, resolve oficial y snapshot
    // -----------------------------------------------------------------
    console.log('--- [F2] Actualización conservadora de base inicial con datos (Defecto D3 resuelto) ---');
    const { dbName: dbF2, url: urlF2 } = await createIsolatedTestDatabase('f2_canonical_upgrade');
    console.log(`Creada base aislada: ${dbF2}`);

    console.log('F2.1. Aplicar estado inicial de semana 3 (20261007000000_init)...');
    const initSqlPath = path.resolve(backendRoot, 'prisma/migrations/20261007000000_init/migration.sql');
    const initSql = fs.readFileSync(initSqlPath, 'utf-8');

    const client2 = new Client({ connectionString: urlF2 });
    await client2.connect();
    try {
      await client2.query(initSql);
    } finally {
      await client2.end();
    }

    // Registrar migración 1 mediante el comando oficial de Prisma (calcula checksum real sha256)
    console.log('F2.2. Registrar migración canónica 1 con prisma migrate resolve...');
    await runPrismaResolve(urlF2, '20261007000000_init');

    console.log('F2.3. Cargar fixture con datos representativos (usuarios, solicitudes, categorías enum, historial)...');
    const client2Fixture = new Client({ connectionString: urlF2 });
    await client2Fixture.connect();
    try {
      await client2Fixture.query(`
        INSERT INTO "Usuario" ("id", "email", "passwordHash", "nombre", "celular", "rol", "fechaCreacion", "fechaActualizacion")
        VALUES 
          ('11111111-0000-0000-0000-000000000001', 'cliente_fuga@mail.com', 'hash1', 'Pedro Cliente', '111111', 'CLIENTE', now(), now()),
          ('22222222-0000-0000-0000-000000000002', 'tecnico_gas@mail.com', 'hash2', 'Mario Gasista', '222222', 'TECNICO', now(), now());

        INSERT INTO "SolicitudServicio" ("id", "titulo", "descripcion", "categoria", "direccion", "estado", "clienteId", "tecnicoId", "fechaCreacion", "fechaActualizacion")
        VALUES
          ('aaaaaaaa-0000-0000-0000-000000000001', 'Fuga de gas en cocina', 'Olor fuerte a gas', 'GAS', 'Calle Falsa 123', 'PENDIENTE', '11111111-0000-0000-0000-000000000001', null, now(), now()),
          ('aaaaaaaa-0000-0000-0000-000000000002', 'Cambio griferia bano', 'Perdida constante', 'PLOMERIA', 'Calle Verdadera 456', 'ACEPTADA', '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', now(), now());

        INSERT INTO "HistorialEstadoSolicitud" ("id", "solicitudId", "estadoAnterior", "estadoNuevo", "cambiadoPorId", "motivo", "fechaCambio")
        VALUES
          ('hhhhhhhh-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', null, 'PENDIENTE', '11111111-0000-0000-0000-000000000001', 'Creacion', now()),
          ('hhhhhhhh-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'PENDIENTE', 'ACEPTADA', '22222222-0000-0000-0000-000000000002', 'Aceptado por Mario', now());
      `);
    } finally {
      await client2Fixture.end();
    }

    console.log('F2.4. Tomar snapshot completo antes de la migración...');
    const client2Snap = new Client({ connectionString: urlF2 });
    await client2Snap.connect();
    let snapUsersF2, snapReqsF2, snapHistF2;
    try {
      snapUsersF2 = (await client2Snap.query('SELECT id, email, nombre, celular, rol FROM "Usuario" ORDER BY id')).rows;
      snapReqsF2 = (await client2Snap.query('SELECT id, titulo, descripcion, categoria::text as cat, direccion, estado, "clienteId", "tecnicoId" FROM "SolicitudServicio" ORDER BY id')).rows;
      snapHistF2 = (await client2Snap.query('SELECT id, "solicitudId", "estadoAnterior", "estadoNuevo", "cambiadoPorId", motivo FROM "HistorialEstadoSolicitud" ORDER BY id')).rows;
    } finally {
      await client2Snap.end();
    }

    console.log('F2.5. Inspección previa con precheck: debe verificar CANONICAL_INITIAL_NEEDS_UPGRADE y diff 0 contra step1...');
    const precheck2 = await inspectDatabaseState(urlF2);
    assert(precheck2.status === 'CANONICAL_INITIAL_NEEDS_UPGRADE', 'Debe detectar necesidad de actualización conservadora');
    assert(precheck2.supported === true, 'CANONICAL_INITIAL_NEEDS_UPGRADE debe ser supported=true');

    console.log('F2.6. Ejecutar procedimiento conservador en transacción atómica BEGIN/COMMIT...');
    const client2Upgrade = new Client({ connectionString: urlF2 });
    await client2Upgrade.connect();
    try {
      await client2Upgrade.query(`
        BEGIN;
        ALTER TABLE "SolicitudServicio" ALTER COLUMN "categoria" TYPE TEXT USING "categoria"::text;
        ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "lastLogin" TIMESTAMP(3);
        COMMIT;
      `);
    } finally {
      await client2Upgrade.end();
    }

    console.log('F2.7. Comprobación COMPLETA de esquema del paso 2 antes de resolve (diff contra step2-add-last-login)...');
    const diffStep2 = diffAgainstSnapshot(urlF2, 'tests/migrations/schemas/step2-add-last-login.prisma');
    assert(diffStep2.inSync === true, `El esquema tras la transacción no coincide con step2: ${diffStep2.diff}`);

    console.log('F2.8. Snapshot intermedio: verificar que los datos están intactos tras la transacción antes de resolve...');
    const client2MidVerify = new Client({ connectionString: urlF2 });
    await client2MidVerify.connect();
    try {
      const midUsersF2 = (await client2MidVerify.query('SELECT id, email, nombre, celular, rol FROM "Usuario" ORDER BY id')).rows;
      const midReqsF2 = (await client2MidVerify.query('SELECT id, titulo, descripcion, categoria as cat, direccion, estado, "clienteId", "tecnicoId" FROM "SolicitudServicio" ORDER BY id')).rows;
      assert(JSON.stringify(snapUsersF2) === JSON.stringify(midUsersF2), 'Usuarios alterados durante la transacción ALTER');
      assert(JSON.stringify(snapReqsF2) === JSON.stringify(midReqsF2), 'Solicitudes o categorías alteradas durante la transacción ALTER');
    } finally {
      await client2MidVerify.end();
    }

    console.log('F2.9. Registrar 20261011212651_add_last_login_to_usuario con prisma migrate resolve...');
    await runPrismaResolve(urlF2, '20261011212651_add_last_login_to_usuario');

    console.log('F2.10. Aplicar migración subsiguiente (feat_rechazo_vuelve_a_pendiente) con migrate deploy...');
    const deployF2Output = await runPrismaMigrateDeploy(urlF2);
    assert(deployF2Output.includes('20261011230000_feat_rechazo_vuelve_a_pendiente'), 'Debe aplicar migración de rechazo');

    console.log('F2.11. Comprobar diff contra schema.prisma...');
    const diffF2Output = await runPrismaMigrateDiff(urlF2);
    assert(diffF2Output.trim() === '' || diffF2Output.includes('No difference detected'), 'Diff debe ser cero');

    console.log('F2.12. Comparar snapshot de datos completo posterior a la migración...');
    const client2Verify = new Client({ connectionString: urlF2 });
    await client2Verify.connect();
    try {
      const postUsersF2 = (await client2Verify.query('SELECT id, email, nombre, celular, rol FROM "Usuario" ORDER BY id')).rows;
      const postReqsF2 = (await client2Verify.query('SELECT id, titulo, descripcion, categoria as cat, direccion, estado, "clienteId", "tecnicoId" FROM "SolicitudServicio" ORDER BY id')).rows;
      const postHistF2 = (await client2Verify.query('SELECT id, "solicitudId", "estadoAnterior", "estadoNuevo", "cambiadoPorId", motivo FROM "HistorialEstadoSolicitud" ORDER BY id')).rows;

      assert(JSON.stringify(snapUsersF2) === JSON.stringify(postUsersF2), 'Datos de Usuario no coinciden exactamente con el snapshot');
      assert(JSON.stringify(snapReqsF2) === JSON.stringify(postReqsF2), 'Datos de SolicitudServicio (incluyendo categoria) no coinciden con el snapshot');
      assert(JSON.stringify(snapHistF2) === JSON.stringify(postHistF2), 'Datos de HistorialEstadoSolicitud no coinciden con el snapshot');

      // Comprobar que la nueva tabla RechazoSolicitud está disponible
      await client2Verify.query(`
        INSERT INTO "RechazoSolicitud" ("id", "solicitudId", "tecnicoId", "motivo", "fechaRechazo")
        VALUES ('rrrrrrrr-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'Fuera de radio de cobertura', now());
      `);
      const rechazoCount = await client2Verify.query('SELECT count(*)::int as count FROM "RechazoSolicitud"');
      assert(rechazoCount.rows[0].count === 1, 'RechazoSolicitud debe aceptar inserciones con FK válidas');
    } finally {
      await client2Verify.end();
    }
    console.log('✔ F2 superado exitosamente.\n');

    // -----------------------------------------------------------------
    // F2-MISLABELED: Caso especial R6 de QA (ledger canónico pero esquema físico legacy)
    // Demostrado con checksum real SHA256; precheck debe abortar antes de mutar
    // -----------------------------------------------------------------
    console.log('--- [F2-Mislabeled] Detección de base con ledger 20261007 pero esquema físico legacy (R6) ---');
    const { dbName: dbF2Mis, url: urlF2Mis } = await createIsolatedTestDatabase('f2_mislabeled');
    console.log(`Creada base aislada: ${dbF2Mis}`);

    const clientF2Mis = new Client({ connectionString: urlF2Mis });
    await clientF2Mis.connect();
    try {
      // Simular esquema físico legacy (de 20261002224650_init: sin HistorialEstadoSolicitud, categoria TEXT)
      await clientF2Mis.query(`
        CREATE TYPE "Rol" AS ENUM ('CLIENTE', 'TECNICO', 'ADMIN');
        CREATE TYPE "EstadoSolicitud" AS ENUM ('PENDIENTE', 'ACEPTADA', 'RECHAZADA', 'EN_PROCESO', 'FINALIZADA', 'CANCELADA');
        CREATE TABLE "Usuario" (
          "id" TEXT NOT NULL PRIMARY KEY, "email" TEXT NOT NULL UNIQUE, "passwordHash" TEXT NOT NULL,
          "nombre" TEXT NOT NULL, "rol" "Rol" NOT NULL DEFAULT 'CLIENTE',
          "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT now(), "fechaActualizacion" TIMESTAMP(3) NOT NULL DEFAULT now()
        );
        CREATE TABLE "SolicitudServicio" (
          "id" TEXT NOT NULL PRIMARY KEY, "titulo" TEXT NOT NULL, "descripcion" TEXT NOT NULL,
          "categoria" TEXT NOT NULL, "direccion" TEXT NOT NULL, "estado" "EstadoSolicitud" NOT NULL DEFAULT 'PENDIENTE',
          "clienteId" TEXT NOT NULL REFERENCES "Usuario"("id"), "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT now(),
          "fechaActualizacion" TIMESTAMP(3) NOT NULL DEFAULT now()
        );
      `);
    } finally {
      await clientF2Mis.end();
    }

    // Registrar migración 20261007000000_init en el ledger con su checksum real
    await runPrismaResolve(urlF2Mis, '20261007000000_init');

    console.log('F2-Mis.1. Pre-check: debe detectar CANONICAL_INITIAL_SCHEMA_DRIFT y abortar antes de mutar...');
    const precheckF2Mis = await inspectDatabaseState(urlF2Mis);
    assert(precheckF2Mis.supported === false, 'qa_f2_mislabeled debe tener supported=false');
    assert(precheckF2Mis.status === 'CANONICAL_INITIAL_SCHEMA_DRIFT', 'Debe detectar CANONICAL_INITIAL_SCHEMA_DRIFT');
    console.log('Mensaje de seguridad generado:', precheckF2Mis.message);
    console.log('✔ F2-Mislabeled detectado y bloqueado exitosamente.\n');

    // -----------------------------------------------------------------
    // F3: Ledger fallido / envenenado (P3009)
    // -----------------------------------------------------------------
    console.log('--- [F3] Ledger fallido / envenenado (Detección de fallo P3009) ---');
    const { dbName: dbF3, url: urlF3 } = await createIsolatedTestDatabase('f3_failed_ledger');
    console.log(`Creada base aislada: ${dbF3}`);

    const client3 = new Client({ connectionString: urlF3 });
    await client3.connect();
    try {
      await client3.query(`
        CREATE TABLE public._prisma_migrations (
          id VARCHAR(36) PRIMARY KEY,
          checksum VARCHAR(64) NOT NULL,
          finished_at TIMESTAMPTZ,
          migration_name VARCHAR(255) NOT NULL,
          logs TEXT,
          rolled_back_at TIMESTAMPTZ,
          started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          applied_steps_count INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO public._prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count)
        VALUES (gen_random_uuid()::text, '${computeMigrationChecksum('20261007000000_init')}', NULL, '20261007000000_init', 0);
      `);
    } finally {
      await client3.end();
    }

    console.log('F3.1. Inspección previa: detectar migración fallida y abortar...');
    const precheck3 = await inspectDatabaseState(urlF3);
    assert(precheck3.supported === false, 'Debe marcarse supported=false');
    assert(precheck3.status === 'FAILED_MIGRATION_PENDING', 'Debe detectar FAILED_MIGRATION_PENDING');

    console.log('F3.2. Verificar que migrate deploy arroja P3009 y rechaza ejecución...');
    try {
      await runPrismaMigrateDeploy(urlF3);
      assert(false, 'migrate deploy debía fallar con P3009');
    } catch (err) {
      const output = (err.stdout || '') + (err.stderr || '');
      assert(output.includes('P3009') || output.includes('found failed migrations'), 'Debe fallar con P3009');
      console.log('Fallo P3009 capturado correctamente como evidencia.');
    }
    console.log('✔ F3 superado exitosamente.\n');

    // -----------------------------------------------------------------
    // F4: Base generada con db push sin ledger (baselining ordenado y datos)
    // -----------------------------------------------------------------
    console.log('--- [F4] Base generada con db push sin ledger (Baselining ordenado y datos) ---');
    const { dbName: dbF4, url: urlF4 } = await createIsolatedTestDatabase('f4_dbpush');
    console.log(`Creada base aislada: ${dbF4}`);

    console.log('F4.1. Crear tablas via prisma db push...');
    await runCommand('./node_modules/.bin/prisma db push', { DATABASE_URL: urlF4 });

    console.log('F4.2. Cargar datos en base db push antes del baselining...');
    const client4Fixture = new Client({ connectionString: urlF4 });
    await client4Fixture.connect();
    try {
      await client4Fixture.query(`
        INSERT INTO "Usuario" ("id", "email", "passwordHash", "nombre", "celular", "rol", "fechaCreacion", "fechaActualizacion")
        VALUES ('44444444-0000-0000-0000-000000000001', 'push_user@mail.com', 'hashpush', 'Push User', null, 'CLIENTE', now(), now());

        INSERT INTO "SolicitudServicio" ("id", "titulo", "descripcion", "categoria", "direccion", "estado", "clienteId", "fechaCreacion", "fechaActualizacion")
        VALUES ('44444444-aaaa-0000-0000-000000000001', 'Solicitud push', 'Creada en push', 'PINTURA', 'Ruta 9', 'PENDIENTE', '44444444-0000-0000-0000-000000000001', now(), now());
      `);
    } finally {
      await client4Fixture.end();
    }

    console.log('F4.3. Snapshot de datos antes del baselining...');
    const client4Snap = new Client({ connectionString: urlF4 });
    await client4Snap.connect();
    let snapUsersF4, snapReqsF4;
    try {
      snapUsersF4 = (await client4Snap.query('SELECT id, email, nombre, rol FROM "Usuario"')).rows;
      snapReqsF4 = (await client4Snap.query('SELECT id, titulo, categoria, estado FROM "SolicitudServicio"')).rows;
    } finally {
      await client4Snap.end();
    }

    console.log('F4.4. Inspección previa: detectar estado DB_PUSH_OR_UNTRACKED_OBJECTS...');
    const precheck4 = await inspectDatabaseState(urlF4);
    assert(precheck4.status === 'DB_PUSH_OR_UNTRACKED_OBJECTS', 'Debe detectar DB_PUSH_OR_UNTRACKED_OBJECTS');
    assert(precheck4.supported === false, 'Debe requerir baselining (supported=false)');

    console.log('F4.5. Comprobar diff previo al baselining...');
    const diff4Pre = await runPrismaMigrateDiff(urlF4);
    assert(diff4Pre.trim() === '' || diff4Pre.includes('No difference detected'), 'Diff previo debe ser cero');

    console.log('F4.6. Aplicar baselining de las 3 migraciones canónicas con prisma migrate resolve...');
    for (const mig of CANONICAL_MIGRATIONS) {
      await runPrismaResolve(urlF4, mig);
    }

    console.log('F4.7. Validar estado posterior al baselining...');
    const precheck4Post = await inspectDatabaseState(urlF4);
    assert(precheck4Post.status === 'CANONICAL_FULLY_UPDATED', 'Debe ser CANONICAL_FULLY_UPDATED');
    assert(precheck4Post.supported === true, 'Debe ser supported=true');

    const deploy4Output = await runPrismaMigrateDeploy(urlF4);
    assert(deploy4Output.includes('No pending migrations to apply'), 'No deben existir migraciones pendientes');

    console.log('F4.8. Comprobar que los datos del fixture no se alteraron durante el baselining...');
    const client4Verify = new Client({ connectionString: urlF4 });
    await client4Verify.connect();
    try {
      const postUsersF4 = (await client4Verify.query('SELECT id, email, nombre, rol FROM "Usuario"')).rows;
      const postReqsF4 = (await client4Verify.query('SELECT id, titulo, categoria, estado FROM "SolicitudServicio"')).rows;
      assert(JSON.stringify(snapUsersF4) === JSON.stringify(postUsersF4), 'Usuarios alterados tras baselining');
      assert(JSON.stringify(snapReqsF4) === JSON.stringify(postReqsF4), 'Solicitudes alteradas tras baselining');
    } finally {
      await client4Verify.end();
    }
    console.log('✔ F4 superado exitosamente.\n');

    // -----------------------------------------------------------------
    // F5: Base fallida con init legacy duplicada (Detección y abort)
    // -----------------------------------------------------------------
    console.log('--- [F5] Detección de base fallida con init legacy duplicada ---');
    const { dbName: dbF5, url: urlF5 } = await createIsolatedTestDatabase('f5_legacy_detect');
    console.log(`Creada base aislada: ${dbF5}`);

    const client5 = new Client({ connectionString: urlF5 });
    await client5.connect();
    try {
      await client5.query(`
        CREATE TABLE public._prisma_migrations (
          id VARCHAR(36) PRIMARY KEY,
          checksum VARCHAR(64) NOT NULL,
          finished_at TIMESTAMPTZ,
          migration_name VARCHAR(255) NOT NULL,
          logs TEXT,
          rolled_back_at TIMESTAMPTZ,
          started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          applied_steps_count INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO public._prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count)
        VALUES (gen_random_uuid()::text, 'checksum-legacy-init', now(), '20261002224650_init', 1);
      `);
    } finally {
      await client5.end();
    }

    console.log('F5.1. Inspección: comprobar detección, soporte=false y abort antes de mutar...');
    const precheck5 = await inspectDatabaseState(urlF5);
    assert(precheck5.supported === false, 'supported debe ser false');
    assert(precheck5.status === 'LEGACY_UNSUPPORTED', 'Status debe ser LEGACY_UNSUPPORTED');
    assert(precheck5.details.detectedLegacy.includes('20261002224650_init'), 'Debe detectar 20261002224650_init');
    console.log('✔ F5 superado exitosamente.\n');

    // -----------------------------------------------------------------
    // F6: Migración desconocida en ledger (G1 / G6)
    // -----------------------------------------------------------------
    console.log('--- [F6] Detección de migración desconocida en ledger (G1/G6) ---');
    const { dbName: dbF6, url: urlF6 } = await createIsolatedTestDatabase('f6_unknown_mig');
    console.log(`Creada base aislada: ${dbF6}`);

    const client6 = new Client({ connectionString: urlF6 });
    await client6.connect();
    try {
      await client6.query(`
        CREATE TABLE public._prisma_migrations (
          id VARCHAR(36) PRIMARY KEY,
          checksum VARCHAR(64) NOT NULL,
          finished_at TIMESTAMPTZ,
          migration_name VARCHAR(255) NOT NULL,
          logs TEXT,
          rolled_back_at TIMESTAMPTZ,
          started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          applied_steps_count INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO public._prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count)
        VALUES (gen_random_uuid()::text, 'dummy', now(), '99990101000000_mystery', 1);
      `);
    } finally {
      await client6.end();
    }

    const precheck6 = await inspectDatabaseState(urlF6);
    assert(precheck6.supported === false, 'supported debe ser false para migración desconocida');
    assert(precheck6.status === 'UNKNOWN_MIGRATIONS_IN_LEDGER', 'Debe detectar UNKNOWN_MIGRATIONS_IN_LEDGER');
    console.log('✔ F6 superado exitosamente.\n');

    // -----------------------------------------------------------------
    // F7: Checksum alterado contra disco (G4)
    // -----------------------------------------------------------------
    console.log('--- [F7] Detección de checksum alterado contra archivo real (G4) ---');
    const { dbName: dbF7, url: urlF7 } = await createIsolatedTestDatabase('f7_bad_checksum');
    console.log(`Creada base aislada: ${dbF7}`);

    const client7 = new Client({ connectionString: urlF7 });
    await client7.connect();
    try {
      await client7.query(`
        CREATE TABLE public._prisma_migrations (
          id VARCHAR(36) PRIMARY KEY,
          checksum VARCHAR(64) NOT NULL,
          finished_at TIMESTAMPTZ,
          migration_name VARCHAR(255) NOT NULL,
          logs TEXT,
          rolled_back_at TIMESTAMPTZ,
          started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          applied_steps_count INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO public._prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count)
        VALUES (gen_random_uuid()::text, '0000000000000000000000000000000000000000000000000000000000000000', now(), '20261007000000_init', 1);
      `);
    } finally {
      await client7.end();
    }

    const precheck7 = await inspectDatabaseState(urlF7);
    assert(precheck7.supported === false, 'supported debe ser false para checksum alterado');
    assert(precheck7.status === 'CHECKSUM_MISMATCH', 'Debe detectar CHECKSUM_MISMATCH');
    console.log('✔ F7 superado exitosamente.\n');

    // -----------------------------------------------------------------
    // F8: Migración marcada con rollback (G3)
    // -----------------------------------------------------------------
    console.log('--- [F8] Detección de migración con rolled_back_at (G3) ---');
    const { dbName: dbF8, url: urlF8 } = await createIsolatedTestDatabase('f8_rolled_back');
    console.log(`Creada base aislada: ${dbF8}`);

    const client8 = new Client({ connectionString: urlF8 });
    await client8.connect();
    try {
      await client8.query(`
        CREATE TABLE public._prisma_migrations (
          id VARCHAR(36) PRIMARY KEY,
          checksum VARCHAR(64) NOT NULL,
          finished_at TIMESTAMPTZ,
          migration_name VARCHAR(255) NOT NULL,
          logs TEXT,
          rolled_back_at TIMESTAMPTZ,
          started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          applied_steps_count INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO public._prisma_migrations (id, checksum, finished_at, rolled_back_at, migration_name, applied_steps_count)
        VALUES (gen_random_uuid()::text, '${computeMigrationChecksum('20261007000000_init')}', now(), now(), '20261007000000_init', 1);
      `);
    } finally {
      await client8.end();
    }

    const precheck8 = await inspectDatabaseState(urlF8);
    assert(precheck8.supported === false, 'supported debe ser false con rollback');
    assert(precheck8.status === 'ROLLED_BACK_MIGRATIONS_IN_LEDGER', 'Debe detectar ROLLED_BACK_MIGRATIONS_IN_LEDGER');
    console.log('✔ F8 superado exitosamente.\n');

    // -----------------------------------------------------------------
    // F9: Base con objetos / enums pero sin public._prisma_migrations
    // -----------------------------------------------------------------
    console.log('--- [F9] Base con objetos/enums sin _prisma_migrations (no clasificar como vacía) ---');
    const { dbName: dbF9, url: urlF9 } = await createIsolatedTestDatabase('f9_enums_no_ledger');
    console.log(`Creada base aislada: ${dbF9}`);

    const client9 = new Client({ connectionString: urlF9 });
    await client9.connect();
    try {
      await client9.query(`CREATE TYPE "Rol" AS ENUM ('CLIENTE', 'TECNICO', 'ADMIN');`);
    } finally {
      await client9.end();
    }

    const precheck9 = await inspectDatabaseState(urlF9);
    assert(precheck9.status === 'DB_PUSH_OR_UNTRACKED_OBJECTS', 'No debe ser CLEAN_DATABASE si existen enums');
    assert(precheck9.supported === false, 'Debe requerir verificación previa');
    console.log('✔ F9 superado exitosamente.\n');

    // -----------------------------------------------------------------
    // F10: Ledger completo con sha256 reales pero cero tablas de usuario (G5)
    // -----------------------------------------------------------------
    console.log('--- [F10] Detección de ledger completo pero cero tablas físicas (G5 con checksums reales) ---');
    const { dbName: dbF10, url: urlF10 } = await createIsolatedTestDatabase('f10_ledger_no_tables');
    console.log(`Creada base aislada: ${dbF10}`);

    const client10 = new Client({ connectionString: urlF10 });
    await client10.connect();
    try {
      await client10.query(`
        CREATE TABLE public._prisma_migrations (
          id VARCHAR(36) PRIMARY KEY,
          checksum VARCHAR(64) NOT NULL,
          finished_at TIMESTAMPTZ,
          migration_name VARCHAR(255) NOT NULL,
          logs TEXT,
          rolled_back_at TIMESTAMPTZ,
          started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          applied_steps_count INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO public._prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count)
        VALUES 
          (gen_random_uuid()::text, '${computeMigrationChecksum('20261007000000_init')}', now(), '20261007000000_init', 1),
          (gen_random_uuid()::text, '${computeMigrationChecksum('20261011212651_add_last_login_to_usuario')}', now(), '20261011212651_add_last_login_to_usuario', 1),
          (gen_random_uuid()::text, '${computeMigrationChecksum('20261011230000_feat_rechazo_vuelve_a_pendiente')}', now(), '20261011230000_feat_rechazo_vuelve_a_pendiente', 1);
      `);
    } finally {
      await client10.end();
    }

    const precheck10 = await inspectDatabaseState(urlF10);
    assert(precheck10.supported === false, 'G5 debe tener supported=false');
    assert(precheck10.status === 'CANONICAL_SCHEMA_DRIFT', 'Debe detectar CANONICAL_SCHEMA_DRIFT por diff');
    console.log('✔ F10 superado exitosamente.\n');

    // -----------------------------------------------------------------
    // F11: Verificación de resiliencia y limpieza ante fallos normales
    // -----------------------------------------------------------------
    console.log('--- [F11] Verificación de limpieza ante excepciones normales ---');
    let simulatedFailedDbName = null;
    try {
      const { dbName: simDb } = await createIsolatedTestDatabase('simulated_failure');
      simulatedFailedDbName = simDb;
      throw new Error('Fallo simulado para probar el bloque finally');
    } catch (simErr) {
      console.log('Fallo simulado capturado:', simErr.message);
      // Eliminar la base de la simulación
      await executeAdminQuery(`DROP DATABASE IF EXISTS ${simulatedFailedDbName} WITH (FORCE);`);
      createdDatabases.delete(simulatedFailedDbName);
      console.log(`Base de simulación ${simulatedFailedDbName} limpiada correctamente.`);
    }
    console.log('✔ F11 superado exitosamente.\n');

    // -----------------------------------------------------------------
    // Verificación final del Sentinel Ajeno (R2)
    // -----------------------------------------------------------------
    console.log('--- [Verificación Sentinel] Comprobar que el sentinel ajeno sobrevivió intacto ---');
    const sentinelCheck = await executeAdminQuery(`SELECT 1 FROM pg_database WHERE datname = '${sentinelDbName}';`);
    assert(sentinelCheck.rows.length === 1, `El sentinel ${sentinelDbName} fue destruido indebidamente`);
    console.log(`✔ El sentinel ajeno ${sentinelDbName} sobrevivió a toda la ejecución sin ser tocado.`);

  } finally {
    // LIMPIEZA RESILIENTE Y SEGURA: Eliminar EXCLUSIVAMENTE las bases y sentinel creados por este runner
    await cleanupCreatedDatabases();
  }

  if (cleanupHasFailures) {
    console.error('\n❌ ERROR: Ocurrieron fallos durante la limpieza de bases de prueba. Consulte los logs superiores.');
    process.exit(1);
  }

  console.log('\n================================================================');
  console.log('TODAS LAS COMPROBACIONES DE BE-01 (F0-F11) PASARON CON ÉXITO');
  console.log('================================================================');
}

main().catch(async (err) => {
  console.error('\n❌ ERROR EN LA VERIFICACIÓN DE MIGRACIONES:');
  console.error(err);
  await cleanupCreatedDatabases();
  process.exit(1);
});
