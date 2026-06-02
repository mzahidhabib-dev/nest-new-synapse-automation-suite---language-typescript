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
    console.log('Connected! Applying migrations...');

    // 1. Add client_id to documents
    try {
      await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS client_id text DEFAULT 'default-client';`);
      console.log('✅ Added client_id to documents');
    } catch (e) {
      console.log('⚠️ Failed to alter documents:', e.message);
    }

    // 2. Create chat_sessions
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS chat_sessions (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          client_id text NOT NULL,
          created_at timestamptz DEFAULT now()
        );
      `);
      console.log('✅ Created chat_sessions table');
    } catch (e) {
      console.log('⚠️ Failed to create chat_sessions:', e.message);
    }

    // 3. Create chat_messages
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS chat_messages (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          session_id uuid REFERENCES chat_sessions(id) ON DELETE CASCADE,
          role text NOT NULL,
          content text NOT NULL,
          created_at timestamptz DEFAULT now()
        );
      `);
      console.log('✅ Created chat_messages table');
    } catch (e) {
      console.log('⚠️ Failed to create chat_messages:', e.message);
    }

    console.log('Migration complete!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await pool.end();
  }
}

migrate();
