import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import pg from 'pg'

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[]
}

export interface Database {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>>
  exec(sql: string): Promise<void>
  transaction<T>(work: (database: Database) => Promise<T>): Promise<T>
  close(): Promise<void>
}

class EmbeddedDatabase implements Database {
  constructor(private readonly pglite: PGlite) {}

  async query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const result = await this.pglite.query<T>(text, params)
    return { rows: result.rows }
  }

  async exec(sql: string): Promise<void> {
    await this.pglite.exec(sql)
  }

  async transaction<T>(work: (database: Database) => Promise<T>): Promise<T> {
    return this.pglite.transaction(async transaction => work(new EmbeddedDatabase(transaction as unknown as PGlite)))
  }

  async close(): Promise<void> {
    await this.pglite.close()
  }
}

class PostgresDatabase implements Database {
  constructor(private readonly pool: pg.Pool) {}

  async query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const result = await this.pool.query(text, params)
    return { rows: result.rows as T[] }
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql)
  }

  async transaction<T>(work: (database: Database) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const transaction: Database = {
        query: async <R = Record<string, unknown>>(text: string, params: unknown[] = []) => {
          const result = await client.query(text, params)
          return { rows: result.rows as R[] }
        },
        exec: async (sql: string) => { await client.query(sql) },
        transaction: async <R>(nested: (database: Database) => Promise<R>) => nested(transaction),
        close: async () => { client.release() },
      }
      const result = await work(transaction)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}

export async function createDatabase(options: { inMemory?: boolean; dataDir?: string; databaseUrl?: string } = {}): Promise<Database> {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL
  const database: Database = databaseUrl
    ? new PostgresDatabase(new pg.Pool({ connectionString: databaseUrl, max: 10 }))
    : new EmbeddedDatabase(new PGlite(options.inMemory ? undefined : options.dataDir ?? process.env.WIKI_DATA_DIR ?? './data/pgdata'))

  const migrationPath = fileURLToPath(new URL('./migrations/001_initial.sql', import.meta.url))
  await database.exec(await readFile(migrationPath, 'utf8'))
  return database
}
