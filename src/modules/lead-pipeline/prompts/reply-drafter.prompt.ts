// src/lead-pipeline/prompts/reply-drafter.prompt.ts

/**
 * Core prompt builder factory for generating context-aware sales auto-replies.
 * * @param emailText Raw incoming lead email content
 * @param classification Clean, validated output from the LeadClassificationSchema chain
 */
export function buildReplyPrompt(emailText: string, classification: any): string {
  // Extract context from prior classification step to feed directly into the prompt context
  const category = classification.category;
  const company = classification.extracted_data?.company_name || 'your company';
  const timeline = classification.extracted_data?.project_timeline || 'the upcoming timeline';

  // Dynamic instruction engine mapping actions based on pipeline qualification criteria
  let categorySpecificInstructions = '';

  if (category === 'hot_lead') {
    categorySpecificInstructions = `
- Express strong, energetic appreciation for reaching out from ${company}.
- Acknowledge their mentioned timeline (${timeline}) as a helpful target, but DO NOT guarantee our capacity or delivery until a scoping call is completed.
- Keep the message warm, ultra-professional, and forward-looking.
- Set the suggested_action to "book_call" to trigger calendar scheduling downstream in n8n.
`;
  } else if (category === 'warm_lead') {
    categorySpecificInstructions = `
- Acknowledge their interest with high enthusiasm and professionalism.
- Provide a brief, high-level overview validating that we build advanced automation and custom backend architectures matching their inquiry.
- Offer to send over a detailed pricing or capabilities sheet as a low-friction next step.
- Set the suggested_action to "send_pricing_sheet".
`;
  } else if (category === 'cold_lead' || category === 'support_request') {
    categorySpecificInstructions = `
- Keep the response brief, respectful, and structured.
- For cold leads: Politely inform them that we will review their requirements and get back if there is a mutual alignment. Set suggested_action to "escalate_manually".
- For support requests: Politely guide them to our dedicated technical support desk or clarify that a representative will handle their maintenance ticket. Set suggested_action to "escalate_manually".
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
You are an elite Sales Development Representative (SDR) writing a personalized, concise follow-up email.

ORIGINAL INBOUND EMAIL:
"${emailText}"

PRIOR DISCOVERY METRICS:
- Assigned Category: ${category}
- Model Confidence: ${classification.confidence}
- Company Identified: ${company}
- Target Timeline: ${timeline}

INSTRUCTIONS FOR THIS SPECIFIC LEAD CLASSIFICATION:
${categorySpecificInstructions}

CRITICAL BUSINESS GUARDRAILS:
1. NEVER guarantee a delivery timeline or a final project price in the initial email. 
2. If the user mentions a budget, acknowledge it as a "helpful starting point for our scoping," but explicitly state that a technical discovery call is required before committing to final numbers.
3. Your ONLY goal is to acknowledge their specific needs, prove competence, and push them toward booking a 15-minute discovery call.
4. Keep the tone professional, slightly restrained, and highly consultative.

STRICT WRITING RULES:
1. Keep the drafted email strictly under 150 words. Long sales emails do not get read.
2. Maintain a professional yet highly engaging and warm tone. Avoid sounding mechanical or robotic.
3. Do not include raw placeholders like "[Insert Date Here]" or "[Your Name]". Write the text as a complete, ready-to-review draft.
4. Output ONLY valid JSON matching the format directive exactly. No prose, preamble, or markdown blocks.

TARGET OUTPUT FORMAT DIRECTIVE:
{
  "draft_reply": "Your complete drafted response email here.",
  "tone_used": "professional" | "enthusiastic" | "warm",
  "suggested_action": "book_call" | "send_pricing_sheet" | "escalate_manually" | "archive"
}

Write response object:
`;
}