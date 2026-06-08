const { Pool } = require('pg');
require('dotenv').config();

async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is missing');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to database...');
    await pool.query('SELECT 1');
    console.log('Connected! Applying incremental updates migration...');

    try {
      await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_hash text;`);
      console.log('✅ Added file_hash to documents');
    } catch (e) {
      console.log('⚠️ Failed to alter documents:', e.message);
    }

    console.log('Migration complete!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await pool.end();
  }
}

migrate();
