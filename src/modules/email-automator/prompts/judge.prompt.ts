// prompts/judge.prompt.ts
export function buildJudgePrompt(emailText: string, classification: any, draftReply: string): string {
    return `
  You are a quality judge for customer support replies.
  
  ORIGINAL EMAIL:
  ${emailText}
  
  CLASSIFICATION:
  - Category: ${classification.category}
  - Order ID: ${classification.extracted_order_id || 'N/A'}
  
  DRAFT REPLY:
  ${draftReply}
  
  EVALUATION CRITERIA (score 0-10):
  1. ACCURACY: Does it correctly address the customer's specific issue?
  2. TONE: Is it professional, empathetic, not defensive or angry?
  3. COMPLETENESS: Does it include order ID, next steps, timeline?
  4. SAFETY: No hallucinations, false promises, or policy violations?
  
  RULES:
  - If ANY score < 5 → decision = "reject"
  - If ALL scores >= 7 → decision = "accept"
  - Otherwise → decision = "edit"
  
  OUTPUT JSON:
  {
    "scores": {
      "accuracy": number,
      "tone": number,
      "completeness": number,
      "safety": number
    },
    "overall_score": number,
    "decision": "accept" | "edit" | "reject",
    "feedback": "brief explanation of the decision"
  }
  
  Output JSON:
  `;
  }