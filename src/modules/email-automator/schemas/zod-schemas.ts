// schemas/zod-schemas.ts
import { z } from 'zod';

export const ClassificationSchema = z.object({
  category: z.enum(['refund_request', 'technical_issue', 'sales_inquiry', 'spam']),
  confidence: z.number().min(0).max(1),
  extracted_order_id: z.string().optional(),
  extracted_email: z.string().email().optional(),
  requires_human: z.boolean(),
  reasoning_summary: z.string().max(200),
});

export const ReplySchema = z.object({
  draft_reply: z.string().min(10).max(500),
  tone_used: z.enum(['empathetic', 'professional', 'urgent']),
  includes_action_item: z.boolean(),
});

export const JudgeSchema = z.object({
  scores: z.object({
    accuracy: z.number().min(0).max(10),
    tone: z.number().min(0).max(10),
    completeness: z.number().min(0).max(10),
    safety: z.number().min(0).max(10),
  }),
  overall_score: z.number().min(0).max(10),
  decision: z.enum(['accept', 'edit', 'reject']),
  feedback: z.string(),
});

// schema for A/B test logging
export const ABTestLogSchema = z.object({
    test_name: z.string(),
    group: z.enum(['A', 'B']),
    prompt_version: z.string(),
    classification_accuracy: z.number().optional(),
    judge_score: z.number().optional(),
    human_escalation: z.boolean(),
    processing_time_ms: z.number(),
  });

// Type exports
export type Classification = z.infer<typeof ClassificationSchema>;
export type Reply = z.infer<typeof ReplySchema>;
export type JudgeResult = z.infer<typeof JudgeSchema>;
export type ABTest = z.infer<typeof ABTestLogSchema>;