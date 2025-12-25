const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

pool.on('connect', () => console.log('PostgreSQL connected'));
pool.on('error', err => {
  console.error('DB error', err);
  process.exit(1);
});

module.exports = pool;
