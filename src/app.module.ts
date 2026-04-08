import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
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
    rejectUnauthorized: false, // Required for RDS unless you bundle the AWS CA certificate
  },
      // Enable SSL only when explicitly requested (e.g., managed DBs like RDS)
    //   ssl:
    //     process.env.DB_SSL === 'true'
    //       ? { rejectUnauthorized: false }
    //       : undefined, // SYNC: Creates tables automatically (Development only)
    // }),

    ChatbotModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
