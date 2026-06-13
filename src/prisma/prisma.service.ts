import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private pool: Pool;

  constructor() {
    const url = process.env.DATABASE_URL;
    if (!url) {
      console.error('CRITICAL: Database URL is missing!');
    }
    
    // Shared connection pool
    const pool = new Pool({ 
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 10, // Limit connections to avoid Supabase exhaustion
    });

    const adapter = new PrismaPg(pool);
    
    // Pass the adapter directly to the PrismaClient constructor
    super({ adapter });
    this.pool = pool;
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Successfully connected to the database.');
    } catch (e) {
      this.logger.error('Failed to connect to database', e);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    if (this.pool) {
      await this.pool.end();
    }
  }
}
