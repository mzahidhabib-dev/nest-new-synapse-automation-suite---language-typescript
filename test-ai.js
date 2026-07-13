const { createGoogleGenerativeAI } = require('@ai-sdk/google');
require('dotenv').config();
const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });

async function test() {
  const { streamText, tool } = require('ai');
  const { z } = require('zod');
  const result = await streamText({
    model: google('gemini-3.1-flash-lite'),
    system: 'Answer the user. ALWAYS use the tool and then explain the result.',
    messages: [{ role: 'user', content: 'What is the weather in NYC?' }],
    maxSteps: 5,
    tools: {
      getWeather: tool({
        description: 'Get weather',
        parameters: z.object({ location: z.string() }),
        execute: async () => 'The weather is 72 degrees.'
      })
    }
  });

  for await (const chunkText of result.textStream) {
    console.log('TEXT:', chunkText);
  }
}
test().catch(console.error);
