import { execSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { env } from '../env.js'

/** Drop the database file, reapply migrations, reseed. */
for (const suffix of ['', '-wal', '-shm']) {
  const file = env.databaseUrl + suffix
  if (existsSync(file)) rmSync(file)
}
console.log(`Removed ${env.databaseUrl}`)

execSync('npx tsx src/db/migrate.ts', { stdio: 'inherit' })
execSync('npx tsx src/db/seed.ts', { stdio: 'inherit' })
