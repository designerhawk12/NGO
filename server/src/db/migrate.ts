import { closePool } from './pool';
import { runMigrations, type MigrationMode } from './migrationRunner';

const mode = process.argv[2];
if (mode !== 'up' && mode !== 'status') {
  throw new Error('Use migrate.ts up or migrate.ts status.');
}

runMigrations(mode as MigrationMode)
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closePool());
