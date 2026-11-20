import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
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
 * Runs a read-only diff between a Prisma snapshot schema and the target database.
 * Does not write, modify, or require shadow databases.
 * Returns { inSync: boolean, diff: string }
 */
export function diffAgainstSnapshot(connectionString, snapshotSchemaRelativePath) {
  const snapshotPath = path.resolve(backendRoot, snapshotSchemaRelativePath);
  try {
    const output = execSync(
      `./node_modules/.bin/prisma migrate diff --from-schema ${snapshotPath} --to-config-datasource --exit-code`,
      {
        cwd: backendRoot,
        env: { ...process.env, DATABASE_URL: connectionString },
        encoding: 'utf-8',
        stdio: 'pipe'
      }
    );
    return { inSync: true, diff: output.trim() };
  } catch (err) {
    const combinedOutput = (err.stdout || '') + (err.stderr || '');
    return { inSync: false, diff: combinedOutput.trim(), exitCode: err.status };
  }
}

/**
 * Inspects a PostgreSQL database to categorize its Prisma migration state,
 * validate checksums against real disk files, and perform an exhaustive read-only
 * physical schema comparison against snapshot datamodels.
 *
 * @param {string} connectionString Database URL
 * @returns {Promise<{supported: boolean, status: string, details: any, message: string}>}
 */
export async function inspectDatabaseState(connectionString) {
  if (!connectionString) {
    throw new Error('inspectDatabaseState requiere una cadena de conexión válida.');
  }

  // 1. Restricción estricta de esquema: solo esquema 'public' soportado
  try {
    const parsed = new URL(connectionString);
    const schemaParam = parsed.searchParams.get('schema');
    if (schemaParam && schemaParam.toLowerCase() !== 'public') {
      return {
        supported: false,
        status: 'UNSUPPORTED_SCHEMA',
        details: { schema: schemaParam },
        message: `ESTADO BLOQUEADO: Esquema '${schemaParam}' no soportado. La arquitectura de UrbanFix opera exclusivamente sobre el esquema 'public'.`
      };
    }
    const searchPath = parsed.searchParams.get('search_path');
    if (searchPath && !searchPath.toLowerCase().startsWith('public')) {
      return {
        supported: false,
        status: 'UNSUPPORTED_SEARCH_PATH',
        details: { search_path: searchPath },
        message: `ESTADO BLOQUEADO: search_path '${searchPath}' no soportado. Debe iniciar con 'public'.`
      };
    }
  } catch (urlErr) {
    throw new Error(`URL de conexión inválida: ${urlErr.message}`);
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    // 2. Verificar si existe la tabla public._prisma_migrations de forma cualificada
    const regCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = '_prisma_migrations'
      ) as exists;
    `);

    const hasMigrationsTable = regCheck.rows[0].exists;

    // 3. Comprobar tablas en esquema public (excluyendo únicamente public._prisma_migrations)
    const tablesCheck = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name != '_prisma_migrations';
    `);
    const userTables = tablesCheck.rows.map(r => r.table_name);

    // 4. Comprobar tipos de datos / enums en esquema public
    const enumsCheck = await client.query(`
      SELECT t.typname
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typtype = 'e';
    `);
    const userEnums = enumsCheck.rows.map(r => r.typname);

    // Si NO existe public._prisma_migrations:
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
          message: 'ESTADO NO BASELINEADO: Existen tablas o enums en esquema public sin historial public._prisma_migrations (posible prisma db push o DDL manual). Requiere verificación previa estricta con prisma migrate diff antes de baselining ordenado.'
        };
      }
    }

    // 5. Si existe public._prisma_migrations, auditar su contenido completo con consulta cualificada
    const migCheck = await client.query(`
      SELECT id, migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
      FROM public._prisma_migrations
      ORDER BY started_at ASC;
    `);
    const records = migCheck.rows;

    if (records.length === 0) {
      if (userTables.length === 0 && userEnums.length === 0) {
        return {
          supported: true,
          status: 'CLEAN_DATABASE',
          details: { userTables: [], userEnums: [] },
          message: 'Tabla public._prisma_migrations vacía y sin objetos: lista para prisma migrate deploy directo.'
        };
      } else {
        return {
          supported: false,
          status: 'EMPTY_LEDGER_WITH_OBJECTS',
          details: { userTables, userEnums },
          message: 'ESTADO BLOQUEADO: public._prisma_migrations está vacía pero existen tablas/enums en public. Requiere verificación de diff previa a cualquier mutación.'
        };
      }
    }

    const migrationNames = records.map(r => r.migration_name);

    // 5.1. Detectar migraciones legacy / espurias conocidas
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

    // 5.2. Detectar migraciones desconocidas (G1, G6)
    const unknownMigrations = migrationNames.filter(name => !CANONICAL_MIGRATIONS.includes(name));
    if (unknownMigrations.length > 0) {
      return {
        supported: false,
        status: 'UNKNOWN_MIGRATIONS_IN_LEDGER',
        details: { unknownMigrations, allMigrations: migrationNames },
        message: `ESTADO BLOQUEADO: Se detectaron migraciones desconocidas en _prisma_migrations (${unknownMigrations.join(', ')}). Abortando antes de mutar.`
      };
    }

    // 5.3. Detectar migraciones con rollback registrado (G3)
    const rolledBack = records.filter(r => r.rolled_back_at !== null);
    if (rolledBack.length > 0) {
      return {
        supported: false,
        status: 'ROLLED_BACK_MIGRATIONS_IN_LEDGER',
        details: { rolledBack: rolledBack.map(r => r.migration_name) },
        message: `ESTADO BLOQUEADO: Existen migraciones marcadas con rolled_back_at (${rolledBack.map(r => r.migration_name).join(', ')}). Requiere diagnóstico manual.`
      };
    }

    // 5.4. Detectar migraciones fallidas pendientes (finished_at NULL y rolled_back_at NULL)
    const failedMigrations = records.filter(r => !r.finished_at && !r.rolled_back_at);
    if (failedMigrations.length > 0) {
      return {
        supported: false,
        status: 'FAILED_MIGRATION_PENDING',
        details: { failedMigrations: failedMigrations.map(f => f.migration_name) },
        message: `ESTADO BLOQUEADO: Existen migraciones en estado fallido (${failedMigrations.map(f => f.migration_name).join(', ')}). Prisma arrojará P3009 en deploy. Requiere diagnóstico y backup.`
      };
    }

    // 5.5. Filtrar las migraciones efectivamente aplicadas con éxito
    const appliedRecords = records.filter(r => r.finished_at !== null && r.rolled_back_at === null);
    const appliedNames = appliedRecords.map(r => r.migration_name);

    // 5.6. Validar CHECKSUMS de todas las migraciones aplicadas contra los archivos reales en disco (G4)
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
        message: `ESTADO BLOQUEADO: Checksums en base no coinciden con los archivos en disco para: ${checksumMismatches.map(c => c.migration).join(', ')}. Indica modificación posterior o drift en el ledger.`
      };
    }

    // 5.7. Validar orden y secuencia canónica estricta (G2)
    const isValidPrefix = appliedNames.every((name, idx) => name === CANONICAL_MIGRATIONS[idx]);
    if (!isValidPrefix) {
      return {
        supported: false,
        status: 'CANONICAL_SEQUENCE_DISORDERED',
        details: { appliedNames },
        message: `ESTADO BLOQUEADO: El orden o secuencia de migraciones aplicadas (${appliedNames.join(' -> ')}) no coincide con la secuencia canónica estricta.`
      };
    }

    // 5.8. Comparación read-only completa contra snapshots de esquema Prisma
    const isAtInitialCanonical = appliedNames.length === 1 && appliedNames[0] === '20261007000000_init';
    const isAtSecondCanonical = appliedNames.length === 2 &&
      appliedNames[0] === '20261007000000_init' &&
      appliedNames[1] === '20261011212651_add_last_login_to_usuario';
    const isFullyUpdated = appliedNames.length === 3 &&
      CANONICAL_MIGRATIONS.every((m, idx) => appliedNames[idx] === m);

    // Caso Fully Updated (Paso 3): comparar físicamente con step3-final.prisma (G5)
    if (isFullyUpdated) {
      const diffResult = diffAgainstSnapshot(connectionString, 'tests/migrations/schemas/step3-final.prisma');
      if (!diffResult.inSync) {
        return {
          supported: false,
          status: 'CANONICAL_SCHEMA_DRIFT',
          details: { diff: diffResult.diff, userTables },
          message: `ESTADO BLOQUEADO: El ledger indica CANONICAL_FULLY_UPDATED pero el esquema físico diverge del modelo final (posible tabla/columna faltante o alterada).\nDiff:\n${diffResult.diff}`
        };
      }

      return {
        supported: true,
        status: 'CANONICAL_FULLY_UPDATED',
        details: { appliedNames, userTables },
        message: 'Base canónica completamente actualizada con las 3 migraciones válidas, checksums y esquema físico 100% verificados sin diferencias.'
      };
    }

    // Caso Initial Canonical (Paso 1): comparar físicamente con step1-initial.prisma (R6 / qa_f2_mislabeled)
    if (isAtInitialCanonical) {
      const diffResult = diffAgainstSnapshot(connectionString, 'tests/migrations/schemas/step1-initial.prisma');
      if (!diffResult.inSync) {
        return {
          supported: false,
          status: 'CANONICAL_INITIAL_SCHEMA_DRIFT',
          details: { diff: diffResult.diff, userTables },
          message: `ESTADO BLOQUEADO: El ledger indica 20261007000000_init pero el esquema físico diverge del modelo canónico inicial (posible esquema legacy o mal etiquetado).\nDiff:\n${diffResult.diff}`
        };
      }

      return {
        supported: true,
        status: 'CANONICAL_INITIAL_NEEDS_UPGRADE',
        details: { appliedNames, userTables },
        message: 'Base en estado inicial canónico de semana 3 (20261007000000_init) con esquema físico y checksums confirmados al 100%. Si contiene solicitudes, un migrate deploy directo fallará (23502); REQUIERE procedimiento conservador transaccional antes de resolver 20261011212651_add_last_login_to_usuario.'
      };
    }

    // Caso Step 2 Canonical (Paso 2): comparar físicamente con step2-add-last-login.prisma
    if (isAtSecondCanonical) {
      const diffResult = diffAgainstSnapshot(connectionString, 'tests/migrations/schemas/step2-add-last-login.prisma');
      if (!diffResult.inSync) {
        return {
          supported: false,
          status: 'CANONICAL_STEP2_SCHEMA_DRIFT',
          details: { diff: diffResult.diff, userTables },
          message: `ESTADO BLOQUEADO: El ledger indica paso 2 aplicado pero el esquema físico diverge de step2-add-last-login.prisma.\nDiff:\n${diffResult.diff}`
        };
      }

      return {
        supported: true,
        status: 'CANONICAL_STEP2_READY_FOR_STEP3',
        details: { appliedNames },
        message: 'Base canónica en paso 2 (add_last_login aplicado) con esquema físico verificado. Lista para prisma migrate deploy del paso 3 (feat_rechazo_vuelve_a_pendiente).'
      };
    }

    return {
      supported: false,
      status: 'CANONICAL_PARTIAL_UNSUPPORTED',
      details: { appliedNames },
      message: `ESTADO BLOQUEADO: Estado parcial no reconocido de migraciones canónicas: ${appliedNames.join(', ')}`
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
