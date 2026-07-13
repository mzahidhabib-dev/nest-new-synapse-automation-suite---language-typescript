const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

async function createAdmin() {
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  
  // 1. Create or find the System tenant
  let tenant = await prisma.tenant.findUnique({ where: { slug: 'system-admin' } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { name: 'System Admin', slug: 'system-admin', plan: 'enterprise' }
    });
  }

  // 2. Hash password
  const passwordHash = await bcrypt.hash('Admin123!', 12);

  // 3. Upsert Admin user
  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@synapse.com' } },
    update: { role: 'admin', passwordHash },
    create: {
      tenantId: tenant.id,
      email: 'admin@synapse.com',
      passwordHash,
      role: 'admin'
    }
  });

  console.log('✅ Admin Account Created/Updated!');
  console.log('Company Name: System Admin');
  console.log('Email: admin@synapse.com');
  console.log('Password: Admin123!');
  
  await prisma.$disconnect();
  await pool.end();
}

createAdmin().catch(e => { console.error(e); process.exit(1); });
