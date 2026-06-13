import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const tenant1 = await prisma.tenant.create({
    data: {
      name: 'Acme Corp',
      slug: 'acme',
      plan: 'pro'
    }
  });

  const tenant2 = await prisma.tenant.create({
    data: {
      name: 'Stark Industries',
      slug: 'stark',
      plan: 'free'
    }
  });

  console.log(`Created tenants: ${tenant1.slug}, ${tenant2.slug}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
