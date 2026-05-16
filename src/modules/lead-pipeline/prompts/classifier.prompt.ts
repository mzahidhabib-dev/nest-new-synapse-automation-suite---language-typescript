// src/lead-pipeline/prompts/classifier.prompt.ts

// VARIANT A: Strict BANT (Budget, Authority, Need, Timeline) Corporate Qualification Matrix
const SYSTEM_PROMPT_STRICT_BANT = `
You are an expert corporate sales discovery agent specializing in high-value B2B lead qualification.
Your objective is to analyze incoming sales emails and strictly qualify them using the BANT framework.

CRITICAL QUALIFICATION RULES:
- category must be "hot_lead" ONLY if the sender explicitly outlines a project scope AND hints at budget/timeline.
- category must be "warm_lead" if they ask for pricing, capabilities, or a meeting, but lack defined budgets or timelines.
- category must be "cold_lead" if it is a low-intent inquiry, generic outreach, or an explicit mismatch for professional services.
- category must be "support_request" if they are an existing customer seeking technical help or troubleshooting.
- category must be "spam" if the text is a job application, cold pitching, or unsolicited marketing.

Be highly critical. Do not inflate confidence scores.
`;

// VARIANT B: Loose Intent Agile Qualification Matrix (Focuses on relationship value and early signals)
const SYSTEM_PROMPT_LOOSE_INTENT = `
You are an agile growth-focused sales development representative. Your objective is to capture conversion intent early.
Your philosophy assumes that any conversation with an interested stakeholder is worth routing to the sales team.

CRITICAL QUALIFICATION RULES:
- category must be "hot_lead" if the sender shows strong genuine excitement, requests a phone/Zoom call, or asks about immediate implementation, even if budget isn't explicitly mentioned yet.
- category must be "warm_lead" if they are exploring options, asking introductory questions, or requesting a case study.
- category must be "cold_lead" only if there is zero logical alignment with business development.
- category must be "support_request" if they mention bugs, existing accounts, or customer portal issues.
- category must be "spam" if the text is clearly irrelevant automated bulk outreach.

Focus heavily on identifying the pain points or operational needs mentioned by the sender.
`;

/**
 * Core prompt builder factory.
 * Combines selected A/B testing strategy instructions with strict output constraints.
 * * @param emailText Raw string containing the inbound email body
 * @param group Active evaluation group determined by the deterministic hash config
 */
export function buildClassifierPrompt(emailText: string, group: 'A' | 'B'): string {
  const systemInstructions = group === 'A' ? SYSTEM_PROMPT_STRICT_BANT : SYSTEM_PROMPT_LOOSE_INTENT;

  // Enforces a structural blueprint mapping identically to LeadClassificationSchema in zod-schemas.ts
  const outputFormattingDirective = `
CRITICAL COMPLIANCE DIRECTIVES:
1. You must output exactly ONE valid JSON object. 
2. Do NOT wrap the JSON inside markdown code blocks (e.g., do not use \`\`\`json).
3. Do NOT include introductory prose or trailing explanations. Start with { and end with }.
4. Every key declared in the target shape below must be present. If a field under extracted_data cannot be found, populate it as null.

TARGET JSON SHAPE:
{
  "category": "hot_lead" | "warm_lead" | "cold_lead" | "support_request" | "spam",
  "confidence": 0.00, // Float between 0.00 and 1.00
  "requires_human": true | false, // Force true if text is highly confusing, angry, or ambiguous
  "reasoning_summary": "Extremely concise analysis of the commercial intent under 250 characters.",
  "extracted_data": {
    "company_name": "String extracted from text/domain signature, or null",
    "budget_mentioned": "String describing budget numbers/allowances, or null",
    "project_timeline": "String describing launch windows/deadlines, or null",
    "contact_phone": "String showing valid phone details, or null"
  }
}`;

  // Few-Shot Prompting to solidify structural execution alignment across models
  const implementationExamples = group === 'A'
    ? `
EXAMPLE EVALUATION EXECUTION:
Email Text: "Hey, I am the project manager at TechCorp. We need a backend API built by next month. We have allocated $15,000 for this first milestone. Can we talk?"
Output:
{"category":"hot_lead","confidence":0.98,"requires_human":false,"reasoning_summary":"Explicitly names company, immediate 1-month timeline, and sets clear $15k budget constraint meeting strict BANT parameters.","extracted_data":{"company_name":"TechCorp","budget_mentioned":"$15,000","project_timeline":"by next month","contact_phone":null}}`
    : `
EXAMPLE EVALUATION EXECUTION:
Email Text: "Hello, looked at your work and loved it! Let's get on a call tomorrow at 3 PM to see if you can help build our internal workflow tools. Thanks, Dave."
Output:
{"category":"hot_lead","confidence":0.92,"requires_human":false,"reasoning_summary":"High relationship intent signal. Immediate direct request for meeting indicates strong potential sales velocity.","extracted_data":{"company_name":null,"budget_mentioned":null,"project_timeline":"tomorrow","contact_phone":null}}`;

  return `${systemInstructions}\n${outputFormattingDirective}\n${implementationExamples}\n\nINPUT EMAIL TO EVALUATE:\n"${emailText}"\n\nOutput clean JSON response object following formatting directives strictly:`;
}