import pg from 'pg';

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
 * Inspects a PostgreSQL database to categorize its Prisma migration state
 * and prevent unsafe mutations or blind resolves.
 *
 * @param {string} connectionString Database URL
 * @returns {Promise<{supported: boolean, status: string, details: any, message: string}>}
 */
export async function inspectDatabaseState(connectionString) {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    // Check if _prisma_migrations exists
    const regCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = '_prisma_migrations'
      ) as exists;
    `);

    const hasMigrationsTable = regCheck.rows[0].exists;

    // Check user tables
    const tablesCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name NOT LIKE '\\_%';
    `);
    const userTables = tablesCheck.rows.map(r => r.table_name);

    if (!hasMigrationsTable) {
      if (userTables.length === 0) {
        return {
          supported: true,
          status: 'CLEAN_DATABASE',
          details: { userTables: [] },
          message: 'Base vacía: lista para prisma migrate deploy directo.'
        };
      } else {
        return {
          supported: true,
          status: 'DB_PUSH_UNBASELINED',
          details: { userTables },
          message: 'Tablas de aplicación existentes sin historial _prisma_migrations (posible prisma db push). Requiere verificación de diff previa a baselining.'
        };
      }
    }

    // Inspect _prisma_migrations
    const migCheck = await client.query(`
      SELECT id, migration_name, finished_at, rolled_back_at, applied_steps_count
      FROM _prisma_migrations
      ORDER BY started_at ASC;
    `);
    const records = migCheck.rows;
    const migrationNames = records.map(r => r.migration_name);

    // Detect legacy migrations
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

    // Detect failed migrations
    const failedMigrations = records.filter(r => !r.finished_at && !r.rolled_back_at);
    if (failedMigrations.length > 0) {
      return {
        supported: false,
        status: 'FAILED_MIGRATION_PENDING',
        details: { failedMigrations },
        message: `ESTADO BLOQUEADO: Existen migraciones en estado fallido (${failedMigrations.map(f => f.migration_name).join(', ')}). Requiere diagnóstico manual y backup.`
      };
    }

    // Check canonical state
    const isAtInitialCanonical = migrationNames.length === 1 && migrationNames[0] === '20261007000000_init';
    const isFullyUpdated = CANONICAL_MIGRATIONS.every(m => migrationNames.includes(m));

    if (isFullyUpdated) {
      return {
        supported: true,
        status: 'CANONICAL_FULLY_UPDATED',
        details: { migrationNames },
        message: 'Base canónica completamente actualizada con las 3 migraciones válidas.'
      };
    }

    if (isAtInitialCanonical) {
      return {
        supported: true,
        status: 'CANONICAL_INITIAL_NEEDS_UPGRADE',
        details: { migrationNames },
        message: 'Base en estado inicial de semana 3 (20261007000000_init). Si tiene datos en SolicitudServicio, requiere ALTER conservador de columna categoria antes de resolver 20261011212651_add_last_login_to_usuario.'
      };
    }

    return {
      supported: true,
      status: 'CANONICAL_PARTIAL',
      details: { migrationNames },
      message: `Base canónica con migraciones parciales aplicadas: ${migrationNames.join(', ')}`
    };
  } finally {
    await client.end();
  }
}
