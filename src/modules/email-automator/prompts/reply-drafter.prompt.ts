// prompts/reply-drafter.prompt.ts
export function buildReplyPrompt(emailText: string, classification: any): string {
    return `
  You are a customer support email writer.
  
  ORIGINAL EMAIL:
  ${emailText}
  
  CLASSIFICATION:
  - Category: ${classification.category}
  - Confidence: ${classification.confidence}
  - Order ID: ${classification.extracted_order_id || 'Not provided'}
  
  INSTRUCTIONS BASED ON CATEGORY:
  ${
    classification.category === 'refund_request' 
      ? `- Apologize for the issue
  - Confirm refund process (5-7 business days)
  - Ask for patience
  - End with "Reference number: REF-${Date.now()}"` 
      
    : classification.category === 'technical_issue'
      ? `- Acknowledge the frustration
  - Request specific details (screenshots, browser version)
  - Promise escalation to technical team
  - Provide estimated response time: 24 hours`
      
    : classification.category === 'sales_inquiry'
      ? `- Answer directly and enthusiastically
  - Include pricing if relevant
  - End with a clear call-to-action (link to pricing page)`
      
    : 'No reply needed (spam)'
  }
  
  RULES:
  - Keep under 150 words
  - Professional but warm tone
  - Include order ID if available
  - Output ONLY valid JSON
  
  OUTPUT FORMAT:
  {
    "draft_reply": "your reply here",
    "tone_used": "empathetic" | "professional" | "urgent",
    "includes_action_item": true | false
  }
  
  Write reply:
  `;
  }