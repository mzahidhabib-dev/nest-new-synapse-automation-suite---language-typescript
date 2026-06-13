const { streamText } = require('ai');
const { createGoogleGenerativeAI } = require('@ai-sdk/google');

require('dotenv').config();
const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });

async function test() {
  const result = await streamText({
    model: google('gemini-3.1-flash-lite'),
    messages: [{ role: 'user', content: 'say hello' }],
    maxSteps: 5
  });

  for await (const chunk of result.fullStream) {
    console.log('CHUNK TYPE:', chunk.type);
    if (chunk.type === 'text-delta') {
      console.log('TEXT DELTA:', chunk);
    }
  }
}
test().catch(console.error);
