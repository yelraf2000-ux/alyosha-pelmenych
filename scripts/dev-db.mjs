// Local development database: a private Postgres cluster in .devdb/ on port 54329.
// It uses the Postgres binaries already installed on this machine, accepts local connections
// without a password, and is separate from any other Postgres you run.
//
//   node scripts/dev-db.mjs start   create it if needed, start it, create the dev and test databases
//   node scripts/dev-db.mjs stop
//
// Set PG_BIN if the binaries are not on PATH and not under C:\Program Files\PostgreSQL\<version>\bin.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = '54329';
const DATABASES = ['alyosha', 'alyosha_test'];
const dataDir = fileURLToPath(new URL('../.devdb', import.meta.url));
const exe = process.platform === 'win32' ? '.exe' : '';

function findBin() {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  const onPath = spawnSync('pg_ctl', ['--version']);
  if (onPath.status === 0) return '';
  const root = 'C:\\Program Files\\PostgreSQL';
  if (existsSync(root)) {
    const versions = readdirSync(root).sort((a, b) => Number(b) - Number(a));
    for (const version of versions) {
      const bin = join(root, version, 'bin');
      if (existsSync(join(bin, 'pg_ctl' + exe))) return bin;
    }
  }
  throw new Error('Postgres binaries not found. Install PostgreSQL or set PG_BIN to its bin folder.');
}

const bin = findBin();
const tool = (name) => (bin ? join(bin, name + exe) : name);
const run = (name, args, options = {}) => execFileSync(tool(name), args, { stdio: 'inherit', ...options });

function isRunning() {
  return spawnSync(tool('pg_ctl'), ['status', '-D', dataDir]).status === 0;
}

const command = process.argv[2];

if (command === 'start') {
  if (!existsSync(join(dataDir, 'PG_VERSION'))) {
    run('initdb', ['-D', dataDir, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C']);
  }
  if (!isRunning()) {
    // stdio is not inherited: the server keeps inherited handles open and the command would never return.
    run('pg_ctl', ['start', '-D', dataDir, '-w', '-l', join(dataDir, 'server.log'), '-o', `-p ${PORT} -c listen_addresses=localhost`], {
      stdio: 'ignore',
    });
  }
  for (const name of DATABASES) {
    const exists = execFileSync(
      tool('psql'),
      ['-h', 'localhost', '-p', PORT, '-U', 'postgres', '-tAc', `select 1 from pg_database where datname = '${name}'`],
      { encoding: 'utf8' },
    ).trim();
    if (exists !== '1') run('createdb', ['-h', 'localhost', '-p', PORT, '-U', 'postgres', name]);
  }
  console.log(`\nDev database is running: postgres://postgres@localhost:${PORT}/alyosha`);
} else if (command === 'stop') {
  if (isRunning()) run('pg_ctl', ['stop', '-D', dataDir, '-m', 'fast']);
  console.log('Dev database stopped.');
} else {
  console.error('Usage: node scripts/dev-db.mjs start|stop');
  process.exit(1);
}
