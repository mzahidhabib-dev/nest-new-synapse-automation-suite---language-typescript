import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

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

  @CreateDateColumn()
  createdAt: Date;
}