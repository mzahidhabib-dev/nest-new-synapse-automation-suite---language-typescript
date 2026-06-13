const { Client } = require('pg');
const fs = require('fs');

async function migrate() {
  const connectionString = "postgresql://postgres.nehaeyzfqraseidafhss:user.me@pubA@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true";
  
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log("Connected to Supabase DB!");

    // Drop old tables
    console.log("Dropping old tables...");
    await client.query('DROP TABLE IF EXISTS "document_chunks" CASCADE');
    await client.query('DROP TABLE IF EXISTS "documents" CASCADE');
    await client.query('DROP TABLE IF EXISTS "chat_messages" CASCADE');
    await client.query('DROP TABLE IF EXISTS "chat_sessions" CASCADE');
    await client.query('DROP TABLE IF EXISTS "audit_logs" CASCADE');
    await client.query('DROP TABLE IF EXISTS "rate_limits" CASCADE');
    await client.query('DROP TABLE IF EXISTS "users" CASCADE');
    await client.query('DROP TABLE IF EXISTS "tenants" CASCADE');

    // Read and execute migration script
    const sql = fs.readFileSync('migrate_nobom.sql', 'utf8');
    console.log("Executing migration script...");
    await client.query(sql);

    console.log("Migration complete!");
  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await client.end();
  }
}

migrate();
