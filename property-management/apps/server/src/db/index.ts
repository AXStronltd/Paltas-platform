import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { env } from '../env.js'
import * as schema from './schema.js'

const sqlite = new Database(env.databaseUrl)

// WAL keeps readers from blocking the writer, which matters as soon as more than
// one browser tab is mutating through the API.
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })
export { schema, sqlite }
