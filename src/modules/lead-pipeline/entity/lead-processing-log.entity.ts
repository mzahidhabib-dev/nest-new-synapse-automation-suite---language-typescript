// src/lead-pipeline/entity/lead-processing-log.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('lead_processing_logs')
export class LeadProcessingLog {
  @PrimaryGeneratedColumn('uuid') // Switched to UUID for production security and scaling
  id: string;

  @Column('text')
  emailText: string;

  // Indexing jsonb fields for rapid tracking and A/B performance lookup later
 
  // @Index({ jsonbpath: true })
  // @Index({ type: 'gin' })
  @Column('jsonb', { nullable: true })
  classification: any; // Stores categories (hot_lead, warm_lead, etc.) and extracted BANT data

  @Column('text', { nullable: true })
  replyDraft: string | null;

  @Column('jsonb', { nullable: true })
  judgeResult: any; // Stores accuracy, safety scores, and human check evaluations

  @Column('jsonb', { nullable: true })
  abTestMetadata: any; // Tracks deterministic test groups ('A' vs 'B') and prompt variations

  @Column({ length: 50 })
  actionTaken: string; // e.g., 'sent_auto_reply', 'escalated_to_human', 'ignored_spam'

  @Column('integer')
  processingTimeMs: number; // Monitors latency optimization across multi-model executions

  @CreateDateColumn({ type: 'timestamptz' }) // Time-zone aware timestamps for clean global analytics
  createdAt: Date;
}