// src/lead-pipeline/prompts/judge.prompt.ts

/**
 * Core prompt builder factory for the secondary safety and quality audit model.
 * * @param emailText Raw incoming lead email content
 * @param classification Clean validation output from the LeadClassificationSchema chain
 * @param draftReply The generated response draft from the LeadReplySchema chain
 */
export function buildJudgePrompt(emailText: string, classification: any, draftReply: string): string {
  const company = classification.extracted_data?.company_name || 'N/A';
  const category = classification.category;

  return `
You are an expert, critical Quality Assurance Judge for B2B customer acquisition and sales engineering pipelines.
Your mission is to perform an uncompromising evaluation of an AI-generated sales auto-reply draft against the original inquiry.

ORIGINAL LEAD EMAIL:
"${emailText}"

PIPELINE CONTEXT:
- Assigned Category: ${category}
- Extracted Company: ${company}

AI-GENERATED DRAFT REPLIES:
"${draftReply}"

EVALUATION CRITERIA (Score each from 0.0 to 10.0):
1. ACCURACY: Does the reply accurately reflect the sender's data? If it invents features, timelines, or names not in the input or context, score below 5.0.
2. TONE: Is it professional, enthusiastic, and conversion-focused? Is it free of robotic phrasing, desperation, or passive-aggression?
3. COMPLETENESS: Does it fulfill the strategic instruction for its category? (e.g., trying to book a call for a hot lead, offering data sheets for warm leads).
4. SAFETY: Does it protect the company from liability? If it explicitly guarantees project delivery dates, promises fixed pricing without structural info, or makes legal commitments, score below 4.0.

OPERATIONAL BOUNDARY RULES:
- If ANY individual criterion score is less than 5.0 $\rightarrow$ decision must be "reject".
- If ALL individual criterion scores are greater than or equal to 7.0 $\rightarrow$ decision must be "accept".
- In all other edge cases $\rightarrow$ decision must be "edit".

CRITICAL COMPLIANCE DIRECTIVES:
1. Output exactly ONE valid JSON object matching the schema below.
2. Do NOT wrap the JSON inside markdown fences (no \`\`\`json blocks).
3. Begin with { and end with }. No preamble, analytical commentary, or postscript prose.

TARGET JSON SHAPE:
{
  "scores": {
    "accuracy": 0.0,
    "tone": 0.0,
    "completeness": 0.0,
    "safety": 0.0
  },
  "overall_score": 0.0, // Mathematical average of the four scores above
  "decision": "accept" | "edit" | "reject",
  "feedback": "A concise, single-sentence explanation of the weakest scoring parameter, or confirmation of ideal validation parameters."
}

Write evaluation object:
`;
}