import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '../..');

const { Client } = pg;

export const CANONICAL_MIGRATIONS = [
  '20261007000000_init',
  '20261011212651_add_last_login_to_usuario',
  '20261011230000_feat_rechazo_vuelve_a_pendiente'
];

export const UNSUPPORTED_LEGACY_MIGRATIONS = [
  '20261002224650_init',
  '20261005143951_init'
];

/**
 * Computes the SHA256 checksum of a migration.sql file on disk.
 * Matches Prisma's internal checksum format (hex string).
 */
export function computeMigrationChecksum(migrationName) {
  const filePath = path.join(backendRoot, 'prisma/migrations', migrationName, 'migration.sql');
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Inspects a PostgreSQL database (schema 'public') to categorize its Prisma migration state,
 * validate checksums against real disk files, and prevent unsafe mutations or blind resolves.
 *
 * @param {string} connectionString Database URL
 * @returns {Promise<{supported: boolean, status: string, details: any, message: string}>}
 */
export async function inspectDatabaseState(connectionString) {
  if (!connectionString) {
    throw new Error('inspectDatabaseState requiere una cadena de conexión válida.');
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    // 1. Verificar si existe la tabla _prisma_migrations en esquema public
    const regCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = '_prisma_migrations'
      ) as exists;
    `);

    const hasMigrationsTable = regCheck.rows[0].exists;

    // 2. Comprobar tablas de usuario en esquema public
    const tablesCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name NOT LIKE '\\_%';
    `);
    const userTables = tablesCheck.rows.map(r => r.table_name);

    // 3. Comprobar tipos de datos / enums en esquema public
    const enumsCheck = await client.query(`
      SELECT t.typname 
      FROM pg_type t 
      JOIN pg_namespace n ON n.oid = t.typnamespace 
      WHERE n.nspname = 'public' AND t.typtype = 'e';
    `);
    const userEnums = enumsCheck.rows.map(r => r.typname);

    // Si NO existe _prisma_migrations:
    if (!hasMigrationsTable) {
      if (userTables.length === 0 && userEnums.length === 0) {
        return {
          supported: true,
          status: 'CLEAN_DATABASE',
          details: { userTables: [], userEnums: [] },
          message: 'Base vacía en esquema public: lista para prisma migrate deploy directo.'
        };
      } else {
        return {
          supported: false,
          status: 'DB_PUSH_OR_UNTRACKED_OBJECTS',
          details: { userTables, userEnums },
          message: 'ESTADO NO BASELINEADO: Existen tablas o enums en esquema public sin historial _prisma_migrations (posible prisma db push o DDL manual). Requiere verificación previa estricta con prisma migrate diff antes de baselining ordenado.'
        };
      }
    }

    // 4. Si existe _prisma_migrations, auditar su contenido completo
    const migCheck = await client.query(`
      SELECT id, migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
      FROM _prisma_migrations
      ORDER BY started_at ASC;
    `);
    const records = migCheck.rows;

    if (records.length === 0) {
      if (userTables.length === 0 && userEnums.length === 0) {
        return {
          supported: true,
          status: 'CLEAN_DATABASE',
          details: { userTables: [], userEnums: [] },
          message: 'Tabla _prisma_migrations vacía y sin objetos: lista para prisma migrate deploy directo.'
        };
      } else {
        return {
          supported: false,
          status: 'EMPTY_LEDGER_WITH_OBJECTS',
          details: { userTables, userEnums },
          message: 'ESTADO BLOQUEADO: _prisma_migrations está vacía pero existen tablas/enums en public. Requiere verificación de diff previa a cualquier mutación.'
        };
      }
    }

    const migrationNames = records.map(r => r.migration_name);

    // 4.1. Detectar migraciones legacy / espurias conocidas
    const detectedLegacy = migrationNames.filter(name =>
      UNSUPPORTED_LEGACY_MIGRATIONS.includes(name) ||
      name.startsWith('20261002') ||
      name.startsWith('20261005')
    );

    if (detectedLegacy.length > 0) {
      return {
        supported: false,
        status: 'LEGACY_UNSUPPORTED',
        details: { detectedLegacy, allMigrations: migrationNames },
        message: `ESTADO BLOQUEADO: Se detectaron migraciones legacy/espurias no soportadas (${detectedLegacy.join(', ')}). Abortando para evitar mutaciones o corrupción. Requiere backup previo y escalación de arquitectura.`
      };
    }

    // 4.2. Detectar migraciones desconocidas (que no sean ni canónicas ni legacy)
    const unknownMigrations = migrationNames.filter(name => !CANONICAL_MIGRATIONS.includes(name));
    if (unknownMigrations.length > 0) {
      return {
        supported: false,
        status: 'UNKNOWN_MIGRATIONS_IN_LEDGER',
        details: { unknownMigrations, allMigrations: migrationNames },
        message: `ESTADO BLOQUEADO: Se detectaron migraciones desconocidas en _prisma_migrations (${unknownMigrations.join(', ')}). Abortando antes de mutar.`
      };
    }

    // 4.3. Detectar migraciones con rollback registrado
    const rolledBack = records.filter(r => r.rolled_back_at !== null);
    if (rolledBack.length > 0) {
      return {
        supported: false,
        status: 'ROLLED_BACK_MIGRATIONS_IN_LEDGER',
        details: { rolledBack: rolledBack.map(r => r.migration_name) },
        message: `ESTADO BLOQUEADO: Existen migraciones marcadas con rolled_back_at (${rolledBack.map(r => r.migration_name).join(', ')}). Requiere diagnóstico manual.`
      };
    }

    // 4.4. Detectar migraciones fallidas pendientes (finished_at NULL y rolled_back_at NULL)
    const failedMigrations = records.filter(r => !r.finished_at && !r.rolled_back_at);
    if (failedMigrations.length > 0) {
      return {
        supported: false,
        status: 'FAILED_MIGRATION_PENDING',
        details: { failedMigrations: failedMigrations.map(f => f.migration_name) },
        message: `ESTADO BLOQUEADO: Existen migraciones en estado fallido (${failedMigrations.map(f => f.migration_name).join(', ')}). Prisma arrojará P3009 en deploy. Requiere diagnóstico y backup.`
      };
    }

    // 4.5. Filtrar las migraciones efectivamente aplicadas con éxito
    const appliedRecords = records.filter(r => r.finished_at !== null && r.rolled_back_at === null);
    const appliedNames = appliedRecords.map(r => r.migration_name);

    // 4.6. Validar CHECKSUMS de todas las migraciones aplicadas contra los archivos reales en disco
    const checksumMismatches = [];
    for (const rec of appliedRecords) {
      const diskChecksum = computeMigrationChecksum(rec.migration_name);
      if (!diskChecksum) {
        checksumMismatches.push({
          migration: rec.migration_name,
          reason: 'Archivo no encontrado en prisma/migrations/'
        });
      } else if (diskChecksum !== rec.checksum) {
        checksumMismatches.push({
          migration: rec.migration_name,
          expected: diskChecksum,
          inDatabase: rec.checksum
        });
      }
    }

    if (checksumMismatches.length > 0) {
      return {
        supported: false,
        status: 'CHECKSUM_MISMATCH',
        details: { checksumMismatches },
        message: `ESTADO BLOQUEADO: Checksums en base no coinciden con los archivos en disco para: ${checksumMismatches.map(c => c.migration).join(', ')}. Prisma arrojará P3009 o drift.`
      };
    }

    // 4.7. Categorizar según el subconjunto de migraciones canónicas aplicadas
    const isAtInitialCanonical = appliedNames.length === 1 && appliedNames[0] === '20261007000000_init';
    const isAtSecondCanonical = appliedNames.length === 2 &&
      appliedNames[0] === '20261007000000_init' &&
      appliedNames[1] === '20261011212651_add_last_login_to_usuario';
    const isFullyUpdated = appliedNames.length === 3 &&
      CANONICAL_MIGRATIONS.every((m, idx) => appliedNames[idx] === m);

    if (isFullyUpdated) {
      return {
        supported: true,
        status: 'CANONICAL_FULLY_UPDATED',
        details: { appliedNames },
        message: 'Base canónica completamente actualizada con las 3 migraciones válidas y checksums verificados.'
      };
    }

    if (isAtInitialCanonical) {
      return {
        supported: true,
        status: 'CANONICAL_INITIAL_NEEDS_UPGRADE',
        details: { appliedNames },
        message: 'Base en estado inicial de semana 3 (20261007000000_init). Si contiene solicitudes, un migrate deploy directo fallará (23502) y borrará categorías; REQUIERE procedimiento conservador de actualización antes de resolver 20261011212651_add_last_login_to_usuario.'
      };
    }

    if (isAtSecondCanonical) {
      return {
        supported: true,
        status: 'CANONICAL_STEP2_READY_FOR_STEP3',
        details: { appliedNames },
        message: 'Base canónica en paso 2 (add_last_login aplicado). Lista para prisma migrate deploy del paso 3 (feat_rechazo_vuelve_a_pendiente).'
      };
    }

    // Si el orden o conjunto no coincide estrictamente con la secuencia esperada
    return {
      supported: false,
      status: 'CANONICAL_SEQUENCE_DISORDERED',
      details: { appliedNames },
      message: `ESTADO BLOQUEADO: El orden o conjunto de migraciones aplicadas (${appliedNames.join(' -> ')}) no coincide con la secuencia canónica estricta.`
    };
  } finally {
    await client.end();
  }
}

// Soporte para ejecución CLI directa: node migration-precheck.js [--url <connection_string>]
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const urlArgIndex = process.argv.indexOf('--url');
  const targetUrl = urlArgIndex !== -1 && process.argv[urlArgIndex + 1]
    ? process.argv[urlArgIndex + 1]
    : process.env.DATABASE_URL;

  if (!targetUrl) {
    console.error('Error: Debe proporcionar una URL de base de datos vía --url o variable de entorno DATABASE_URL.');
    process.exit(1);
  }

  // Enmascarar contraseña para salida
  let maskedUrl = targetUrl;
  try {
    const u = new URL(targetUrl);
    if (u.password) {
      u.password = '***';
    }
    maskedUrl = u.toString();
  } catch (_) {}

  console.log('====================================================');
  console.log('UrbanFix - Pre-check de Estado de Base de Datos');
  console.log('Destino:', maskedUrl);
  console.log('====================================================\n');

  inspectDatabaseState(targetUrl)
    .then(result => {
      console.log(`Estado:    ${result.status}`);
      console.log(`Soportado: ${result.supported ? 'SÍ (Listo para el flujo correspondiente)' : 'NO (BLOQUEADO)'}`);
      console.log(`Mensaje:   ${result.message}`);
      if (result.details && Object.keys(result.details).length > 0) {
        console.log('Detalles: ', JSON.stringify(result.details, null, 2));
      }
      process.exit(result.supported ? 0 : 1);
    })
    .catch(err => {
      console.error('Error ejecutando pre-check:', err.message);
      process.exit(1);
    });
}
