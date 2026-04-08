import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatbotModule } from './modules/chatbot/chatbot.module';

@Module({
  imports: [
    // 1. Load the .env file
    ConfigModule.forRoot({ isGlobal: true }),

    // 2. Connect to PostgreSQL
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      // Add '|| "5432"' to ensure there is always a string to parse
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      autoLoadEntities: true, // Automatically finds your "History" table
      synchronize: true,
      ssl: {
        rejectUnauthorized: false, // This allows RDS's self-signed cert
      }, // SYNC: Creates tables automatically (Development only)
    }),

    ChatbotModule,
  ],
})
export class AppModule {}
