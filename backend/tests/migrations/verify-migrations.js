import pg from 'pg';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { inspectDatabaseState, CANONICAL_MIGRATIONS } from './migration-precheck.js';

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

// Registro estricto de bases creadas por este runner para limpieza en finally
const createdDatabases = new Set();

async function executeAdminQuery(sql) {
  const client = new Client({ connectionString: getAdminUrl(BASE_DATABASE_URL) });
  await client.connect();
  try {
    return await client.query(sql);
  } finally {
    await client.end();
  }
}

/**
 * Crea una base de datos con nombre impredecible sin borrar previamente bases ajenas.
 * Registra el nombre creado únicamente tras el CREATE DATABASE exitoso.
 */
async function createIsolatedTestDatabase(label) {
  const runId = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  const dbName = `uf_${label}_${runId}`;
  await executeAdminQuery(`CREATE DATABASE ${dbName};`);
  createdDatabases.add(dbName);
  return {
    dbName,
    url: getDatabaseUrl(BASE_DATABASE_URL, dbName)
  };
}

function runCommand(command, envOverrides = {}) {
  return execSync(command, {
    cwd: backendRoot,
    env: { ...process.env, ...envOverrides },
    encoding: 'utf-8',
    stdio: 'pipe'
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
  console.log('UrbanFix Backend - Suite de Verificación BE-01 (Matriz F0-F9)');
  console.log('Servidor PostgreSQL objetivo (enmascarado):', maskUrl(BASE_DATABASE_URL));
  console.log('Aviso: Requiere privilegio CREATEDB en el servidor de pruebas.');
  console.log('================================================================\n');

  // Asegurar cliente generado
  runCommand('./node_modules/.bin/prisma generate');

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
    const deploy1Output = runPrismaMigrateDeploy(urlF0);
    assert(deploy1Output.includes('All migrations have been successfully applied'), 'Migraciones deben aplicarse');

    console.log('F0.3. Segundo migrate deploy (idempotencia)...');
    const deploy2Output = runPrismaMigrateDeploy(urlF0);
    assert(deploy2Output.includes('No pending migrations to apply'), 'Segundo deploy debe ser idempotente');

    console.log('F0.4. Comprobación diff contra schema.prisma...');
    const diff0Output = runPrismaMigrateDiff(urlF0);
    assert(diff0Output.includes('No difference detected'), 'Diff debe ser cero');

    console.log('F0.5. Ejecutar seed por primera vez...');
    runCommand('node prisma/seed.js', { DATABASE_URL: urlF0 });

    console.log('F0.6. Ejecutar seed por segunda vez (idempotencia)...');
    runCommand('node prisma/seed.js', { DATABASE_URL: urlF0 });

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
    runCommand(`node -e "${loginCheckScript.replace(/"/g, '\\"')}"`, { DATABASE_URL: urlF0 });
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
    const deployAgainOutput = runPrismaMigrateDeploy(urlF0);
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

    const diff1Output = runPrismaMigrateDiff(urlF0);
    assert(diff1Output.includes('No difference detected'), 'Diff debe ser cero');
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

    // Registrar migración 1 mediante el comando oficial de Prisma
    console.log('F2.2. Registrar migración canónica 1 con prisma migrate resolve...');
    runPrismaResolve(urlF2, '20261007000000_init');

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

    console.log('F2.5. Inspección previa con precheck: debe detectar CANONICAL_INITIAL_NEEDS_UPGRADE...');
    const precheck2 = await inspectDatabaseState(urlF2);
    assert(precheck2.status === 'CANONICAL_INITIAL_NEEDS_UPGRADE', 'Debe detectar necesidad de actualización conservadora');

    console.log('F2.6. Ejecutar procedimiento conservador en transacción BEGIN/COMMIT...');
    const client2Upgrade = new Client({ connectionString: urlF2 });
    await client2Upgrade.connect();
    try {
      await client2Upgrade.query(`
        BEGIN;
        ALTER TABLE "SolicitudServicio" ALTER COLUMN "categoria" TYPE TEXT USING "categoria"::text;
        ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "lastLogin" TIMESTAMP(3);
        COMMIT;
      `);
      // Verificar esquema físico ANTES de resolve
      const colCheck = await client2Upgrade.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'SolicitudServicio' AND column_name = 'categoria';
      `);
      assert(colCheck.rows[0].data_type === 'text', 'Columna categoria debe ser text');
      const loginCheck = await client2Upgrade.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'Usuario' AND column_name = 'lastLogin';
      `);
      assert(loginCheck.rows.length === 1, 'Columna lastLogin debe existir en Usuario');
    } finally {
      await client2Upgrade.end();
    }

    console.log('F2.7. Registrar 20261011212651_add_last_login_to_usuario con prisma migrate resolve...');
    runPrismaResolve(urlF2, '20261011212651_add_last_login_to_usuario');

    console.log('F2.8. Aplicar migración subsiguiente (feat_rechazo_vuelve_a_pendiente) con migrate deploy...');
    const deployF2Output = runPrismaMigrateDeploy(urlF2);
    assert(deployF2Output.includes('20261011230000_feat_rechazo_vuelve_a_pendiente'), 'Debe aplicar migración de rechazo');

    console.log('F2.9. Comprobar diff contra schema.prisma...');
    const diffF2Output = runPrismaMigrateDiff(urlF2);
    assert(diffF2Output.includes('No difference detected'), 'Diff debe ser cero');

    console.log('F2.10. Comparar snapshot de datos completo posterior a la migración...');
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
    // F3: Ledger fallido / envenenado (P3009)
    // -----------------------------------------------------------------
    console.log('--- [F3] Ledger fallido / envenenado (Detección de fallo P3009) ---');
    const { dbName: dbF3, url: urlF3 } = await createIsolatedTestDatabase('f3_failed_ledger');
    console.log(`Creada base aislada: ${dbF3}`);

    const client3 = new Client({ connectionString: urlF3 });
    await client3.connect();
    try {
      await client3.query(`
        CREATE TABLE _prisma_migrations (
          id VARCHAR(36) PRIMARY KEY,
          checksum VARCHAR(64) NOT NULL,
          finished_at TIMESTAMPTZ,
          migration_name VARCHAR(255) NOT NULL,
          logs TEXT,
          rolled_back_at TIMESTAMPTZ,
          started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          applied_steps_count INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count)
        VALUES (gen_random_uuid()::text, 'checksum-failed-init', NULL, '20261007000000_init', 0);
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
      runPrismaMigrateDeploy(urlF3);
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
    runCommand('./node_modules/.bin/prisma db push', { DATABASE_URL: urlF4 });

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
    const diff4Pre = runPrismaMigrateDiff(urlF4);
    assert(diff4Pre.includes('No difference detected'), 'Diff previo debe ser cero');

    console.log('F4.6. Aplicar baselining de las 3 migraciones canónicas con prisma migrate resolve...');
    for (const mig of CANONICAL_MIGRATIONS) {
      runPrismaResolve(urlF4, mig);
    }

    console.log('F4.7. Validar estado posterior al baselining...');
    const precheck4Post = await inspectDatabaseState(urlF4);
    assert(precheck4Post.status === 'CANONICAL_FULLY_UPDATED', 'Debe ser CANONICAL_FULLY_UPDATED');
    assert(precheck4Post.supported === true, 'Debe ser supported=true');

    const deploy4Output = runPrismaMigrateDeploy(urlF4);
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
        CREATE TABLE _prisma_migrations (
          id VARCHAR(36) PRIMARY KEY,
          checksum VARCHAR(64) NOT NULL,
          finished_at TIMESTAMPTZ,
          migration_name VARCHAR(255) NOT NULL,
          logs TEXT,
          rolled_back_at TIMESTAMPTZ,
          started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          applied_steps_count INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count)
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
    // F6: Migración desconocida en ledger (Bloqueo preventivo)
    // -----------------------------------------------------------------
    console.log('--- [F6] Detección de migración desconocida en ledger ---');
    const { dbName: dbF6, url: urlF6 } = await createIsolatedTestDatabase('f6_unknown_mig');
    console.log(`Creada base aislada: ${dbF6}`);

    const client6 = new Client({ connectionString: urlF6 });
    await client6.connect();
    try {
      await client6.query(`
        CREATE TABLE _prisma_migrations (
          id VARCHAR(36) PRIMARY KEY,
          checksum VARCHAR(64) NOT NULL,
          finished_at TIMESTAMPTZ,
          migration_name VARCHAR(255) NOT NULL,
          logs TEXT,
          rolled_back_at TIMESTAMPTZ,
          started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          applied_steps_count INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count)
        VALUES (gen_random_uuid()::text, 'dummy', now(), '20269999999999_custom_hack', 1);
      `);
    } finally {
      await client6.end();
    }

    const precheck6 = await inspectDatabaseState(urlF6);
    assert(precheck6.supported === false, 'supported debe ser false para migración desconocida');
    assert(precheck6.status === 'UNKNOWN_MIGRATIONS_IN_LEDGER', 'Debe detectar UNKNOWN_MIGRATIONS_IN_LEDGER');
    console.log('✔ F6 superado exitosamente.\n');

    // -----------------------------------------------------------------
    // F7: Checksum alterado contra disco (Bloqueo de drift)
    // -----------------------------------------------------------------
    console.log('--- [F7] Detección de checksum alterado contra archivo real ---');
    const { dbName: dbF7, url: urlF7 } = await createIsolatedTestDatabase('f7_bad_checksum');
    console.log(`Creada base aislada: ${dbF7}`);

    const client7 = new Client({ connectionString: urlF7 });
    await client7.connect();
    try {
      await client7.query(`
        CREATE TABLE _prisma_migrations (
          id VARCHAR(36) PRIMARY KEY,
          checksum VARCHAR(64) NOT NULL,
          finished_at TIMESTAMPTZ,
          migration_name VARCHAR(255) NOT NULL,
          logs TEXT,
          rolled_back_at TIMESTAMPTZ,
          started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          applied_steps_count INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count)
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
    // F8: Migración marcada con rollback (Bloqueo)
    // -----------------------------------------------------------------
    console.log('--- [F8] Detección de migración con rolled_back_at ---');
    const { dbName: dbF8, url: urlF8 } = await createIsolatedTestDatabase('f8_rolled_back');
    console.log(`Creada base aislada: ${dbF8}`);

    const client8 = new Client({ connectionString: urlF8 });
    await client8.connect();
    try {
      await client8.query(`
        CREATE TABLE _prisma_migrations (
          id VARCHAR(36) PRIMARY KEY,
          checksum VARCHAR(64) NOT NULL,
          finished_at TIMESTAMPTZ,
          migration_name VARCHAR(255) NOT NULL,
          logs TEXT,
          rolled_back_at TIMESTAMPTZ,
          started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          applied_steps_count INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO _prisma_migrations (id, checksum, finished_at, rolled_back_at, migration_name, applied_steps_count)
        VALUES (gen_random_uuid()::text, 'dummy', now(), now(), '20261007000000_init', 1);
      `);
    } finally {
      await client8.end();
    }

    const precheck8 = await inspectDatabaseState(urlF8);
    assert(precheck8.supported === false, 'supported debe ser false con rollback');
    assert(precheck8.status === 'ROLLED_BACK_MIGRATIONS_IN_LEDGER', 'Debe detectar ROLLED_BACK_MIGRATIONS_IN_LEDGER');
    console.log('✔ F8 superado exitosamente.\n');

    // -----------------------------------------------------------------
    // F9: Base con objetos / enums pero sin _prisma_migrations
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

  } finally {
    // LIMPIEZA RESILIENTE Y SEGURA: Eliminar EXCLUSIVAMENTE las bases creadas por este runner
    console.log('Limpiando exclusivamente las bases de prueba creadas durante esta ejecución...');
    for (const dbName of createdDatabases) {
      try {
        await executeAdminQuery(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`);
        console.log(`  - Eliminada: ${dbName}`);
      } catch (dropErr) {
        console.warn(`  ! No se pudo eliminar ${dbName}: ${dropErr.message}`);
      }
    }
  }

  console.log('\n================================================================');
  console.log('TODAS LAS COMPROBACIONES DE BE-01 (F0-F9) PASARON CON ÉXITO');
  console.log('================================================================');
}

main().catch(err => {
  console.error('\n❌ ERROR EN LA VERIFICACIÓN DE MIGRACIONES:');
  console.error(err);
  process.exit(1);
});
