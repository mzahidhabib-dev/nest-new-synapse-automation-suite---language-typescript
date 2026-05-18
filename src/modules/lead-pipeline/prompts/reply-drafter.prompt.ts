// src/lead-pipeline/prompts/reply-drafter.prompt.ts

/**
 * Core prompt builder factory for generating context-aware auto-replies across all business verticals.
 * @param emailText Raw incoming lead email content
 * @param classification Clean, validated output from the LeadClassificationSchema chain
 */
export function buildReplyPrompt(emailText: string, classification: any): string {
  // Extract context from prior classification step to feed directly into the prompt context
  const category = classification.category;
  const company = classification.extracted_data?.company_name || 'your company';
  const timeline = classification.extracted_data?.project_timeline || 'the upcoming timeline';
  const role = classification.extracted_data?.role_applied_for || 'the open position';

  // Dynamic instruction engine mapping actions based on pipeline qualification criteria
  let categorySpecificInstructions = '';

  if (category === 'hot_lead') {
    categorySpecificInstructions = `
- Express strong, energetic appreciation for reaching out from ${company}.
- State that we will map out the feasibility of their timeline (${timeline}) and budget during our discovery call.
- Keep the message warm, ultra-professional, and forward-looking.
- Set the suggested_action to "book_call" to trigger calendar scheduling downstream in n8n.
`;
  } else if (category === 'support_request') {
    categorySpecificInstructions = `
- Acknowledge the reported issue or question with high empathy and professionalism.
- Assure the user that our technical support team has received the ticket and is actively investigating.
- Do not promise an immediate fix or give a strict timeline for resolution.
- Set the suggested_action to "escalate_to_support".
`;
  } else if (category === 'hr_screening') {
    categorySpecificInstructions = `
- Thank the applicant for their interest in joining the team and applying for the ${role} role.
- State that the hiring team is currently reviewing their application materials and will reach out if their profile aligns with our current needs.
- Do not guarantee an interview or provide a hiring timeline.
- Set the suggested_action to "escalate_to_hr".
`;
  } else if (category === 'cold_lead') {
    categorySpecificInstructions = `
- Keep the response brief, respectful, and structured.
- Politely inform them that we will review their requirements and reach out if there is mutual alignment.
- Set the suggested_action to "escalate_manually".
`;
  } else {
    // Catch-all for spam or irrelevant bulk data
    categorySpecificInstructions = `
- Do not draft a standard outbound message. 
- Set draft_reply to a brief placeholder string like "Irrelevant inbound pipeline tracking."
- Set suggested_action to "archive".
`;
  }

  return `
You are an elite Corporate Communications Agent handling inbound inquiries for Sales, Technical Support, and Human Resources.
Your objective is to write a highly personalized, concise follow-up email based on the inquiry type.

ORIGINAL INBOUND EMAIL:
"${emailText}"

PRIOR DISCOVERY METRICS:
- Assigned Category: ${category}
- Model Confidence: ${classification.confidence}
- Company Identified: ${company}
- Target Timeline: ${timeline}
- Role Applied For (if applicable): ${role}

INSTRUCTIONS FOR THIS SPECIFIC CLASSIFICATION:
${categorySpecificInstructions}

CRITICAL BUSINESS GUARDRAILS:
1. NEVER guarantee a delivery timeline, bug resolution time, or project price in the initial email. 
2. NEVER guarantee a job interview or job offer.
3. If the user mentions a budget, acknowledge it as a "helpful starting point," but state that a technical discovery call is required.
4. Align your core goal to the category: Sales needs discovery calls, Support needs reassurance, HR needs polite expectation management.
5. Keep the tone professional, slightly restrained, and highly consultative.

STRICT WRITING RULES:
1. Keep the drafted email strictly under 150 words.
2. Do not include raw placeholders like "[Insert Date Here]" or "[Your Name]". Write the text as a complete, ready-to-send draft.
3. Output ONLY valid JSON matching the format directive exactly. No prose, preamble, or markdown blocks.

TARGET OUTPUT FORMAT DIRECTIVE:
{
  "draft_reply": "Your complete drafted response email here.",
  "tone_used": "professional" | "enthusiastic" | "empathetic",
  "suggested_action": "book_call" | "escalate_to_support" | "escalate_to_hr" | "escalate_manually" | "archive"
}

Write response object:
`;
}