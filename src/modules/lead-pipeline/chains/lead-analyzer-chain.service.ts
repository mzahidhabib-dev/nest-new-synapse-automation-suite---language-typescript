// src/lead-pipeline/lead-analyzer-chain.service.ts
import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LlmService } from '../../llm/llm.service'; // Adjust this import path to match your local project layout
import { LeadProcessingLog } from '../entity/lead-processing-log.entity';
import { ABTestConfig } from '../config/ab-test.config';
import { parseJsonObjectFromLlmText } from '../utils/parse-llm-json';
import {
  LeadClassificationSchema,
  LeadReplySchema,
  LeadJudgeSchema,
  ABTestLogSchema,
} from '../schemas/zod-schemas';

// Global utility references for build loops matching prompt exports dynamically
import { buildClassifierPrompt } from '../prompts/classifier.prompt';
import { buildReplyPrompt } from '../prompts/reply-drafter.prompt';
import { buildJudgePrompt } from '../prompts/judge.prompt';



@Injectable()
export class LeadAnalyzerChainService {
  // Named logger context ensures clear trace lines inside your Railway container logs
  private readonly logger = new Logger(LeadAnalyzerChainService.name);

  constructor(
    private readonly llmService: LlmService,
    @InjectRepository(LeadProcessingLog)
    private readonly logRepository: Repository<LeadProcessingLog>,
  ) { }

  /**
   * Main pipeline orchestrator. Executes Chain 1 (Gemini) -> Chain 2 (Gemini) -> Chain 3 (Groq).
   * Parses, validates, audits, and persists metrics natively to Postgres.
   * * @param emailText Raw body content of incoming email lead
   */
  async processLeadPipeline(emailText: string): Promise<any> {
    const startTime = Date.now();

    // Create a unique deterministic signature based on a short base64 string sample of the text
    const leadSignature = Buffer.from(emailText.substring(0, 80)).toString('base64url');

    let activeGroup: 'A' | 'B' = 'A';
    const experimentKey = 'lead_classifier_strategy';
    const testConfig = ABTestConfig.tests[experimentKey];

    // Determine A/B test routing group deterministically
    if (testConfig?.enabled) {
      activeGroup = ABTestConfig.getGroup(leadSignature, experimentKey);
    }

    const promptVersion = activeGroup === 'A' ? testConfig.versionA : testConfig.versionB;

    // Track execution states transparently across multi-layered try-catch loops
    let classificationResult: any = null;
    let replyDraftResult: any = null;
    let judgeResult: any = null;
    let finalAction = 'escalated_to_human';

    try {
      // ----------------------------------------------------------------
      // CHAIN 1: EXTRACT & CLASSIFY LEAD INTENT (Gemini)
      // ----------------------------------------------------------------
      const classifierPrompt = buildClassifierPrompt(emailText, activeGroup);
      const rawClassifierOutput = await this.llmService.callGemini(classifierPrompt);

      // Extract structural JSON and parse using Zod validation schema barriers
      classificationResult = LeadClassificationSchema.parse(
        parseJsonObjectFromLlmText(rawClassifierOutput),
      );

      // Handle Early Exit 1: Inbound Lead is explicitly flag-matched as Spam
      if (classificationResult.category === 'spam') {
        finalAction = 'ignored_spam';
        return await this.saveAndReturnPayload({
          emailText, classification: classificationResult, replyDraft: null,
          judgeResult: null, actionTaken: finalAction, startTime, activeGroup, promptVersion
        });
      }

      // Handle Early Exit 2: Unclear intent or explicitly requires manual routing
      if (classificationResult.requires_human || classificationResult.confidence < 0.70) {
        finalAction = 'escalated_low_confidence';
        return await this.saveAndReturnPayload({
          emailText, classification: classificationResult, replyDraft: null,
          judgeResult: null, actionTaken: finalAction, startTime, activeGroup, promptVersion
        });
      }

      // ----------------------------------------------------------------
      // CHAIN 2: DRAFT CONVERSION ENGAGEMENT EMAIL (Gemini)
      // ----------------------------------------------------------------
      const replyPrompt = buildReplyPrompt(emailText, classificationResult);
      const rawReplyOutput = await this.llmService.callGemini(replyPrompt);

      replyDraftResult = LeadReplySchema.parse(
        parseJsonObjectFromLlmText(rawReplyOutput),
      );

      // ----------------------------------------------------------------
      // CHAIN 3: DEFENSIVE QUALITY COMPLIANCE AUDIT (Groq Guardrail)
      // ----------------------------------------------------------------
      const judgePrompt = buildJudgePrompt(emailText, classificationResult, replyDraftResult.draft_reply);
      const rawJudgeOutput = await this.llmService.callGroq(judgePrompt);

      judgeResult = LeadJudgeSchema.parse(
        parseJsonObjectFromLlmText(rawJudgeOutput),
      );

      // ----------------------------------------------------------------
      // ROUTING INTERPRETER: Map Audit Decisions directly to Workflow States
      // ----------------------------------------------------------------
      if (judgeResult.decision === 'accept') {
        finalAction = 'approved_auto_reply';
      } else if (judgeResult.decision === 'edit') {
        finalAction = 'pending_manual_edit';
      } else {
        finalAction = 'rejected_by_judge';
      }

      // return await this.saveAndReturnPayload({
      //   emailText,
      //   classification: classificationResult,
      //   replyDraft: replyDraftResult.draft_reply,
      //   judgeResult: judgeResult,
      //   actionTaken: finalAction,
      //   startTime,
      //   activeGroup,
      //   promptVersion
      // });


      return await this.saveAndReturnPayload({
        emailText,
        classification: classificationResult,
        replyDraft: replyDraftResult.draft_reply,
        suggestedAction: replyDraftResult.suggested_action, // <--- EXPOSE THE ACTION
        judgeResult: judgeResult,
        actionTaken: finalAction,
        startTime,
        activeGroup,
        promptVersion
      });

    } catch (error) {
      // Defensive Fallback Logging: Ensure processing history isn't lost if parsing or execution fails
      this.logger.error(`Pipeline runtime collapse: ${error.message}`, error.stack);

      const executionTime = Date.now() - startTime;
      const errorLog = this.logRepository.create({
        emailText,
        classification: classificationResult || { error: 'Failed during classification stage' },
        replyDraft: replyDraftResult?.draft_reply || null,
        judgeResult: judgeResult || { error: `Pipeline collapsed at runtime: ${error.message}` },
        abTestMetadata: { test_name: experimentKey, group: activeGroup, prompt_version: promptVersion },
        actionTaken: 'pipeline_error_escalated',
        processingTimeMs: executionTime,
      });
      await this.logRepository.save(errorLog);

      throw new InternalServerErrorException(`Lead execution chain encountered an optimization error: ${error.message}`);
    }
  }

  /**
   * Helper utility to normalize data saving and maintain consistent analytics payloads.
   */
  private async saveAndReturnPayload(params: {
    emailText: string; classification: any; replyDraft: string | null;
    suggestedAction?: string | null; // <--- ADD THIS PARAMETER
    judgeResult: any; actionTaken: string; startTime: number;
    activeGroup: 'A' | 'B'; promptVersion: string;
  }): Promise<any> {
    const processingTimeMs = Date.now() - params.startTime;

    const abTestMetadata = {
      test_name: 'lead_classifier_strategy',
      group: params.activeGroup,
      prompt_version: params.promptVersion,
      judge_score: params.judgeResult?.overall_score || null,
      human_escalation: params.classification?.requires_human || false,
      processing_time_ms: processingTimeMs,
    };

    // Performance Audit Log
    this.logger.debug(`[LEAD_PIPELINE_EXECUTION] Action: ${params.actionTaken} | Time: ${processingTimeMs}ms`);

    const logRecord = this.logRepository.create({
      emailText: params.emailText,
      classification: params.classification,
      replyDraft: params.replyDraft,
      judgeResult: params.judgeResult,
      abTestMetadata,
      actionTaken: params.actionTaken,
      processingTimeMs,
    });

    const savedRecord = await this.logRepository.save(logRecord);

    // Return an explicit, clean JSON contract designed for easy structural mapping inside n8n nodes
    return {
      logId: savedRecord.id,
      // action: savedRecord.actionTaken,
      pipeline_status: savedRecord.actionTaken, // Renamed so it doesn't conflict with suggestedAction
      n8n_route_action: params.suggestedAction || 'escalate_manually', // <--- n8n WILL READ THIS
      processingTimeMs,
      classification: {
        category: params.classification?.category,
        confidence: params.classification?.confidence,
        reasoning: params.classification?.reasoning_summary,
        extracted: params.classification?.extracted_data,
      },
      reply: params.replyDraft,
      audit: params.judgeResult ? {
        decision: params.judgeResult.decision,
        score: params.judgeResult.overall_score,
        feedback: params.judgeResult.feedback,
      } : null,
    };
  }
}

