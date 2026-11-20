import pg from 'pg';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { inspectDatabaseState, CANONICAL_MIGRATIONS } from './migration-precheck.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '../..');

const { Client } = pg;

// Connection URL from env, default to local test container port 5433
const BASE_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:testpass@localhost:5433/urbanfix_test';

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

async function executeAdminQuery(sql) {
  const client = new Client({ connectionString: getAdminUrl(BASE_DATABASE_URL) });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function recreateDatabase(dbName) {
  await executeAdminQuery(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`);
  await executeAdminQuery(`CREATE DATABASE ${dbName};`);
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
  console.log('UrbanFix Backend - Verificación de Migraciones BE-01 (Matriz F0-F5)');
  console.log('Base PostgreSQL:', BASE_DATABASE_URL);
  console.log('================================================================\n');

  // Asegurar prisma generate
  runCommand('./node_modules/.bin/prisma generate');

  // -----------------------------------------------------------------
  // F0: Instalación vacía
  // Deploy repetido, diff cero, seed idempotente y login 3 roles
  // -----------------------------------------------------------------
  console.log('--- [F0] Instalación vacía (Defecto D2 resuelto) ---');
  const dbF0 = 'urbanfix_test_f0_empty';
  const urlF0 = getDatabaseUrl(BASE_DATABASE_URL, dbF0);
  await recreateDatabase(dbF0);

  console.log('F0.1. Inspeccionar estado inicial...');
  const precheck0 = await inspectDatabaseState(urlF0);
  assert(precheck0.status === 'CLEAN_DATABASE', 'Estado inicial debe ser CLEAN_DATABASE');

  console.log('F0.2. Primer migrate deploy...');
  const deploy1Output = runPrismaMigrateDeploy(urlF0);
  assert(deploy1Output.includes('All migrations have been successfully applied'), 'Migraciones deben aplicarse');

  console.log('F0.3. Segundo migrate deploy (idempotencia)...');
  const deploy2Output = runPrismaMigrateDeploy(urlF0);
  assert(deploy2Output.includes('No pending migrations to apply'), 'Segundo deploy debe ser idempotente');

  console.log('F0.4. Comprobación diff contra schema.prisma...');
  const diffOutput = runPrismaMigrateDiff(urlF0);
  assert(diffOutput.includes('No difference detected'), 'Diff debe ser cero');

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
  // Sin cambios destructivos, deploy adicional sin mutación
  // -----------------------------------------------------------------
  console.log('--- [F1] Base canónica ya actualizada ---');
  console.log('F1.1. Inspeccionar estado en F0...');
  const precheck1 = await inspectDatabaseState(urlF0);
  assert(precheck1.status === 'CANONICAL_FULLY_UPDATED', 'Estado debe ser CANONICAL_FULLY_UPDATED');

  console.log('F1.2. Ejecutar migrate deploy en base ya actualizada...');
  const deployAgainOutput = runPrismaMigrateDeploy(urlF0);
  assert(deployAgainOutput.includes('No pending migrations to apply'), 'No deben existir migraciones pendientes');

  console.log('F1.3. Verificar que los datos y schema siguen intactos...');
  const diff1Output = runPrismaMigrateDiff(urlF0);
  assert(diff1Output.includes('No difference detected'), 'Diff debe ser cero');
  console.log('✔ F1 superado exitosamente.\n');

  // -----------------------------------------------------------------
  // F2: Base canónica inicial con datos existentes (Defecto D3 resuelto)
  // Actualización conservadora sin pérdida de datos en categoría
  // -----------------------------------------------------------------
  console.log('--- [F2] Actualización conservadora de base inicial poblada (Defecto D3 resuelto) ---');
  const dbF2 = 'urbanfix_test_f2_canonical_upgrade';
  const urlF2 = getDatabaseUrl(BASE_DATABASE_URL, dbF2);
  await recreateDatabase(dbF2);

  console.log('F2.1. Aplicar estado inicial de semana 3 (20261007000000_init)...');
  const initSqlPath = path.resolve(backendRoot, 'prisma/migrations/20261007000000_init/migration.sql');
  const initSql = fs.readFileSync(initSqlPath, 'utf-8');

  const client2 = new Client({ connectionString: urlF2 });
  await client2.connect();
  try {
    await client2.query(initSql);
    // Registrar migración inicial en _prisma_migrations
    await client2.query(`
      CREATE TABLE IF NOT EXISTS _prisma_migrations (
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
      VALUES (gen_random_uuid()::text, 'checksum-20261007000000_init', now(), '20261007000000_init', 1);
    `);

    console.log('F2.2. Cargar fixture con datos existentes (usuarios, categorías enum, solicitudes, historial)...');
    await client2.query(`
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
    await client2.end();
  }

  console.log('F2.3. Inspección previa: detectar estado CANONICAL_INITIAL_NEEDS_UPGRADE...');
  const precheck2 = await inspectDatabaseState(urlF2);
  assert(precheck2.status === 'CANONICAL_INITIAL_NEEDS_UPGRADE', 'Debe detectar necesidad de actualización conservadora');

  console.log('F2.4. Ejecutar procedimiento conservador (ALTER TYPE TEXT USING categoria::text y lastLogin)...');
  const client2Upgrade = new Client({ connectionString: urlF2 });
  await client2Upgrade.connect();
  try {
    await client2Upgrade.query(`
      ALTER TABLE "SolicitudServicio" ALTER COLUMN "categoria" TYPE TEXT USING "categoria"::text;
      ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "lastLogin" TIMESTAMP(3);
    `);
  } finally {
    await client2Upgrade.end();
  }

  console.log('F2.5. Marcar 20261011212651_add_last_login_to_usuario como aplicada via prisma migrate resolve...');
  runPrismaResolve(urlF2, '20261011212651_add_last_login_to_usuario');

  console.log('F2.6. Aplicar migraciones subsiguientes con migrate deploy...');
  const deployF2Output = runPrismaMigrateDeploy(urlF2);
  assert(deployF2Output.includes('20261011230000_feat_rechazo_vuelve_a_pendiente'), 'Debe aplicar migración de rechazo');

  console.log('F2.7. Comprobar diff contra schema...');
  const diffF2Output = runPrismaMigrateDiff(urlF2);
  assert(diffF2Output.includes('No difference detected'), 'Diff debe ser cero');

  console.log('F2.8. Validar integridad de datos y no-pérdida de valores en SolicitudServicio y Categoria...');
  const client2Verify = new Client({ connectionString: urlF2 });
  await client2Verify.connect();
  try {
    const s1 = await client2Verify.query('SELECT * FROM "SolicitudServicio" WHERE id = $1', ['aaaaaaaa-0000-0000-0000-000000000001']);
    assert(s1.rows.length === 1, 'Solicitud 1 debe existir');
    assert(s1.rows[0].categoria === 'GAS', `Categoria debe conservarse como 'GAS', encontrada: ${s1.rows[0].categoria}`);
    assert(s1.rows[0].estado === 'PENDIENTE', 'Estado debe seguir siendo PENDIENTE');

    const s2 = await client2Verify.query('SELECT * FROM "SolicitudServicio" WHERE id = $1', ['aaaaaaaa-0000-0000-0000-000000000002']);
    assert(s2.rows.length === 1, 'Solicitud 2 debe existir');
    assert(s2.rows[0].categoria === 'PLOMERIA', `Categoria debe conservarse como 'PLOMERIA', encontrada: ${s2.rows[0].categoria}`);
    assert(s2.rows[0].tecnicoId === '22222222-0000-0000-0000-000000000002', 'tecnicoId debe conservarse');

    const histCount = await client2Verify.query('SELECT count(*)::int as count FROM "HistorialEstadoSolicitud"');
    assert(histCount.rows[0].count === 2, 'Historial debe conservar todos sus registros');

    // Verificar que tabla RechazoSolicitud está lista y funcional
    await client2Verify.query(`
      INSERT INTO "RechazoSolicitud" ("id", "solicitudId", "tecnicoId", "motivo", "fechaRechazo")
      VALUES ('rrrrrrrr-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'Lejos de zona', now());
    `);
    const rechazoCount = await client2Verify.query('SELECT count(*)::int as count FROM "RechazoSolicitud"');
    assert(rechazoCount.rows[0].count === 1, 'RechazoSolicitud debe aceptar inserciones');
  } finally {
    await client2Verify.end();
  }
  console.log('✔ F2 superado exitosamente.\n');

  // -----------------------------------------------------------------
  // F3: Ledger fallido / envenenado (P3009)
  // -----------------------------------------------------------------
  console.log('--- [F3] Ledger fallido / envenenado (Detección de fallo P3009) ---');
  const dbF3 = 'urbanfix_test_f3_failed_ledger';
  const urlF3 = getDatabaseUrl(BASE_DATABASE_URL, dbF3);
  await recreateDatabase(dbF3);

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
  console.log('Mensaje de seguridad generado:', precheck3.message);

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
  // F4: Base generada con db push sin ledger (baselining ordenado)
  // -----------------------------------------------------------------
  console.log('--- [F4] Base generada con db push sin ledger (baselining ordenado) ---');
  const dbF4 = 'urbanfix_test_f4_dbpush';
  const urlF4 = getDatabaseUrl(BASE_DATABASE_URL, dbF4);
  await recreateDatabase(dbF4);

  console.log('F4.1. Crear tablas via prisma db push...');
  runCommand('./node_modules/.bin/prisma db push', { DATABASE_URL: urlF4 });

  console.log('F4.2. Inspección previa: detectar estado DB_PUSH_UNBASELINED...');
  const precheck4 = await inspectDatabaseState(urlF4);
  assert(precheck4.status === 'DB_PUSH_UNBASELINED', 'Debe detectar DB_PUSH_UNBASELINED');

  console.log('F4.3. Comprobar diff previo al baselining...');
  const diff4Pre = runPrismaMigrateDiff(urlF4);
  assert(diff4Pre.includes('No difference detected'), 'Diff previo debe ser cero');

  console.log('F4.4. Aplicar baselining de las 3 migraciones canónicas...');
  for (const mig of CANONICAL_MIGRATIONS) {
    runPrismaResolve(urlF4, mig);
  }

  console.log('F4.5. Validar estado posterior al baselining...');
  const precheck4Post = await inspectDatabaseState(urlF4);
  assert(precheck4Post.status === 'CANONICAL_FULLY_UPDATED', 'Debe ser CANONICAL_FULLY_UPDATED');

  const deploy4Output = runPrismaMigrateDeploy(urlF4);
  assert(deploy4Output.includes('No pending migrations to apply'), 'No deben existir migraciones pendientes');

  const diff4Post = runPrismaMigrateDiff(urlF4);
  assert(diff4Post.includes('No difference detected'), 'Diff debe ser cero');
  console.log('✔ F4 superado exitosamente.\n');

  // -----------------------------------------------------------------
  // F5: Base fallida con init legacy (detección y abort)
  // -----------------------------------------------------------------
  console.log('--- [F5] Detección de base fallida con init legacy duplicada ---');
  const dbF5 = 'urbanfix_test_f5_legacy_detect';
  const urlF5 = getDatabaseUrl(BASE_DATABASE_URL, dbF5);
  await recreateDatabase(dbF5);

  console.log('F5.1. Simular base con registro legacy 20261002224650_init en _prisma_migrations...');
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

  console.log('F5.2. Inspección: comprobar detección, soporte=false y abort antes de mutar...');
  const precheck5 = await inspectDatabaseState(urlF5);
  assert(precheck5.supported === false, 'supported debe ser false');
  assert(precheck5.status === 'LEGACY_UNSUPPORTED', 'Status debe ser LEGACY_UNSUPPORTED');
  assert(precheck5.details.detectedLegacy.includes('20261002224650_init'), 'Debe detectar 20261002224650_init');
  console.log('Mensaje de seguridad generado:', precheck5.message);
  console.log('✔ F5 superado exitosamente.\n');

  // Limpieza de bases temporales auxiliares
  console.log('Limpiando bases de prueba temporales...');
  await executeAdminQuery(`DROP DATABASE IF EXISTS ${dbF0} WITH (FORCE);`);
  await executeAdminQuery(`DROP DATABASE IF EXISTS ${dbF2} WITH (FORCE);`);
  await executeAdminQuery(`DROP DATABASE IF EXISTS ${dbF3} WITH (FORCE);`);
  await executeAdminQuery(`DROP DATABASE IF EXISTS ${dbF4} WITH (FORCE);`);
  await executeAdminQuery(`DROP DATABASE IF EXISTS ${dbF5} WITH (FORCE);`);

  console.log('================================================================');
  console.log('TODAS LAS COMPROBACIONES DE BE-01 (F0-F5) PASARON CON ÉXITO');
  console.log('================================================================');
}

main().catch(err => {
  console.error('\n❌ ERROR EN LA VERIFICACIÓN DE MIGRACIONES:');
  console.error(err);
  process.exit(1);
});
