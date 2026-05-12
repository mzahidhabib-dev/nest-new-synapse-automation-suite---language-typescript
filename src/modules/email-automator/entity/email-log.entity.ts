// entity/email-log.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('email_processing_logs')
export class EmailProcessingLog {
  @PrimaryGeneratedColumn()
  id: number;
  
  @Column('text')
  emailText: string;
  
  @Column('jsonb', { nullable: true })
  classification: any;
  
  @Column('text', { nullable: true })
  replyDraft: string;
  
  @Column('jsonb', { nullable: true })
  judgeResult: any;
  
  @Column()
  actionTaken: string;
  
  @Column()
  processingTimeMs: number;
  
  @CreateDateColumn()
  createdAt: Date;
}