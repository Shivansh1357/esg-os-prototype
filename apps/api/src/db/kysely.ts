import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

export const db = new Kysely<unknown>({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: process.env.DATABASE_URL
    })
  })
});


