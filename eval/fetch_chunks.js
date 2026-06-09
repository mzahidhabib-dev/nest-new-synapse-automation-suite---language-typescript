const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
const pool = new Pool({ 
  connectionString: url,
  ssl: { rejectUnauthorized: false }
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function fetchChunks() {
  console.log('Connecting to database via Prisma...');
  try {
    // Fetch 10 random chunks that are long enough
    const chunks = await prisma.$queryRaw`
      SELECT content FROM document_chunks 
      WHERE length(content) > 100 
      ORDER BY RANDOM() 
      LIMIT 10;
    `;

    const chunkTexts = chunks.map(c => c.content);
    
    const outputPath = path.resolve(__dirname, 'chunks.json');
    fs.writeFileSync(outputPath, JSON.stringify(chunkTexts, null, 2));
    
    console.log(`✅ Successfully exported ${chunkTexts.length} chunks to chunks.json`);
  } catch (error) {
    console.error('Failed to fetch chunks:', error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

fetchChunks();
