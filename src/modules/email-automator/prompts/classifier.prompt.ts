// prompts/classifier.prompt.ts

// Version A: Professional, strict
const CLASSIFIER_SYSTEM_PROMPT_A = `
You are an email classifier. Be concise and professional.
Categories: refund_request, technical_issue, sales_inquiry, spam.
Output only valid JSON. No prose outside JSON.
`;

// Version B: Empathetic, warm (reasoning reflected in reasoning_summary field)
const CLASSIFIER_SYSTEM_PROMPT_B = `
You are an empathetic email classifier. Understand the customer's situation.
Categories: refund_request, technical_issue, sales_inquiry, spam.
Infer intent carefully; put a concise rationale in reasoning_summary only.
Respond with JSON only, following the schema in the instructions below (no markdown or commentary).
`;

export function buildClassifierPrompt(emailText: string, group: 'A' | 'B'): string {
  const systemPrompt = group === 'A' ? CLASSIFIER_SYSTEM_PROMPT_A : CLASSIFIER_SYSTEM_PROMPT_B;

  const shapeHint = `
Required JSON keys: category (enum string), confidence (0-1), requires_human (boolean), reasoning_summary (max 200 chars).
Optional keys: extracted_order_id (string), extracted_email (string email only if clearly present).

Example output shape:
{"category":"refund_request","confidence":0.95,"requires_human":false,"reasoning_summary":"short rationale"}`;

  const fewShotExamples =
    group === 'A'
      ? `${shapeHint}

Examples:
Email: "Refund me"
Output: {"category":"refund_request","confidence":0.85,"requires_human":false,"reasoning_summary":"explicit refund wording"}`
      : `${shapeHint}

Examples:
Email: "I'm really frustrated. Order #123 never arrived. Can I get my money back please?"
Output: {"category":"refund_request","confidence":0.96,"extracted_order_id":"123","requires_human":false,"reasoning_summary":"frustrated customer, explicit refund with order hint"}`;

  return `${systemPrompt}\n${fewShotExamples}\n\nEmail: ${emailText}\n\nOutput JSON only:`;
}
