// src/lead-pipeline/prompts/classifier.prompt.ts

// VARIANT A: Strict Corporate Qualification Matrix
const SYSTEM_PROMPT_STRICT_BANT = `
You are an expert corporate discovery agent handling inbound routing.
Your objective is to classify incoming emails into specific business automation patterns.

CRITICAL QUALIFICATION RULES:
- category must be "hot_lead" if the sender outlines a project scope, requests a sales meeting, or hints at budget/timeline.
- category must be "cold_lead" if it is a vague business inquiry lacking clear intent to purchase or hire.
- category must be "support_request" if they are an existing customer reporting a bug, error, or seeking technical help.
- category must be "hr_screening" if the sender is applying for a job, submitting a resume, or inquiring about an open role.
- category must be "spam" if the text is unsolicited marketing, SEO pitching, or malicious.

Be highly critical. Do not inflate confidence scores.
`;

// VARIANT B: Loose Intent Agile Qualification Matrix
const SYSTEM_PROMPT_LOOSE_INTENT = `
You are an agile growth-focused routing agent. Your objective is to capture conversion intent and route operational emails accurately.

CRITICAL QUALIFICATION RULES:
- category must be "hot_lead" if the sender shows genuine excitement to hire us, requests a call, or asks about implementation.
- category must be "cold_lead" if they are exploring options but show low immediate intent.
- category must be "support_request" if they mention bugs, existing accounts, or customer portal issues.
- category must be "hr_screening" if they mention their career, attach a CV, or express interest in joining the team.
- category must be "spam" if the text is clearly irrelevant automated bulk outreach.

Focus heavily on the core operational need mentioned by the sender.
`;

/**
 * Core prompt builder factory.
 * Combines selected A/B testing strategy instructions with strict output constraints.
 * @param emailText Raw string containing the inbound email body
 * @param group Active evaluation group determined by the deterministic hash config
 */
export function buildClassifierPrompt(emailText: string, group: 'A' | 'B'): string {
  const systemInstructions = group === 'A' ? SYSTEM_PROMPT_STRICT_BANT : SYSTEM_PROMPT_LOOSE_INTENT;

  const outputFormattingDirective = `
CRITICAL COMPLIANCE DIRECTIVES:
1. You must output exactly ONE valid JSON object. 
2. Do NOT wrap the JSON inside markdown code blocks (e.g., do not use \`\`\`json).
3. Do NOT include introductory prose. Start with { and end with }.
4. ATTACHMENT RULE: Do NOT set "requires_human" to true just because the email mentions an "attachment", "resume", or "cover letter". You are only classifying the text.

TARGET JSON SHAPE:
{
  "category": "hot_lead" | "cold_lead" | "support_request" | "hr_screening" | "spam",
  "confidence": 0.00, // Float between 0.00 and 1.00
  "requires_human": true | false, // Force true ONLY if the text is legally threatening, deeply angry, or completely incomprehensible.
  "reasoning_summary": "Extremely concise analysis of the intent under 250 characters.",
  "extracted_data": {
    "company_name": "String extracted from text/domain signature, or null",
    "budget_mentioned": "String describing budget numbers/allowances, or null",
    "project_timeline": "String describing launch windows/deadlines, or null",
    "contact_phone": "String showing valid phone details, or null",
    "role_applied_for": "String describing the job title if hr_screening, otherwise null"
  }
}`;

  const implementationExamples = group === 'A'
    ? `
EXAMPLE EVALUATION EXECUTION:
Email Text: "Hi, I have 4 years of Node.js experience and would love to apply for the Senior Backend Developer role. Please find my cover letter attached."
Output:
{"category":"hr_screening","confidence":0.98,"requires_human":false,"reasoning_summary":"Explicit application for an open backend developer position. Includes reference to cover letter.","extracted_data":{"company_name":null,"budget_mentioned":null,"project_timeline":null,"contact_phone":null,"role_applied_for":"Senior Backend Developer"}}`
    : `
EXAMPLE EVALUATION EXECUTION:
Email Text: "Hello, looked at your work and loved it! Let's get on a call tomorrow at 3 PM to see if you can help build our internal workflow tools."
Output:
{"category":"hot_lead","confidence":0.92,"requires_human":false,"reasoning_summary":"High relationship intent signal. Immediate direct request for meeting indicates strong potential sales velocity.","extracted_data":{"company_name":null,"budget_mentioned":null,"project_timeline":"tomorrow","contact_phone":null,"role_applied_for":null}}`;

  return `${systemInstructions}\n${outputFormattingDirective}\n${implementationExamples}\n\nINPUT EMAIL TO EVALUATE:\n"${emailText}"\n\nOutput clean JSON response object following formatting directives strictly:`;
}