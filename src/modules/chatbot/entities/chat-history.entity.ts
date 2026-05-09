import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Index('IDX_CHAT_HISTORY_EMAIL_CREATED_AT', ['email', 'createdAt'])
@Entity('chatbot_history')
export class ChatHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  email: string;

  @Column()
  role: 'user' | 'assistant'; // Tells us who said what

  @Column({ type: 'text' })
  content: string;

  @Column({ nullable: true })
  model?: string;

  @Column({ type: 'int', nullable: true })
  promptTokens?: number;

  @Column({ type: 'int', nullable: true })
  completionTokens?: number;

  @Column({ type: 'int', nullable: true })
  totalTokens?: number;

  @Column({ type: 'decimal', precision: 12, scale: 6, nullable: true })
  estimatedCostUsd?: string;

  @CreateDateColumn()
  createdAt: Date;
}
