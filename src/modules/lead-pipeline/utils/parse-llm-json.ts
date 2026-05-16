/**
 * LLMs often prefix prose ("To evaluate...") or wrap JSON in markdown fences.
 * This extracts the first top-level JSON object so JSON.parse + Zod can succeed.
 */
export function parseJsonObjectFromLlmText(raw: string): unknown {
  let text = raw.trim();

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    text = fenced[1].trim();
  }

  const start = text.indexOf('{');
  if (start === -1) {
    throw new SyntaxError('No JSON object found in model output');
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }

    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const slice = text.slice(start, i + 1);
        return JSON.parse(slice) as unknown;
      }
    }
  }

  throw new SyntaxError('Unbalanced or incomplete JSON object in model output');
}
