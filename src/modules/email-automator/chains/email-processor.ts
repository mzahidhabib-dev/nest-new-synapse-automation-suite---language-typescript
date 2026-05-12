// chains/email-processor.ts
import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import {
  ABTestLogSchema,
  ClassificationSchema,
  JudgeSchema,
  ReplySchema,
} from '../schemas/zod-schemas';
import { buildClassifierPrompt } from '../prompts/classifier.prompt';
import { buildReplyPrompt } from '../prompts/reply-drafter.prompt';
import { buildJudgePrompt } from '../prompts/judge.prompt';
import { ABTestConfig } from '../config/ab-test.config';

@Injectable()
export class EmailProcessorService {
  private readonly logger = new Logger(EmailProcessorService.name);

  constructor(private readonly llmService: LlmService) {}

  async processEmail(emailText: string) {
    const startTime = Date.now();

    // CHAIN 1: Classify
    const emailId = Buffer.from(emailText.substring(0, 100)).toString('base64');
    const classifierTest = ABTestConfig.tests.classifier_tone;
    let testGroup: 'A' | 'B';
    if (classifierTest.enabled) {
      testGroup = ABTestConfig.getGroup(emailId, 'classifier_tone');
    } else {
      testGroup = 'A';
    }
    const classificationPrompt = buildClassifierPrompt(emailText, testGroup);
    const classificationRaw = await this.llmService.callGemini(classificationPrompt);
    const classification = ClassificationSchema.parse(JSON.parse(classificationRaw));

    const promptVersion =
      testGroup === 'A' ? classifierTest.versionA : classifierTest.versionB;
    const abTestLogParsed = ABTestLogSchema.safeParse({
      test_name: 'classifier_tone',
      group: testGroup,
      prompt_version: promptVersion,
      human_escalation:
        classification.requires_human || classification.confidence < 0.7,
      processing_time_ms: Date.now() - startTime,
    });
    if (abTestLogParsed.success) {
      this.logger.debug(`[AB_TEST] ${JSON.stringify(abTestLogParsed.data)}`);
    } else {
      this.logger.warn(`[AB_TEST] invalid payload: ${abTestLogParsed.error.message}`);
    }

    // Early exit: Spam
    if (classification.category === 'spam') {
      return {
        action: 'ignored',
        reason: 'spam_detected',
        classification,
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Early exit: Needs human review
    if (classification.requires_human || classification.confidence < 0.7) {
      return {
        action: 'escalated_to_human',
        reason: 'low_confidence_or_requires_human',
        classification,
        processingTimeMs: Date.now() - startTime,
      };
    }

    // CHAIN 2: Draft reply
    const replyPrompt = buildReplyPrompt(emailText, classification);
    const replyRaw = await this.llmService.callGemini(replyPrompt);
    const reply = ReplySchema.parse(JSON.parse(replyRaw));

    // CHAIN 3: Judge
    const judgePrompt = buildJudgePrompt(emailText, classification, reply.draft_reply);
    const judgeRaw = await this.llmService.callGroq(judgePrompt);
    const judgeResult = JudgeSchema.parse(JSON.parse(judgeRaw));

    const judgeLogParsed = ABTestLogSchema.safeParse({
      test_name: 'classifier_tone',
      group: testGroup,
      prompt_version: promptVersion,
      judge_score: judgeResult.overall_score,
      human_escalation: classification.requires_human || classification.confidence < 0.7,
      processing_time_ms: Date.now() - startTime,
    });
    if (judgeLogParsed.success) {
      this.logger.debug(`[AB_TEST_AFTER_JUDGE] ${JSON.stringify(judgeLogParsed.data)}`);
    }

    let finalAction: string;
    let finalReply: string | null = null;

    if (judgeResult.decision === 'accept') {
      finalAction = 'sent';
      finalReply = reply.draft_reply;
    } else if (judgeResult.decision === 'edit') {
      finalAction = 'needs_edit';
      finalReply = reply.draft_reply;
    } else {
      finalAction = 'escalated_to_human';
      finalReply = reply.draft_reply;
    }

    return {
      action: finalAction,
      reply: finalReply,
      classification,
      judge: judgeResult,
      processingTimeMs: Date.now() - startTime,
    };
  }
}