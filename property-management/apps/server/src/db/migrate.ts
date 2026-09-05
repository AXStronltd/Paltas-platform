import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { db } from './index.js'
import { env } from '../env.js'

/** Applies every SQL file in ./drizzle that has not run yet. Safe to re-run. */
const here = dirname(fileURLToPath(import.meta.url))
migrate(db, { migrationsFolder: resolve(here, '../../drizzle') })
console.log(`Schema up to date · ${env.databaseUrl}`)
process.exit(0)
