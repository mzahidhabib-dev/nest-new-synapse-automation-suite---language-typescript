import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors();

  // Create the standard PG Pool and wrap it in the Prisma Adapter
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter }); 
  
  try {
    const testDoc = await prisma.document.findMany({ take: 1 });
    console.log('Database connected successfully!', testDoc);
  } catch (error) {
    console.error('Database connection failed:', error);
  } finally {
    await prisma.$disconnect(); 
  }

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();